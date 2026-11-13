/* eslint-disable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectRemoteImage } from "../scripts/semantic-release-docker.mjs";

const validator = join(
  process.cwd(),
  "scripts/validate-release-activation.mjs",
);
const releaseWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/release.yaml"),
  "utf8",
);

function workflowJob(name: string): string {
  const match = releaseWorkflow.match(
    new RegExp(`\\n  ${name}:[\\s\\S]*?(?=\\n  [a-z-]+:|$)`, "u"),
  );
  return match?.[0] ?? "";
}

function runValidator(
  releaseEnabled: string,
  markerPath?: string,
): { output: string; status: number } {
  try {
    const output = execFileSync(process.execPath, [validator], {
      env: {
        ...process.env,
        RELEASE_ENABLED: releaseEnabled,
        ...(markerPath === undefined
          ? {}
          : { RELEASE_INITIALIZATION_MARKER: markerPath }),
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    const result = error as {
      status?: number;
      stderr?: string;
      stdout?: string;
    };
    return {
      status: result.status ?? 1,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
  }
}

describe("release activation contract", () => {
  it("keeps release permissions scoped to the gated publish job", () => {
    expect(releaseWorkflow).toMatch(
      /permissions:\n {2}contents: read\n\nconcurrency:/u,
    );
    expect(workflowJob("validation")).toContain(
      "    permissions:\n      contents: read",
    );
    expect(workflowJob("activation")).not.toContain("permissions:");
    expect(workflowJob("publish")).toContain(
      "    permissions:\n      contents: write\n      issues: write\n      packages: write\n      pull-requests: write",
    );
    expect(workflowJob("validation")).not.toMatch(
      /issues: write|pull-requests: write/u,
    );
    expect(workflowJob("activation")).not.toMatch(
      /issues: write|pull-requests: write/u,
    );
  });

  it("remains inactive when RELEASE_ENABLED is not true", () => {
    const result = runValidator("false", "/missing/marker.json");

    expect(result.status).toBe(0);
    expect(result.output).toContain("RELEASE_ALLOWED=false");
  });

  it("rejects activation without the W6 initialization marker", () => {
    const result = runValidator("true", "/missing/marker.json");

    expect(result.status).toBe(1);
    expect(result.output).toContain("RELEASE_ALLOWED=false");
  });

  it("rejects an empty or malformed initialization marker", () => {
    const directory = mkdtempSync(join(tmpdir(), "release-activation-"));
    const markerPath = join(directory, "initialization.json");
    writeFileSync(markerPath, JSON.stringify({}));

    try {
      const result = runValidator("true", markerPath);

      expect(result.status).toBe(1);
      expect(result.output).toContain("RELEASE_ALLOWED=false");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("allows activation only with a valid W6 initialization marker", () => {
    const directory = mkdtempSync(join(tmpdir(), "release-activation-"));
    const markerPath = join(directory, "initialization.json");
    writeFileSync(
      markerPath,
      JSON.stringify({ schemaVersion: 1, applicationName: "example-bot" }),
    );

    try {
      const result = runValidator("true", markerPath);

      expect(result.status).toBe(0);
      expect(result.output).toContain("RELEASE_ALLOWED=true");
      expect(result.output).toContain("APPLICATION_NAME=example-bot");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const validChallenge =
  'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:example/robot:pull"';

function registryResponse(
  body: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(body, { status, headers });
}

function configureRegistryEnvironment(): void {
  vi.stubEnv("GITHUB_REPOSITORY", "Example/Robot");
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("GITHUB_ACTOR", "test-actor");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GHCR authentication boundary", () => {
  it("authenticates against the exact GHCR token endpoint", async () => {
    configureRegistryEnvironment();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        registryResponse("", 401, { "www-authenticate": validChallenge }),
      )
      .mockResolvedValueOnce(
        registryResponse(JSON.stringify({ token: "registry-token" }), 200),
      )
      .mockResolvedValueOnce(
        registryResponse(JSON.stringify({ schemaVersion: 2 }), 200, {
          "docker-content-digest": "sha256:abc",
        }),
      );

    const result = await inspectRemoteImage("1.2.3");
    const tokenRequest = fetchMock.mock.calls[1];
    const manifestRequest = fetchMock.mock.calls[2];

    expect(result).toEqual({
      exists: true,
      reference: "ghcr.io/example/robot:1.2.3",
      digest: "sha256:abc",
    });
    expect(String(tokenRequest[0])).toBe(
      "https://ghcr.io/token?service=ghcr.io&scope=repository%3Aexample%2Frobot%3Apull",
    );
    expect(tokenRequest[1]).toMatchObject({ redirect: "error" });
    expect(tokenRequest[1]?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("test-actor:test-token").toString("base64")}`,
    });
    expect(manifestRequest[1]).toMatchObject({ redirect: "error" });
    expect(manifestRequest[1]?.headers).toMatchObject({
      Authorization: "Bearer registry-token",
    });
  });

  it.each([
    "https://evil.example/token",
    "http://ghcr.io/token",
    "https://ghcr.io.evil.example/token",
    "https://ghcr.io:8443/token",
    "https://ghcr.io/other",
    "https://ghcr.io/%74oken",
    'https://ghcr.io/token"broken',
  ])("rejects an untrusted realm: %s", async realm => {
    configureRegistryEnvironment();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      registryResponse("", 401, {
        "www-authenticate": `Bearer realm="${realm}",service="ghcr.io",scope="repository:example/robot:pull"`,
      }),
    );

    await expect(inspectRemoteImage("1.2.3")).rejects.toThrow(
      /untrusted|unsupported authentication realm|unsupported authentication challenge/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("rejects malformed challenges before requesting a token", async () => {
    configureRegistryEnvironment();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      registryResponse("", 401, {
        "www-authenticate":
          'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope=',
      }),
    );

    await expect(inspectRemoteImage("1.2.3")).rejects.toThrow(
      "unsupported authentication challenge",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats only HTTP 404 as image absence", async () => {
    configureRegistryEnvironment();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(registryResponse("", 404));

    await expect(inspectRemoteImage("1.2.3")).resolves.toEqual({
      exists: false,
      reference: "ghcr.io/example/robot:1.2.3",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([302, 307, 401, 403, 429, 500, 503])(
    "fails closed for an initial HTTP %s response",
    async status => {
      configureRegistryEnvironment();
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(registryResponse("", status));

      await expect(inspectRemoteImage("1.2.3")).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    },
  );

  it("rejects a token endpoint redirect without following it", async () => {
    configureRegistryEnvironment();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        registryResponse("", 401, { "www-authenticate": validChallenge }),
      )
      .mockResolvedValueOnce(
        registryResponse("", 302, { location: "https://evil.example" }),
      );

    await expect(inspectRemoteImage("1.2.3")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: "error" });
  });

  it("rejects an authenticated manifest redirect without following it", async () => {
    configureRegistryEnvironment();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        registryResponse("", 401, { "www-authenticate": validChallenge }),
      )
      .mockResolvedValueOnce(
        registryResponse(JSON.stringify({ token: "registry-token" }), 200),
      )
      .mockResolvedValueOnce(
        registryResponse("", 302, { location: "https://evil.example" }),
      );

    await expect(inspectRemoteImage("1.2.3")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ redirect: "error" });
  });
});

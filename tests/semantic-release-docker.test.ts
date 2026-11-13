/* eslint-disable @typescript-eslint/no-unsafe-call */

import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishImage } from "../scripts/semantic-release-docker.mjs";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const commitSha = "a".repeat(40);

function configureImageInspection(): void {
  vi.mocked(execFileSync).mockImplementation((_command, args) => {
    const dockerArgs = args as string[];
    if (dockerArgs[0] === "image" && dockerArgs[1] === "inspect") {
      return JSON.stringify({
        Architecture: "amd64",
        Os: "linux",
        Config: {
          Env: ["APP_VERSION=1.0.1", `APP_COMMIT_SHA=${commitSha}`],
          Labels: {
            "org.opencontainers.image.version": "1.0.1",
            "org.opencontainers.image.revision": commitSha,
          },
        },
        RepoDigests: ["ghcr.io/example/repository@sha256:existing"],
      });
    }
    return "";
  });
}

function configureEnvironment(): void {
  vi.stubEnv("GITHUB_REPOSITORY", "Example/Repository");
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("GITHUB_ACTOR", "test-actor");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Docker publication existing-image recovery", () => {
  it("pulls an existing remote image before inspecting and verifying it", async () => {
    configureEnvironment();
    configureImageInspection();
    const events: string[] = [];
    vi.mocked(execFileSync).mockImplementation((command, args, options) => {
      const dockerArgs = args as string[];
      if (dockerArgs[0] === "pull") {
        events.push("pull");
      }
      if (dockerArgs[0] === "image" && dockerArgs[1] === "inspect") {
        events.push("inspect");
      }
      return configureDockerOutput(command, args, options);
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemaVersion: 2 }), {
        status: 200,
        headers: { "docker-content-digest": "sha256:existing" },
      }),
    );

    await expect(publishImage("1.0.1", commitSha)).resolves.toMatchObject({
      exists: true,
      digest: "sha256:existing",
    });

    expect(events).toEqual(["pull", "inspect"]);
    expect(execFileSync).not.toHaveBeenCalledWith(
      "docker",
      ["push", "ghcr.io/example/repository:1.0.1"],
      expect.anything(),
    );
  });

  it("fails closed on existing-image metadata mismatch without pushing", async () => {
    configureEnvironment();
    configureImageInspection();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemaVersion: 2 }), {
        status: 200,
        headers: { "docker-content-digest": "sha256:existing" },
      }),
    );
    vi.mocked(execFileSync).mockImplementation((_command, args) => {
      const dockerArgs = args as string[];
      if (dockerArgs[0] === "image" && dockerArgs[1] === "inspect") {
        return JSON.stringify({
          Architecture: "amd64",
          Os: "linux",
          Config: { Env: [], Labels: {} },
          RepoDigests: [],
        });
      }
      return "";
    });

    await expect(publishImage("1.0.1", commitSha)).rejects.toThrow(
      "Docker metadata mismatch",
    );
    expect(execFileSync).not.toHaveBeenCalledWith(
      "docker",
      ["push", "ghcr.io/example/repository:1.0.1"],
      expect.anything(),
    );
  });
});

function configureDockerOutput(
  _command: string,
  args: readonly string[],
  _options: unknown,
): string {
  const dockerArgs = args as string[];
  if (dockerArgs[0] === "image" && dockerArgs[1] === "inspect") {
    return JSON.stringify({
      Architecture: "amd64",
      Os: "linux",
      Config: {
        Env: ["APP_VERSION=1.0.1", `APP_COMMIT_SHA=${commitSha}`],
        Labels: {
          "org.opencontainers.image.version": "1.0.1",
          "org.opencontainers.image.revision": commitSha,
        },
      },
      RepoDigests: ["ghcr.io/example/repository@sha256:existing"],
    });
  }
  return "";
}

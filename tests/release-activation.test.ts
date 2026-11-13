import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

const validator = join(
  process.cwd(),
  "scripts/validate-release-activation.mjs",
);

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

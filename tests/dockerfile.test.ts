import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
const releaseDockerScript = readFileSync(
  join(process.cwd(), "scripts/semantic-release-docker.mjs"),
  "utf8",
);

describe("Docker base-image contract", () => {
  it("pins both stages to the same immutable Node 24 Bookworm slim identity", () => {
    const references = [...dockerfile.matchAll(/^FROM (\S+) AS /gmu)].map(
      match => match[1],
    );

    expect(references).toHaveLength(2);
    expect(references[0]).toMatch(
      /^node:24-bookworm-slim@sha256:[0-9a-f]{64}$/u,
    );
    expect(references[1]).toBe(references[0]);
  });

  it("preserves the linux/amd64 release build contract", () => {
    expect(releaseDockerScript).toContain('"linux/amd64"');
    expect(dockerfile).not.toContain("node:24-bookworm-slim AS");
  });
});

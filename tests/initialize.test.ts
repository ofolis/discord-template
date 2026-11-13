/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/explicit-function-return-type, require-await */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  initializeRepository,
  parseArguments,
  replaceFile,
} from "../scripts/initialize.mjs";

const repositoryRoot = process.cwd();
const fixtures: string[] = [];

function fixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), "discord-template-init-"));
  fixtures.push(cwd);
  for (const file of [
    "package.json",
    "package-lock.json",
    "readme.md",
    "Dockerfile",
    "compose.yaml",
  ]) {
    cpSync(join(repositoryRoot, file), join(cwd, file));
  }
  cpSync(join(repositoryRoot, ".github"), join(cwd, ".github"), {
    recursive: true,
  });
  cpSync(join(repositoryRoot, "scripts"), join(cwd, "scripts"), {
    recursive: true,
  });
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["add", "."], { cwd });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-qm",
      "baseline",
    ],
    { cwd },
  );
  return cwd;
}

function commit(cwd: string): void {
  execFileSync("git", ["add", "."], { cwd });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd },
  );
}

function args(description = "A bot for testing."): string[] {
  return [
    "--package-name",
    "example-bot",
    "--application-name",
    "Example Bot",
    "--description",
    description,
  ];
}

afterEach(() => {
  for (const cwd of fixtures.splice(0))
    rmSync(cwd, { recursive: true, force: true });
});

describe("initializer input validation", () => {
  it.each([
    [[] as string[], "Usage"],
    [
      ["--package-name", "Bad Name", "--application-name", "Bot"],
      "valid npm package name",
    ],
    [
      ["--package-name", "discord-template", "--application-name", "Bot"],
      "must differ",
    ],
    [
      ["--package-name", "bot", "--application-name", "  "],
      "must not be empty",
    ],
    [
      ["--package-name", "bot", "--application-name", "Bo\n t"],
      "control characters",
    ],
    [
      [
        "--package-name",
        "bot",
        "--application-name",
        "Bot",
        "--description",
        "  ",
      ],
      "must not be empty",
    ],
  ])("rejects invalid arguments", (input, message) => {
    expect(() => parseArguments(input)).toThrow(message);
  });
});

describe("repository initialization", () => {
  it("updates identity, README, and marker without adding a version", async () => {
    const cwd = fixture();
    await expect(initializeRepository({ cwd, argv: args() })).resolves.toEqual({
      changed: true,
    });

    const packageJson = JSON.parse(
      readFileSync(join(cwd, "package.json"), "utf8"),
    );
    const lockJson = JSON.parse(
      readFileSync(join(cwd, "package-lock.json"), "utf8"),
    );
    const marker = JSON.parse(
      readFileSync(join(cwd, ".release/initialization.json"), "utf8"),
    );
    const readme = readFileSync(join(cwd, "readme.md"), "utf8");
    expect(packageJson).toMatchObject({
      name: "example-bot",
      description: "A bot for testing.",
    });
    expect(packageJson.version).toBeUndefined();
    expect(lockJson.name).toBe("example-bot");
    expect(lockJson.packages[""].name).toBe("example-bot");
    expect(lockJson.version).toBeUndefined();
    expect(marker).toEqual({
      schemaVersion: 1,
      applicationName: "Example Bot",
    });
    expect(readme).toContain("# Example Bot\n\nA bot for testing.");
    expect(readme).not.toContain("## Projects Using This");
    expect(readme).toContain("does not enable releases");
    expect(readme).toContain("Discord developer portal");
    expect(readFileSync(join(cwd, "Dockerfile"), "utf8")).toBe(
      readFileSync(join(repositoryRoot, "Dockerfile"), "utf8"),
    );
  });

  it("uses the default description and supports an identical clean rerun", async () => {
    const cwd = fixture();
    const first = await initializeRepository({
      cwd,
      argv: [
        "--package-name",
        "example-bot",
        "--application-name",
        "Example Bot",
      ],
    });
    expect(first.changed).toBe(true);
    commit(cwd);
    await expect(
      initializeRepository({
        cwd,
        argv: [
          "--package-name",
          "example-bot",
          "--application-name",
          "Example Bot",
        ],
      }),
    ).resolves.toEqual({ changed: false });
  });

  it("rejects conflicting reruns, malformed markers, and inconsistent identities", async () => {
    const cwd = fixture();
    await initializeRepository({ cwd, argv: args() });
    commit(cwd);
    await expect(
      initializeRepository({ cwd, argv: args("Different.") }),
    ).rejects.toThrow("do not match");

    const malformed = fixture();
    mkdirSync(join(malformed, ".release"));
    writeFileSync(join(malformed, ".release/initialization.json"), "{}");
    commit(malformed);
    await expect(
      initializeRepository({ cwd: malformed, argv: args() }),
    ).rejects.toThrow("malformed");

    const inconsistent = fixture();
    await initializeRepository({ cwd: inconsistent, argv: args() });
    writeFileSync(
      join(inconsistent, ".release/initialization.json"),
      JSON.stringify({ schemaVersion: 1, applicationName: "Other Bot" }),
    );
    commit(inconsistent);
    await expect(
      initializeRepository({ cwd: inconsistent, argv: args() }),
    ).rejects.toThrow("do not match");
  });

  it("refuses dirty or partially initialized repositories", async () => {
    const dirty = fixture();
    writeFileSync(
      join(dirty, "readme.md"),
      `${readFileSync(join(dirty, "readme.md"), "utf8")}\nLocal change\n`,
    );
    await expect(
      initializeRepository({ cwd: dirty, argv: args() }),
    ).rejects.toThrow("clean working tree");

    const partial = fixture();
    writeFileSync(
      join(partial, "package.json"),
      `${readFileSync(join(partial, "package.json"), "utf8")}\n`,
    );
    commit(partial);
    await expect(
      initializeRepository({ cwd: partial, argv: args() }),
    ).rejects.toThrow("untouched discord-template");
  });

  it("restores replaced files and removes the marker after a write failure", async () => {
    const cwd = fixture();
    let calls = 0;
    const original = readFileSync(join(cwd, "package.json"), "utf8");
    const replace = async (path: string, contents: string) => {
      calls += 1;
      if (calls === 4) throw new Error("simulated replacement failure");
      writeFileSync(path, contents);
    };
    await expect(
      initializeRepository({ cwd, argv: args(), replace }),
    ).rejects.toThrow("writing files");
    expect(readFileSync(join(cwd, "package.json"), "utf8")).toBe(original);
    expect(() =>
      readFileSync(join(cwd, ".release/initialization.json")),
    ).toThrow();
  });

  it("cleans up a temporary file after a replacement write failure", async () => {
    let temporaryPath = "";
    let cleanupPath = "";
    const operations = {
      writeFile: async (path: string) => {
        temporaryPath = path;
        writeFileSync(path, "partial temporary contents");
        throw new Error("simulated write failure");
      },
      rename: async () => {
        throw new Error("rename should not be reached");
      },
      remove: async (path: string) => {
        cleanupPath = path;
        rmSync(path, { force: true });
      },
    };
    const path = join(
      tmpdir(),
      `initializer-write-failure-${String(Date.now())}`,
    );
    await expect(replaceFile(path, "contents", operations)).rejects.toThrow(
      "simulated write failure",
    );
    expect(cleanupPath).toBe(temporaryPath);
    expect(() => readFileSync(temporaryPath)).toThrow();
  });

  it("continues rollback and reports initialization and rollback failures", async () => {
    const cwd = fixture();
    const calls: string[] = [];
    let replaceCalls = 0;
    const replace = async (path: string, contents: string) => {
      replaceCalls += 1;
      calls.push(`replace:${path}`);
      if (replaceCalls === 3) throw new Error("original README failure");
      if (replaceCalls === 4) throw new Error("package rollback failure");
      writeFileSync(path, contents);
    };
    const remove = async (path: string) => {
      calls.push(`remove:${path}`);
    };
    await expect(
      initializeRepository({ cwd, argv: args(), replace, remove }),
    ).rejects.toThrow(
      /original README failure.*rollback failures:.*package rollback failure/,
    );
    expect(calls).toHaveLength(6);
    expect(calls[3]).toContain("package-lock.json");
    expect(calls[4]).toContain("package.json");
    expect(calls[5]).toContain("initialization.json");
  });
});

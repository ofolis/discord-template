import * as discordJs from "discord.js";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const environmentKeys: string[] = [
  "DATA_DIRECTORY",
  "DISCORD_APPLICATION_ID",
  "DISCORD_BOT_TOKEN",
];
const originalEnvironment: Record<string, string | undefined> =
  Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  environmentKeys.forEach(key => {
    const value: string | undefined = originalEnvironment[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { force: true, recursive: true })),
  );
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importApplication(): Promise<void> {
  await import("../src/index");
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });
}

describe("application startup failures", () => {
  it("reports missing configuration without a secondary logging failure", async () => {
    delete process.env["DISCORD_APPLICATION_ID"];
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(importApplication()).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consoleError.mock.calls)).toContain("Error");
  });

  it("reports blank DATA_DIRECTORY without attempting Discord login", async () => {
    process.env["DATA_DIRECTORY"] = "   ";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(importApplication()).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("reports storage initialization failure through safe diagnostics", async () => {
    const parent: string = await mkdtemp(join(tmpdir(), "discord-template-"));
    temporaryDirectories.push(parent);
    const filePath: string = join(parent, "not-a-directory");
    await writeFile(filePath, "synthetic", "utf8");
    process.env["DATA_DIRECTORY"] = filePath;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.resetModules();
    const { JsonStore, reportStartupFailure } = await import("../src/core");
    let failure: unknown;
    try {
      await new JsonStore(filePath).initialize();
    } catch (reason: unknown) {
      failure = reason;
    }
    reportStartupFailure(failure);

    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("does not attempt Discord login when storage initialization fails", async () => {
    const parent: string = await mkdtemp(join(tmpdir(), "discord-template-"));
    temporaryDirectories.push(parent);
    const filePath: string = join(parent, "not-a-directory");
    await writeFile(filePath, "synthetic", "utf8");
    process.env["DATA_DIRECTORY"] = filePath;
    const login = vi
      .spyOn(discordJs.Client.prototype, "login")
      .mockResolvedValue("synthetic" as never);

    await importApplication();

    expect(login).not.toHaveBeenCalled();
  });
});

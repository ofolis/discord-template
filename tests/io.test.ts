import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Environment, IO } from "../src/core";

const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach(directory => {
    rmSync(directory, { force: true, recursive: true });
  });
});

describe("JSON persistence", () => {
  it("returns null for a missing file", () => {
    const directory: string = mkdtempSync(join(tmpdir(), "discord-template-"));
    temporaryDirectories.push(directory);
    vi.spyOn(Environment, "dataPath", "get").mockReturnValue(directory);

    expect(IO.loadData("missing")).toBeNull();
  });

  it("saves and loads serialized JSON data", () => {
    const directory: string = mkdtempSync(join(tmpdir(), "discord-template-"));
    temporaryDirectories.push(directory);
    vi.spyOn(Environment, "dataPath", "get").mockReturnValue(directory);
    const data = {
      enabled: true,
      nested: { count: 2 },
      tags: ["one", "two"],
    };

    IO.saveData("fixture", data);

    expect(IO.loadData("fixture")).toStrictEqual(data);
  });
});

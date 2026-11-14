import * as fs from "fs/promises";
import { chmod, mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    rename: vi.fn(actual.rename),
    writeFile: vi.fn(actual.writeFile),
  };
});

import type { JsonValue } from "../src/core";
import {
  CorruptJsonError,
  InvalidJsonValueError,
  InvalidStorageKeyError,
  JsonStore,
  ReentrantStorageOperationError,
  StorageOperationError,
} from "../src/core";

const temporaryDirectories: string[] = [];
const sparseArray: unknown[] = [];
sparseArray.length = 2;
sparseArray[1] = "sparse";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { force: true, recursive: true })),
  );
  vi.restoreAllMocks();
});

async function createStore(): Promise<{ directory: string; store: JsonStore }> {
  const directory: string = await mkdtemp(join(tmpdir(), "discord-template-"));
  temporaryDirectories.push(directory);
  const store: JsonStore = new JsonStore(directory);
  await store.initialize();
  return { directory, store };
}

describe("JsonStore", () => {
  it("initializes a nested data directory", async () => {
    const parent: string = await mkdtemp(join(tmpdir(), "discord-template-"));
    temporaryDirectories.push(parent);
    const directory: string = join(parent, "nested", "data");
    const store: JsonStore = new JsonStore(directory);

    await expect(store.initialize()).resolves.toBeUndefined();
    const stats = await fs.stat(directory);
    expect(stats.isDirectory()).toBe(true);
  });

  it("rejects a configured path that is a file", async () => {
    const parent: string = await mkdtemp(join(tmpdir(), "discord-template-"));
    temporaryDirectories.push(parent);
    const filePath: string = join(parent, "data");
    await writeFile(filePath, "not a directory", "utf8");

    await expect(new JsonStore(filePath).initialize()).rejects.toBeInstanceOf(
      StorageOperationError,
    );
  });

  it("returns null for a missing file", async () => {
    const { store } = await createStore();

    await expect(store.read("missing")).resolves.toBeNull();
  });

  it("round-trips JSON", async () => {
    const { store } = await createStore();
    const value = { enabled: true, nested: { count: 2 } };

    await store.write("fixture", value);

    await expect(store.read("fixture")).resolves.toStrictEqual(value);
  });

  it("round-trips valid primitive and array JSON values", async () => {
    const { store } = await createStore();

    await store.write("null-value", null);
    await store.write("array-value", ["one", 2, false]);

    await expect(store.read("null-value")).resolves.toBeNull();
    await expect(store.read("array-value")).resolves.toStrictEqual([
      "one",
      2,
      false,
    ]);
  });

  it.each(["", "../escape", "nested/path", "unsafe.json", "has space", "."])(
    "rejects unsafe storage key %j",
    async key => {
      const { store } = await createStore();

      await expect(store.read(key)).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
    },
  );

  it("distinguishes malformed and zero-byte files from missing files", async () => {
    const { directory, store } = await createStore();
    await writeFile(join(directory, "malformed.json"), "not json", "utf8");
    await writeFile(join(directory, "empty.json"), "", "utf8");

    await expect(store.read("malformed")).rejects.toBeInstanceOf(
      CorruptJsonError,
    );
    await expect(store.read("empty")).rejects.toBeInstanceOf(CorruptJsonError);
  });

  it("does not change corrupted files during reads or updates", async () => {
    const { directory, store } = await createStore();
    const contents: string = "{corrupt";
    await writeFile(join(directory, "corrupt.json"), contents, "utf8");

    await expect(store.read("corrupt")).rejects.toBeInstanceOf(
      CorruptJsonError,
    );
    await expect(
      store.update("corrupt", () => ({ repaired: true })),
    ).rejects.toBeInstanceOf(CorruptJsonError);
    await expect(
      fs.readFile(join(directory, "corrupt.json"), "utf8"),
    ).resolves.toBe(contents);
  });

  it("preserves the existing file when the temporary write fails", async () => {
    const { directory, store } = await createStore();
    await store.write("fixture", { version: 1 });
    await chmod(directory, 0o555);

    try {
      await expect(
        store.write("fixture", { version: 2 }),
      ).rejects.toBeInstanceOf(StorageOperationError);
    } finally {
      await chmod(directory, 0o755);
    }
    await expect(store.read("fixture")).resolves.toStrictEqual({ version: 1 });
    const files: string[] = await readdir(directory);
    expect(files.filter(file => file.endsWith(".tmp"))).toStrictEqual([]);
  });

  it("preserves the existing file when replacement rename fails", async () => {
    const { directory, store } = await createStore();
    await store.write("fixture", { version: 1 });
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error("synthetic rename"));

    await expect(store.write("fixture", { version: 2 })).rejects.toBeInstanceOf(
      StorageOperationError,
    );
    await expect(store.read("fixture")).resolves.toStrictEqual({ version: 1 });
    const files: string[] = await readdir(directory);
    expect(files.filter(file => file.endsWith(".tmp"))).toStrictEqual([]);
  });

  it("preserves the existing file when an update's final write fails", async () => {
    const { store } = await createStore();
    await store.write("fixture", { version: 1 });
    vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error("synthetic write"));

    await expect(
      store.update("fixture", () => ({ version: 2 })),
    ).rejects.toBeInstanceOf(StorageOperationError);
    await expect(store.read("fixture")).resolves.toStrictEqual({ version: 1 });
  });

  it("serializes same-key updates and allows independent keys", async () => {
    const { store } = await createStore();
    await store.write("counter", { count: 0 });
    const increment = async (): Promise<void> => {
      await store.update("counter", async current => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { count: ((current?.count as number | undefined) ?? 0) + 1 };
      });
    };

    await Promise.all([increment(), increment(), increment()]);
    await expect(store.read("counter")).resolves.toStrictEqual({ count: 3 });

    await Promise.all([
      store.update("one", () => {
        return { value: 1 };
      }),
      store.update("two", () => {
        return { value: 2 };
      }),
    ]);
    await expect(store.read("one")).resolves.toStrictEqual({ value: 1 });
    await expect(store.read("two")).resolves.toStrictEqual({ value: 2 });
  });

  it("rejects same-key reentrant operations without blocking cross-key work", async () => {
    const { store } = await createStore();
    await store.write("same", { count: 1 });
    await store.write("other", { count: 0 });

    await expect(
      store.update("same", async current => {
        await expect(store.read("same")).rejects.toBeInstanceOf(
          ReentrantStorageOperationError,
        );
        await expect(store.write("same", { count: 2 })).rejects.toBeInstanceOf(
          ReentrantStorageOperationError,
        );
        await expect(
          store.update("same", () => ({ count: 3 })),
        ).rejects.toBeInstanceOf(ReentrantStorageOperationError);
        await store.update("other", () => ({ count: 1 }));
        return current ?? { count: 1 };
      }),
    ).resolves.toStrictEqual({ count: 1 });

    await expect(store.read("same")).resolves.toStrictEqual({ count: 1 });
    await expect(store.read("other")).resolves.toStrictEqual({ count: 1 });
  });

  it("recovers the queue and preserves data after reentrancy rejection", async () => {
    const { store } = await createStore();
    await store.write("queue", { count: 1 });
    const failed: Promise<unknown> = store.update("queue", async () => {
      await store.read("queue");
      return { count: 2 };
    });
    const recovered: Promise<unknown> = store.update("queue", current => ({
      count: ((current?.count as number | undefined) ?? 0) + 1,
    }));

    await expect(failed).rejects.toBeInstanceOf(ReentrantStorageOperationError);
    await expect(recovered).resolves.toStrictEqual({ count: 2 });
    await expect(store.read("queue")).resolves.toStrictEqual({ count: 2 });
  });

  it("does not retain reentrancy context after a transaction completes", async () => {
    const { store } = await createStore();
    await store.write("detached", { count: 1 });
    let detachedRead: Promise<{ count: number } | null> | undefined;

    await store.update("detached", current => {
      detachedRead = new Promise((resolve, reject) => {
        setTimeout(() => {
          void store
            .read<{ count: number }>("detached")
            .then(resolve, (reason: unknown) => {
              reject(
                reason instanceof Error
                  ? reason
                  : new Error("Detached read failed."),
              );
            });
        }, 20);
      });
      return current ?? { count: 1 };
    });

    await expect(detachedRead).resolves.toStrictEqual({ count: 1 });
  });

  it.each([
    undefined,
    NaN,
    Infinity,
    -Infinity,
    -0,
    (): string => "unsupported",
    Symbol("unsupported"),
    new Date(),
    sparseArray,
    { nested: undefined },
    { nested: NaN },
  ])("rejects values that are not stable JSON: %j", async value => {
    const { store } = await createStore();
    const initial: JsonValue = { version: 1 };
    await store.write("fixture", initial);

    await expect(
      store.write("fixture", value as JsonValue),
    ).rejects.toBeInstanceOf(InvalidJsonValueError);
    await expect(store.read("fixture")).resolves.toStrictEqual(initial);
  });

  it("rejects bigint values before replacement", async () => {
    const { store } = await createStore();
    await store.write("fixture", { version: 1 });

    await expect(
      store.write("fixture", 1n as JsonValue),
    ).rejects.toBeInstanceOf(InvalidJsonValueError);
    await expect(store.read("fixture")).resolves.toStrictEqual({ version: 1 });
  });

  it("rejects circular and transforming JSON values before replacement", async () => {
    const { store } = await createStore();
    await store.write("fixture", { version: 1 });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const transforming: { toJSON: () => string } = {
      toJSON: () => "hidden",
    };

    await expect(
      store.write("fixture", circular as JsonValue),
    ).rejects.toBeInstanceOf(InvalidJsonValueError);
    await expect(
      store.write("fixture", transforming as JsonValue),
    ).rejects.toBeInstanceOf(InvalidJsonValueError);
    await expect(store.read("fixture")).resolves.toStrictEqual({ version: 1 });
  });

  it("rejects accessor properties without invoking them", async () => {
    const { store } = await createStore();
    await store.write("fixture", { version: 1 });
    let getterCalls: number = 0;
    const getterValue: Record<string, unknown> = {};
    Object.defineProperty(getterValue, "value", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 1;
      },
    });
    const setterValue: Record<string, unknown> = {};
    Object.defineProperty(setterValue, "value", {
      enumerable: true,
      set: () => {},
    });
    const nestedValue: Record<string, unknown> = {};
    Object.defineProperty(nestedValue, "value", {
      enumerable: true,
      get: () => 1,
    });
    const arrayValue: unknown[] = [1];
    Object.defineProperty(arrayValue, "0", {
      enumerable: true,
      get: () => 1,
    });

    for (const value of [
      getterValue,
      setterValue,
      { nested: nestedValue },
      arrayValue,
    ]) {
      await expect(
        store.write("fixture", value as JsonValue),
      ).rejects.toBeInstanceOf(InvalidJsonValueError);
    }
    expect(getterCalls).toBe(0);
    await expect(store.read("fixture")).resolves.toStrictEqual({ version: 1 });
  });

  it("continues a key queue after a failed operation", async () => {
    const { store } = await createStore();
    const failed: Promise<unknown> = store.update("queue", () => {
      throw new Error("synthetic");
    });
    const recovered: Promise<unknown> = store.update("queue", () => ({
      recovered: true,
    }));

    await expect(failed).rejects.toThrow("synthetic");
    await expect(recovered).resolves.toStrictEqual({ recovered: true });
  });

  it("drains accepted operations without rejecting for their failures", async () => {
    const { store } = await createStore();
    let release: (() => void) | undefined;
    const blocked: Promise<unknown> = store.update(
      "blocked",
      (): Promise<{ complete: boolean }> =>
        new Promise(resolve => {
          release = (): void => {
            resolve({ complete: true });
          };
        }),
    );
    const draining: Promise<void> = store.drain();
    let didDrain: boolean = false;
    void draining.then(
      () => {
        didDrain = true;
      },
      () => {
        didDrain = true;
      },
    );
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(didDrain).toBe(false);
    release?.();
    await expect(blocked).resolves.toStrictEqual({ complete: true });
    await expect(draining).resolves.toBeUndefined();
  });

  it("completes drain when an accepted operation fails", async () => {
    const { store } = await createStore();
    const failed: Promise<unknown> = store.update("failed", () => {
      throw new Error("synthetic failure");
    });

    await expect(store.drain()).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow("synthetic failure");
  });
});

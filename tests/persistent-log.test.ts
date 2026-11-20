import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Environment, Log, configurationError } from "../src/core";

const temporaryDirectories: string[] = [];

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: T | PromiseLike<T>) => void;
};

type PendingLogRecord = { readonly date: string; readonly record: string };

type LogInternals = {
  __writeRecord: (pending: PendingLogRecord) => Promise<void>;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise: Promise<T> = new Promise<T>(
    (resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    },
  );
  return { promise, reject, resolve };
}

async function createLogDirectory(): Promise<string> {
  const directory: string = await mkdtemp(
    join(tmpdir(), "discord-template-logs-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

async function readLogRecords(
  directory: string,
): Promise<Record<string, unknown>[]> {
  const files: string[] = (await readdir(directory)).filter(file =>
    file.endsWith(".jsonl"),
  );
  const contents: string[] = await Promise.all(
    files.map(file => readFile(join(directory, file), "utf8")),
  );
  return contents
    .flatMap(content => content.trim().split("\n"))
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

afterEach(async () => {
  await Log.flush(2_000);
  Log.resetForTests();
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { force: true, recursive: true })),
  );
});

describe("persistent logging", () => {
  it("does not persist records before initialization", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);

    Log.info("Console-only event.", { id: "fixture" });
    Log.event("PRE_INIT_EVENT", "INFO", { id: "fixture" });
    await Log.flush();

    expect(await readdir(directory)).toEqual([]);
  });

  it("writes JSONL with safe fields and excludes secrets and unknown fields", async () => {
    const directory: string = await createLogDirectory();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    Log.initialize({
      directory,
      devMode: true,
      now: () => new Date("2026-11-16T12:00:00.000Z"),
    });

    const error = Object.assign(new Error("token=synthetic-secret"), {
      code: "E_SYNTHETIC",
      stack: "synthetic stack",
    });
    Log.info("Request completed with token=synthetic-secret.", {
      id: "request-1",
      operation: "read",
      count: 2,
      result: { status: "ok", token: "synthetic-secret", unknown: "discarded" },
      token: "synthetic-secret",
      payload: { token: "synthetic-secret" },
    });
    Log.error("Operation failed.", error);
    await Log.flush();

    const records: Record<string, unknown>[] = await readLogRecords(directory);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      timestamp: "2026-11-16T12:00:00.000Z",
      severity: "INFO",
      message: "Application log event.",
      fields: {
        id: "request-1",
        operation: "read",
        count: 2,
        result: { status: "ok" },
      },
    });
    expect(records[1]).toMatchObject({
      severity: "ERROR",
      fields: { errorCode: "E_SYNTHETIC", errorName: "Error" },
    });
    expect(JSON.stringify(records)).not.toContain("synthetic-secret");
    expect(JSON.stringify(records)).not.toContain("synthetic stack");
    expect(JSON.stringify(records)).not.toContain("discarded");
    expect(JSON.stringify(consoleLog.mock.calls)).toContain(
      "Request completed with token=synthetic-secret.",
    );
  });

  it("persists trusted event identifiers while sanitizing event fields", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    Log.initialize({ directory, devMode: true });
    const error = Object.assign(new Error("token=synthetic-secret"), {
      stack: "synthetic stack",
    });

    Log.event("OPERATION_FAILED", "ERROR", {
      operation: "read",
      reason: error,
      token: "synthetic-secret",
    });
    await Log.flush();

    const [record] = await readLogRecords(directory);
    expect(record).toMatchObject({
      message: "OPERATION_FAILED",
      severity: "ERROR",
      fields: {
        operation: "read",
        reason: { errorName: "Error" },
      },
    });
    expect(JSON.stringify(record)).not.toContain("synthetic-secret");
    expect(JSON.stringify(record)).not.toContain("synthetic stack");
  });

  it("persists safe startup diagnostic metadata without the failure details", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    Log.initialize({ directory, devMode: true });

    const diagnostic = configurationError(
      "DISCORD_BOT_TOKEN",
      "token=synthetic-secret",
    );
    Log.event("APPLICATION_STARTUP_FAILED", "ERROR", {
      category: diagnostic.startupCode,
      configField: diagnostic.configField,
      message: diagnostic.message,
      token: "synthetic-secret",
    });
    await Log.flush();

    const [record] = await readLogRecords(directory);
    expect(record).toMatchObject({
      message: "APPLICATION_STARTUP_FAILED",
      fields: {
        category: "CONFIG_INVALID",
        configField: "DISCORD_BOT_TOKEN",
      },
    });
    expect(JSON.stringify(record)).not.toContain("synthetic-secret");
    expect(JSON.stringify(record)).not.toContain("Configuration value");
  });

  it("rejects invalid event identifiers without exposing their values", async () => {
    const directory: string = await createLogDirectory();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => {
      Log.event("bad-event-token=synthetic-secret", "ERROR");
    }).toThrow("Invalid log event identifier.");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "synthetic-secret",
    );
    expect(await readdir(directory)).toEqual([]);
  });

  it("persists development debug records but suppresses production debug records", async () => {
    const developmentDirectory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    Log.initialize({ directory: developmentDirectory, devMode: true });
    Log.debug("Development trace.", { stage: "startup" });
    await Log.flush();
    expect(
      (await readLogRecords(developmentDirectory)).map(
        record => record.severity,
      ),
    ).toEqual(["DEBUG"]);

    Log.resetForTests();
    const productionDirectory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: false,
    } as never);
    Log.initialize({ directory: productionDirectory, devMode: false });
    Log.debug("Production trace.");
    Log.info("Production event.");
    await Log.flush();
    expect(
      (await readLogRecords(productionDirectory)).map(
        record => record.severity,
      ),
    ).toEqual(["INFO"]);
  });

  it("bounds nested values, handles cycles and unsupported values, and caps records", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    Log.initialize({ directory, devMode: true });
    const circular: Record<string, unknown> = {
      operation: "test",
      value: BigInt(1),
    };
    circular.self = circular;
    Log.debug("Cycle.", { result: circular });
    Log.debug("Large value.", { value: "x".repeat(100_000) });
    await Log.flush();

    const records: Record<string, unknown>[] = await readLogRecords(directory);
    expect(records).toHaveLength(2);
    expect(JSON.stringify(records[0])).toContain("circularReference");
    expect(JSON.stringify(records[0])).toContain("[Unsupported]");
    expect(Buffer.byteLength(JSON.stringify(records[1]), "utf8")).toBeLessThan(
      64 * 1024,
    );
  });

  it("bounds deeply nested allowed values", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    Log.initialize({ directory, devMode: true });
    let deeplyNested: Record<string, unknown> = { value: "leaf" };
    for (let depth = 0; depth < 20; depth += 1) {
      deeplyNested = { result: deeplyNested };
    }

    expect(() => {
      Log.info("Deep diagnostic.", deeplyNested);
    }).not.toThrow();
    await Log.flush();

    const [record] = await readLogRecords(directory);
    expect(JSON.stringify(record)).toContain("[Depth limit]");
  });

  it("contains throwing getters, enumeration traps, and console inspection failures", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    Log.initialize({ directory, devMode: true });
    const throwingGetter: Record<string, unknown> = {};
    Object.defineProperty(throwingGetter, "result", {
      enumerable: true,
      get: () => {
        throw new Error("synthetic getter secret");
      },
    });
    const throwingProxy: object = new Proxy(
      {},
      {
        ownKeys: (): string[] => {
          throw new Error("synthetic enumeration secret");
        },
      },
    );

    expect(() => {
      Log.info("Malformed diagnostic.", throwingGetter);
    }).not.toThrow();
    expect(() => {
      Log.error("Malformed proxy diagnostic.", throwingProxy);
    }).not.toThrow();
    await Log.flush();

    const records: Record<string, unknown>[] = await readLogRecords(directory);
    expect(records).toHaveLength(2);
    expect(JSON.stringify(records)).not.toContain("synthetic getter secret");
    expect(JSON.stringify(records)).not.toContain(
      "synthetic enumeration secret",
    );
  });

  it("rotates by size and date without overwriting same-day segments", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    let now: Date = new Date("2026-11-16T12:00:00.000Z");
    Log.initialize({
      directory,
      devMode: true,
      maximumFileBytes: 180,
      now: () => now,
    });
    Log.info("First event.", { operation: "one" });
    await Log.flush();
    Log.info("Second event.", { operation: "two" });
    await Log.flush();
    now = new Date("2026-11-17T12:00:00.000Z");
    Log.info("Next date event.", { operation: "three" });
    await Log.flush();

    expect(await readdir(directory)).toEqual(
      expect.arrayContaining([
        "application-logs-2026-11-16.jsonl",
        "application-logs-2026-11-16.1.jsonl",
        "application-logs-2026-11-17.jsonl",
      ]),
    );
  });

  it("rotates after an exact-size file into the next existing segment", async () => {
    const directory: string = await createLogDirectory();
    const record = JSON.stringify({
      timestamp: "2026-11-16T12:00:00.000Z",
      severity: "INFO",
      message: "Application log event.",
    });
    const recordLine: string = `${record}\n`;
    await writeFile(
      join(directory, "application-logs-2026-11-16.jsonl"),
      recordLine,
    );
    await writeFile(
      join(directory, "application-logs-2026-11-16.1.jsonl"),
      "older\n",
    );
    await writeFile(
      join(directory, "application-logs-2026-11-16.2.jsonl"),
      "older\n",
    );
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: true,
    } as never);
    Log.initialize({
      directory,
      devMode: true,
      maximumFileBytes: Buffer.byteLength(recordLine, "utf8"),
      now: () => new Date("2026-11-16T12:00:00.000Z"),
    });
    Log.info("Overflow event.");
    await Log.flush();

    expect(await readdir(directory)).toEqual(
      expect.arrayContaining([
        "application-logs-2026-11-16.jsonl",
        "application-logs-2026-11-16.1.jsonl",
        "application-logs-2026-11-16.2.jsonl",
        "application-logs-2026-11-16.3.jsonl",
      ]),
    );
  });

  it("retains only current owned files and keeps console logging after filesystem failure", async () => {
    const directory: string = await createLogDirectory();
    await writeFile(
      join(directory, "application-logs-2026-11-01.jsonl"),
      "expired\n",
    );
    await writeFile(join(directory, "other.jsonl"), "keep\n");
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: false,
    } as never);
    Log.initialize({
      directory,
      devMode: false,
      retentionDays: 7,
      now: () => new Date("2026-11-16T12:00:00.000Z"),
    });
    Log.info("Writable event.");
    await Log.flush();
    expect(
      (await readdir(directory)).some(file => file.includes("2026-11-01")),
    ).toBe(false);
    expect(await readFile(join(directory, "other.jsonl"), "utf8")).toBe(
      "keep\n",
    );
    expect(consoleLog).toHaveBeenCalled();

    Log.resetForTests();
    const failurePath: string = join(directory, "not-a-directory");
    await writeFile(failurePath, "fixture");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    Log.initialize({ directory: failurePath, devMode: false });
    Log.info("Still visible.");
    await Log.flush(100);
    expect(consoleError).toHaveBeenCalledWith(
      "Persistent application logging unavailable.",
      expect.any(Object),
    );
    expect(Log.getPersistentStatus()).toMatchObject({
      disabled: true,
      pendingRecords: 0,
    });
    expect(consoleLog).toHaveBeenCalled();

    Log.event("AFTER_FAILURE", "INFO", { id: "still-console-only" });
    await Log.flush();
    expect(Log.getPersistentStatus()).toMatchObject({
      disabled: true,
      pendingRecords: 0,
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("drops oldest records deterministically while a drain is blocked", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: false,
    } as never);
    const internals: LogInternals = Log as unknown as LogInternals;
    const originalWriteRecord = internals.__writeRecord;
    const writeStarted: Deferred<undefined> = createDeferred<undefined>();
    const releaseWrite: Deferred<undefined> = createDeferred<undefined>();
    const written: PendingLogRecord[] = [];
    internals.__writeRecord = async (
      pending: PendingLogRecord,
    ): Promise<void> => {
      written.push(pending);
      if (written.length === 1) {
        writeStarted.resolve(undefined);
        await releaseWrite.promise;
      }
    };
    Log.initialize({ directory, devMode: false });

    for (let index = 0; index < 1_100; index += 1)
      Log.info("Queue event.", { index });
    await writeStarted.promise;

    const statusWhileBlocked = Log.getPersistentStatus();
    releaseWrite.resolve(undefined);
    await Log.flush();
    internals.__writeRecord = originalWriteRecord;
    expect(statusWhileBlocked.droppedRecords).toBeGreaterThan(0);
    expect(statusWhileBlocked.pendingRecords).toBeLessThanOrEqual(1_000);
    expect(
      statusWhileBlocked.droppedRecords + statusWhileBlocked.pendingRecords + 1,
    ).toBe(1_100);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls[0]?.[0]).toBe(
      "Persistent application logging queue full; records dropped.",
    );
    const retainedIndexes: number[] = written.map(
      pending =>
        (JSON.parse(pending.record) as { fields: { index: number } }).fields
          .index,
    );
    expect(retainedIndexes).toEqual(
      Array.from(
        { length: retainedIndexes.length },
        (_, index) => statusWhileBlocked.droppedRecords + index,
      ),
    );
  });

  it("times out a blocked flush and later drains without stranded waiters", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: false,
    } as never);
    const internals: LogInternals = Log as unknown as LogInternals;
    const originalWriteRecord = internals.__writeRecord;
    const writeStarted: Deferred<undefined> = createDeferred<undefined>();
    const releaseWrite: Deferred<undefined> = createDeferred<undefined>();
    let writeCount: number = 0;
    internals.__writeRecord = async (): Promise<void> => {
      writeCount += 1;
      writeStarted.resolve(undefined);
      await releaseWrite.promise;
    };
    Log.initialize({ directory, devMode: false });

    Log.info("Blocked event.");
    await writeStarted.promise;
    await Log.flush(1);
    expect(writeCount).toBe(1);
    expect(Log.getPersistentStatus().pendingRecords).toBe(0);

    releaseWrite.resolve(undefined);
    internals.__writeRecord = originalWriteRecord;
    await Log.flush();
    expect(Log.getPersistentStatus().pendingRecords).toBe(0);
  });

  it("preserves queue order for a concurrent logging burst", async () => {
    const directory: string = await createLogDirectory();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Environment, "config", "get").mockReturnValue({
      devMode: false,
    } as never);
    Log.initialize({ directory, devMode: false });
    for (let index = 0; index < 100; index += 1)
      Log.info("Ordered event.", { index });
    await Log.flush();

    const records: Record<string, unknown>[] = await readLogRecords(directory);
    const indexes: number[] = records.map(record => {
      const fields = record.fields as { index: number };
      return fields.index;
    });
    expect(indexes).toEqual(Array.from({ length: 100 }, (_, index) => index));
  });

  it("does not reconfigure on duplicate initialization", async () => {
    const first: string = await createLogDirectory();
    const second: string = await createLogDirectory();
    Log.initialize({ directory: first, devMode: false });
    Log.initialize({ directory: second, devMode: false });
    Log.info("Single sink.");
    await Log.flush();

    expect(await readLogRecords(first)).toHaveLength(1);
    expect(await readdir(second)).toEqual([]);
  });
});

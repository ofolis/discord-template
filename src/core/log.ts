/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/typedef, @typescript-eslint/use-unknown-in-catch-callback-variable */

import { mkdir, readdir, rename, stat, unlink, writeFile } from "fs/promises";
import * as path from "path";
import * as util from "util";
import { Environment } from "./environment";

const maximumRecordBytes: number = 64 * 1024;
const maximumPendingRecords: number = 1_000;
const maximumNestedDepth: number = 4;
const defaultMaximumFileBytes: number = 10 * 1024 * 1024;
const defaultDevelopmentRetentionDays: number = 7;
const defaultProductionRetentionDays: number = 14;
const ownedFilePattern: RegExp =
  /^application-logs-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/u;
const sensitiveKeys: ReadonlySet<string> = new Set([
  "authorization",
  "body",
  "content",
  "cookie",
  "credential",
  "headers",
  "message",
  "password",
  "payload",
  "private",
  "request",
  "requestbody",
  "response",
  "responsebody",
  "secret",
  "stack",
  "token",
]);
// Allowed field names are defense in depth; callers must still provide only
// nonsensitive values under these generic diagnostic keys.
const allowedKeys: ReadonlySet<string> = new Set([
  "actionable",
  "attempt",
  "bytes",
  "causecode",
  "causename",
  "category",
  "code",
  "count",
  "commandcount",
  "configfield",
  "correlationid",
  "duration",
  "elapsed",
  "errorcode",
  "errorname",
  "failed",
  "guildcount",
  "httpstatus",
  "id",
  "ids",
  "index",
  "kind",
  "limit",
  "name",
  "operation",
  "outcome",
  "path",
  "platformcode",
  "processed",
  "reason",
  "result",
  "retry",
  "size",
  "stage",
  "state",
  "status",
  "statuscode",
  "timeout",
  "timestamp",
  "total",
  "updated",
  "value",
  "waitmilliseconds",
]);
const persistentLogMessage: string = "Application log event.";
const depthLimitMarker: string = "[Depth limit]";
const uninspectableValueMarker: string = "[Uninspectable diagnostic value]";

export type LogSeverity = "DEBUG" | "ERROR" | "INFO" | "SUCCESS";

// Trusted event identifiers are uppercase snake-case constants, for example
// COMMAND_DEPLOYED or STORAGE_WRITE_FAILED.
const eventIdentifierPattern: RegExp = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;

type FileLogOptions = {
  readonly devMode: boolean;
  readonly directory: string;
  readonly maximumFileBytes?: number;
  readonly now?: () => Date;
  readonly retentionDays?: number;
};

type FileLogRecord = {
  fields?: Record<string, unknown>;
  readonly message: string;
  readonly severity: LogSeverity;
  readonly timestamp: string;
};

type PendingRecord = { readonly date: string; readonly record: string };

export type PersistentLogStatus = {
  readonly disabled: boolean;
  readonly droppedRecords: number;
  readonly fileFailureReported: boolean;
  readonly initialized: boolean;
  readonly pendingRecords: number;
};

export class Log {
  private static __draining: boolean = false;

  private static __droppedRecords: number = 0;

  private static __fileFailureReported: boolean = false;

  private static __fileOptions: Required<FileLogOptions> | undefined;

  private static __fileReady: Promise<void> | undefined;

  private static __flushWaiters: Array<() => void> = [];

  private static __lastCleanupDate: string | undefined;

  private static __pending: PendingRecord[] = [];

  private static __persistentSinkDisabled: boolean = false;

  private static __queueDropReported: boolean = false;

  public static debug(context: string, ...data: readonly unknown[]): void {
    if (Environment.config.devMode) {
      this.__logMessage("log", "DEBUG", "\x1b[2m", context, data);
    }
  }

  public static error(context: string, ...data: readonly unknown[]): void {
    this.__logMessage("error", "ERROR", "\x1b[31m", context, data);
  }

  /**
   * Writes a trusted, structured diagnostic event. The identifier must be a
   * fixed nonsensitive constant; ordinary context strings remain console-only.
   */
  public static event(
    eventCode: string,
    severity: LogSeverity,
    fields?: Record<string, unknown>,
  ): void {
    if (
      typeof eventCode !== "string" ||
      eventCode.length === 0 ||
      eventCode.length > 64 ||
      !eventIdentifierPattern.test(eventCode)
    ) {
      throw new Error("Invalid log event identifier.");
    }
    if (severity === "DEBUG" && !Environment.config.devMode) return;
    const data: readonly unknown[] = fields === undefined ? [] : [fields];
    if (severity === "ERROR") {
      this.__logMessage(
        "error",
        severity,
        "\x1b[31m",
        eventCode,
        data,
        eventCode,
      );
      return;
    }
    if (severity === "SUCCESS") {
      this.__logMessage(
        "log",
        severity,
        "\x1b[32m",
        eventCode,
        data,
        eventCode,
      );
      return;
    }
    if (severity === "DEBUG") {
      this.__logMessage("log", severity, "\x1b[2m", eventCode, data, eventCode);
      return;
    }
    this.__logMessage("log", severity, "", eventCode, data, eventCode);
  }

  /** Flushes queued records within the supplied time budget. */
  public static async flush(
    timeoutMilliseconds: number = 1_000,
  ): Promise<void> {
    if (
      this.__fileOptions === undefined ||
      this.__persistentSinkDisabled ||
      (this.__pending.length === 0 && !this.__draining)
    )
      return;
    await new Promise<void>(resolve => {
      let settled: boolean = false;
      const waiter = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer: NodeJS.Timeout = setTimeout(
        () => {
          const index: number = this.__flushWaiters.indexOf(waiter);
          if (index >= 0) this.__flushWaiters.splice(index, 1);
          waiter();
        },
        Math.max(0, timeoutMilliseconds),
      );
      this.__flushWaiters.push(waiter);
    });
  }

  public static getPersistentStatus(): PersistentLogStatus {
    return {
      disabled: this.__persistentSinkDisabled,
      droppedRecords: this.__droppedRecords,
      fileFailureReported: this.__fileFailureReported,
      initialized: this.__fileOptions !== undefined,
      pendingRecords: this.__pending.length,
    };
  }

  public static info(context: string, ...data: readonly unknown[]): void {
    this.__logMessage("log", "INFO", "", context, data);
  }

  /** Starts the persistent sink once. Calls made before initialization are console-only. */
  public static initialize(options: FileLogOptions): void {
    if (this.__fileOptions !== undefined) return;
    this.__fileOptions = {
      directory: options.directory,
      devMode: options.devMode,
      maximumFileBytes: options.maximumFileBytes ?? defaultMaximumFileBytes,
      retentionDays:
        options.retentionDays ??
        (options.devMode
          ? defaultDevelopmentRetentionDays
          : defaultProductionRetentionDays),
      now: options.now ?? (() => new Date()),
    };
    this.__fileReady = mkdir(options.directory, { recursive: true })
      .then(async () => {
        await this.__cleanupExpiredFiles();
        const readyOptions: Required<FileLogOptions> = this
          .__fileOptions as Required<FileLogOptions>;
        this.__lastCleanupDate = this.__datePart(readyOptions.now());
      })
      .catch(reason => {
        this.__disablePersistentSink(reason);
      });
    void this.__drain();
  }

  /** Resets the sink for isolated tests; production code should only initialize and flush. */
  public static resetForTests(): void {
    this.__fileOptions = undefined;
    this.__fileReady = undefined;
    this.__pending = [];
    this.__draining = false;
    this.__flushWaiters = [];
    this.__fileFailureReported = false;
    this.__lastCleanupDate = undefined;
    this.__persistentSinkDisabled = false;
    this.__droppedRecords = 0;
    this.__queueDropReported = false;
  }

  public static success(context: string, ...data: readonly unknown[]): void {
    this.__logMessage("log", "SUCCESS", "\x1b[32m", context, data);
  }

  /** Returns safe structured details without serializing arbitrary error data. */
  public static summarizeError(reason: unknown): Record<string, string> {
    if (!(reason instanceof Error)) return { reasonType: typeof reason };
    const errorLike: Error & {
      cause?: unknown;
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
    } = reason;
    const summary: Record<string, string> = {
      errorName: this.__formatStableValue(reason.name) ?? "Error",
    };
    const errorCode: string | undefined = this.__formatStableValue(
      errorLike.code,
    );
    const status: string | undefined = this.__formatStableValue(
      errorLike.status ?? errorLike.statusCode,
    );
    if (errorCode !== undefined) summary.errorCode = errorCode;
    if (status !== undefined) summary.status = status;
    if (errorLike.cause instanceof Error) {
      const cause: Error & { code?: unknown } = errorLike.cause;
      const causeName: string | undefined = this.__formatStableValue(
        cause.name,
      );
      const causeCode: string | undefined = this.__formatStableValue(
        cause.code,
      );
      if (causeName !== undefined) summary.causeName = causeName;
      if (causeCode !== undefined) summary.causeCode = causeCode;
    }
    return summary;
  }

  public static throw(
    context: string | Error,
    ...data: readonly unknown[]
  ): never {
    [...data].reverse().forEach(item => {
      if (item !== "_NOT_SET_") this.__logData("error", "ERROR", item);
    });
    throw context instanceof Error ? context : new Error(context);
  }

  private static async __cleanupExpiredFiles(): Promise<void> {
    const options: Required<FileLogOptions> = this
      .__fileOptions as Required<FileLogOptions>;
    const cutoff: number =
      options.now().getTime() - options.retentionDays * 86_400_000;
    const entries: string[] = await readdir(options.directory);
    await Promise.all(
      entries
        .map(entry => ({ entry, match: entry.match(ownedFilePattern) }))
        .filter(({ match }) => match !== null)
        .filter(({ match }) => {
          const date: number = Date.parse(
            `${(match as RegExpMatchArray)[1]}T00:00:00.000Z`,
          );
          return Number.isFinite(date) && date < cutoff;
        })
        .map(({ entry }) => unlink(path.join(options.directory, entry))),
    );
  }

  private static async __cleanupOnDateChange(): Promise<void> {
    const options: Required<FileLogOptions> = this
      .__fileOptions as Required<FileLogOptions>;
    const currentDate: string = this.__datePart(options.now());
    if (currentDate === this.__lastCleanupDate) return;
    await this.__cleanupExpiredFiles();
    this.__lastCleanupDate = currentDate;
  }

  private static __collectFields(
    value: unknown,
    target: Record<string, unknown>,
    seen: WeakSet<object>,
    depth: number = 0,
  ): void {
    if (value === "_NOT_SET_" || value === undefined || value === null) return;
    if (value instanceof Error) {
      Object.assign(target, this.summarizeError(value));
      return;
    }
    if (typeof value !== "object") {
      target[`value${String(Object.keys(target).length)}`] =
        this.__safeScalar(value);
      return;
    }
    if (depth > maximumNestedDepth) {
      target.depthLimitReached = true;
      return;
    }
    if (seen.has(value)) {
      target.circularReference = true;
      return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      target.values = value
        .slice(0, 32)
        .map(item => this.__safeNestedValue(item, seen, depth + 1));
      return;
    }
    try {
      for (const [key, nested] of Object.entries(value)) {
        const normalizedKey: string = key.toLowerCase();
        if (typeof nested === "object" && nested !== null && seen.has(nested)) {
          target.circularReference = true;
          continue;
        }
        if (sensitiveKeys.has(normalizedKey) || !allowedKeys.has(normalizedKey))
          continue;
        try {
          const safe: unknown = this.__safeNestedValue(nested, seen, depth + 1);
          if (safe !== undefined) target[key] = safe;
        } catch (_reason: unknown) {
          target.serializationFailure = true;
        }
      }
    } catch (_reason: unknown) {
      target.serializationFailure = true;
    }
  }

  private static __datePart(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private static __disablePersistentSink(reason: unknown): void {
    this.__pending = [];
    this.__persistentSinkDisabled = true;
    this.__reportFileFailure(reason);
    this.__flushWaiters.splice(0).forEach(resolve => {
      resolve();
    });
  }

  private static async __drain(): Promise<void> {
    if (
      this.__draining ||
      this.__fileOptions === undefined ||
      this.__persistentSinkDisabled
    )
      return;
    this.__draining = true;
    try {
      await this.__fileReady;
      while (
        this.__pending.length > 0 &&
        this.__fileOptions !== undefined &&
        !this.__persistentSinkDisabled
      ) {
        const pending: PendingRecord = this.__pending.shift() as PendingRecord;
        await this.__cleanupOnDateChange();
        await this.__writeRecord(pending);
      }
    } catch (reason: unknown) {
      this.__disablePersistentSink(reason);
    } finally {
      this.__draining = false;
      if (this.__pending.length === 0 || this.__persistentSinkDisabled) {
        this.__flushWaiters.splice(0).forEach(resolve => {
          resolve();
        });
      } else {
        void this.__drain();
      }
    }
  }

  private static __enqueueFileRecord(
    severity: LogSeverity,
    data: readonly unknown[],
    persistentMessage: string,
  ): void {
    if (this.__fileOptions === undefined || this.__persistentSinkDisabled)
      return;
    const now: Date = this.__fileOptions.now();
    const record: FileLogRecord = {
      timestamp: now.toISOString(),
      severity,
      message: persistentMessage,
    };
    const fields: Record<string, unknown> = {};
    data.forEach(item => {
      this.__collectFields(item, fields, new WeakSet());
    });
    if (Object.keys(fields).length > 0) record.fields = fields;
    let serialized: string;
    try {
      serialized = JSON.stringify(record);
    } catch (_reason: unknown) {
      serialized = JSON.stringify({
        timestamp: record.timestamp,
        severity,
        message: persistentMessage,
        fields: { serializationFailure: true },
      });
    }
    if (Buffer.byteLength(serialized, "utf8") > maximumRecordBytes) {
      serialized = JSON.stringify({
        timestamp: record.timestamp,
        severity,
        message: persistentMessage,
        fields: { recordTruncated: true },
      });
    }
    if (this.__pending.length >= maximumPendingRecords) {
      this.__pending.shift();
      this.__droppedRecords += 1;
      if (!this.__queueDropReported) {
        this.__queueDropReported = true;
        console.error(
          "Persistent application logging queue full; records dropped.",
          { droppedRecords: this.__droppedRecords },
        );
      }
    }
    this.__pending.push({
      record: `${serialized}\n`,
      date: this.__datePart(now),
    });
    void this.__drain();
  }

  private static __formatPrefix(): string {
    return `[${new Date().toISOString()}]`;
  }

  private static __formatStableValue(value: unknown): string | undefined {
    if (typeof value === "number")
      return Number.isFinite(value) ? String(value) : undefined;
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 64 ||
      !/^[A-Za-z0-9_.:-]+$/u.test(value)
    )
      return undefined;
    return value;
  }

  private static __formatUnknown(item: unknown): unknown {
    if (typeof item === "object" && !(item instanceof Error)) {
      try {
        return util.inspect(item, {
          showHidden: false,
          depth: null,
          colors: true,
        });
      } catch (_reason: unknown) {
        return uninspectableValueMarker;
      }
    }
    return item;
  }

  private static __logData(
    method: "log" | "error",
    severity: LogSeverity,
    item: unknown,
  ): void {
    console[method](
      `\x1b[2m${this.__formatPrefix()} [${severity}]\x1b[0m`,
      this.__formatUnknown(item),
    );
  }

  private static __logMessage(
    method: "log" | "error",
    severity: LogSeverity,
    color: string,
    context: string,
    data: readonly unknown[],
    persistentMessage: string = persistentLogMessage,
  ): void {
    console[method](
      `\x1b[2m${this.__formatPrefix()} [${severity}]\x1b[0m ${color}%s\x1b[0m`,
      this.__formatUnknown(context),
    );
    data.forEach(item => {
      if (item !== "_NOT_SET_") this.__logData(method, severity, item);
    });
    this.__enqueueFileRecord(severity, data, persistentMessage);
  }

  private static __reportFileFailure(reason: unknown): void {
    if (this.__fileFailureReported) return;
    this.__fileFailureReported = true;
    console.error(
      "Persistent application logging unavailable.",
      this.summarizeError(reason),
    );
  }

  private static async __rotate(
    currentPath: string,
    date: string,
  ): Promise<void> {
    const options: Required<FileLogOptions> = this
      .__fileOptions as Required<FileLogOptions>;
    const entries: string[] = await readdir(options.directory);
    const segments: number[] = entries
      .map(entry => entry.match(ownedFilePattern))
      .filter((match): match is RegExpMatchArray => match?.[1] === date)
      .map(match => Number(match[2] ?? 0));
    const nextSegment: number = Math.max(-1, ...segments) + 1;
    await rename(
      currentPath,
      path.join(
        options.directory,
        `application-logs-${date}.${String(nextSegment)}.jsonl`,
      ),
    );
  }

  private static __safeNestedValue(
    value: unknown,
    seen: WeakSet<object>,
    depth: number,
  ): unknown {
    if (value === undefined || value === null) return undefined;
    if (value instanceof Error) return this.summarizeError(value);
    if (typeof value !== "object") return this.__safeScalar(value);
    if (depth > maximumNestedDepth) return depthLimitMarker;
    if (seen.has(value)) return "[Circular]";
    const nested: Record<string, unknown> = {};
    this.__collectFields(value, nested, seen, depth);
    return nested;
  }

  private static __safeScalar(value: unknown): string | number | boolean {
    if (typeof value === "string") return value.slice(0, 512);
    if (typeof value === "number")
      return Number.isFinite(value) ? value : String(value);
    if (typeof value === "boolean") return value;
    return "[Unsupported]";
  }

  private static async __writeRecord(pending: PendingRecord): Promise<void> {
    const options: Required<FileLogOptions> = this
      .__fileOptions as Required<FileLogOptions>;
    const currentPath: string = path.join(
      options.directory,
      `application-logs-${pending.date}.jsonl`,
    );
    let currentSize = 0;
    try {
      currentSize = (await stat(currentPath)).size;
    } catch (reason: unknown) {
      if ((reason as NodeJS.ErrnoException).code !== "ENOENT") throw reason;
    }
    if (
      currentSize > 0 &&
      currentSize + Buffer.byteLength(pending.record, "utf8") >
        options.maximumFileBytes
    ) {
      await this.__rotate(currentPath, pending.date);
    }
    await writeFile(currentPath, pending.record, {
      encoding: "utf8",
      flag: "a",
    });
  }
}

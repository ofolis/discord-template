import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import { join } from "path";
import type { JsonValue } from "./types";

export class InvalidStorageKeyError extends Error {
  public constructor() {
    super("Storage key is invalid.");
    this.name = "InvalidStorageKeyError";
  }
}

export class CorruptJsonError extends Error {
  public constructor() {
    super("Stored JSON is corrupt.");
    this.name = "CorruptJsonError";
  }
}

export class StorageOperationError extends Error {
  public constructor(operation: string, cause?: unknown) {
    super(`JSON storage ${operation} failed.`, { cause });
    this.name = "StorageOperationError";
  }
}

export class ReentrantStorageOperationError extends Error {
  public constructor() {
    super("A storage operation cannot re-enter its active transaction key.");
    this.name = "ReentrantStorageOperationError";
  }
}

export class InvalidJsonValueError extends Error {
  public constructor() {
    super("Storage value is not valid JSON.");
    this.name = "InvalidJsonValueError";
  }
}

export class InvalidDomainStateError extends Error {
  public constructor() {
    super("Persisted domain state is invalid.");
    this.name = "InvalidDomainStateError";
  }
}

type JsonTransformation<T extends JsonValue> = (
  current: T | null,
) => T | Promise<T>;

type TransactionContext = {
  active: boolean;
  key: string;
};

/** Stores one JSON object per safe ASCII storage key. */
export class JsonStore {
  private __isInitialized: boolean = false;

  private readonly __pending: Set<Promise<unknown>> = new Set();

  private readonly __queues: Map<string, Promise<void>> = new Map();

  private readonly __transactionContext: AsyncLocalStorage<TransactionContext> =
    new AsyncLocalStorage();

  public constructor(private readonly __dataDirectory: string) {}

  public async drain(): Promise<void> {
    await Promise.allSettled([...this.__pending]);
  }

  public async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.__dataDirectory, { recursive: true });
      const stats: import("fs").Stats = await fs.stat(this.__dataDirectory);
      if (!stats.isDirectory()) {
        throw new Error("Configured path is not a directory.");
      }
      this.__isInitialized = true;
    } catch (reason: unknown) {
      throw new StorageOperationError("initialization", reason);
    }
  }

  public read<T extends JsonValue>(key: string): Promise<T | null> {
    try {
      this.__assertReady();
      this.__validateKey(key);
      this.__assertNotReentrant(key);
    } catch (reason: unknown) {
      return this.__reject(reason);
    }
    return this.__enqueue(key, async () => {
      const filePath: string = this.__getFilePath(key);
      let jsonString: string;
      try {
        jsonString = await fs.readFile(filePath, "utf8");
      } catch (reason: unknown) {
        if (this.__isMissingFile(reason)) {
          return null;
        }
        throw new StorageOperationError("read", reason);
      }
      try {
        return JSON.parse(jsonString) as T;
      } catch {
        throw new CorruptJsonError();
      }
    });
  }

  public update<T extends JsonValue>(
    key: string,
    transform: JsonTransformation<T>,
  ): Promise<T> {
    try {
      this.__assertReady();
      this.__validateKey(key);
      this.__assertNotReentrant(key);
    } catch (reason: unknown) {
      return this.__reject(reason);
    }
    return this.__enqueue(key, async () => {
      const current: T | null = await this.__read(key);
      const transactionContext: TransactionContext = { active: true, key };
      return this.__transactionContext.run(transactionContext, async () => {
        try {
          const replacement: T = await transform(current);
          await this.__write(key, replacement);
          return replacement;
        } finally {
          transactionContext.active = false;
        }
      });
    });
  }

  public write(key: string, value: JsonValue): Promise<void> {
    try {
      this.__assertReady();
      this.__validateKey(key);
      this.__assertNotReentrant(key);
    } catch (reason: unknown) {
      return this.__reject(reason);
    }
    return this.__enqueue(key, () => this.__write(key, value));
  }

  private __assertNotReentrant(key: string): void {
    const transactionContext: TransactionContext | undefined =
      this.__transactionContext.getStore();
    if (transactionContext?.active === true && transactionContext.key === key) {
      throw new ReentrantStorageOperationError();
    }
  }

  private __assertReady(): void {
    if (!this.__isInitialized) {
      throw new StorageOperationError(
        "use",
        new Error("Store is not initialized."),
      );
    }
  }

  private __enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous: Promise<void> = this.__queues.get(key) ?? Promise.resolve();
    const task: Promise<T> = previous.then(operation, operation);
    const tail: Promise<void> = task.then(
      () => undefined,
      () => undefined,
    );
    this.__queues.set(key, tail);
    this.__pending.add(task);
    void task.then(
      () => {
        this.__finish(key, task, tail);
      },
      () => {
        this.__finish(key, task, tail);
      },
    );
    return task;
  }

  private __finish(
    key: string,
    task: Promise<unknown>,
    tail: Promise<void>,
  ): void {
    this.__pending.delete(task);
    if (this.__queues.get(key) === tail) {
      this.__queues.delete(key);
    }
  }

  private __getFilePath(key: string): string {
    this.__validateKey(key);
    return join(this.__dataDirectory, `${key}.json`);
  }

  private __isDataProperty(object: object, key: string | symbol): boolean {
    const descriptor: PropertyDescriptor | undefined =
      Object.getOwnPropertyDescriptor(object, key);
    return descriptor !== undefined && "value" in descriptor;
  }

  private __isMissingFile(reason: unknown): boolean {
    return (
      typeof reason === "object" &&
      reason !== null &&
      "code" in reason &&
      reason.code === "ENOENT"
    );
  }

  private async __read<T extends JsonValue>(key: string): Promise<T | null> {
    const filePath: string = this.__getFilePath(key);
    let jsonString: string;
    try {
      jsonString = await fs.readFile(filePath, "utf8");
    } catch (reason: unknown) {
      if (this.__isMissingFile(reason)) {
        return null;
      }
      throw new StorageOperationError("read", reason);
    }
    try {
      return JSON.parse(jsonString) as T;
    } catch {
      throw new CorruptJsonError();
    }
  }

  private __reject<T>(reason: unknown): Promise<T> {
    return Promise.reject(
      reason instanceof Error
        ? reason
        : new Error("JSON storage operation failed."),
    );
  }

  private __validateJsonValue(
    value: unknown,
    ancestors: WeakSet<object> = new WeakSet(),
  ): void {
    if (value === null) {
      return;
    }
    if (typeof value === "string" || typeof value === "boolean") {
      return;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new InvalidJsonValueError();
      }
      return;
    }
    if (typeof value !== "object") {
      throw new InvalidJsonValueError();
    }
    if (ancestors.has(value)) {
      throw new InvalidJsonValueError();
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const keys: (string | symbol)[] = Reflect.ownKeys(value).filter(
          key => key !== "length",
        );
        if (
          keys.length !== value.length ||
          keys.some(
            (key, index) =>
              typeof key !== "string" ||
              key !== String(index) ||
              !Object.prototype.propertyIsEnumerable.call(value, key) ||
              !this.__isDataProperty(value, key),
          )
        ) {
          throw new InvalidJsonValueError();
        }
        value.forEach(item => {
          this.__validateJsonValue(item, ancestors);
        });
        return;
      }
      const prototype: object | null = Reflect.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new InvalidJsonValueError();
      }
      const objectValue: Record<string, unknown> = value as Record<
        string,
        unknown
      >;
      const keys: (string | symbol)[] = Reflect.ownKeys(objectValue);
      if (
        keys.some(
          key =>
            typeof key !== "string" ||
            !Object.prototype.propertyIsEnumerable.call(objectValue, key) ||
            !this.__isDataProperty(objectValue, key),
        )
      ) {
        throw new InvalidJsonValueError();
      }
      keys.forEach(key => {
        if (typeof key !== "string") {
          throw new InvalidJsonValueError();
        }
        this.__validateJsonValue(objectValue[key], ancestors);
      });
    } finally {
      ancestors.delete(value);
    }
  }

  private __validateKey(key: string): void {
    if (!/^[A-Za-z0-9_-]+$/u.test(key)) {
      throw new InvalidStorageKeyError();
    }
  }

  private async __write(key: string, value: JsonValue): Promise<void> {
    let jsonString: string;
    try {
      this.__validateJsonValue(value);
      jsonString = JSON.stringify(value);
    } catch (reason: unknown) {
      if (reason instanceof InvalidJsonValueError) {
        throw reason;
      }
      throw new StorageOperationError("serialization", reason);
    }

    const destination: string = this.__getFilePath(key);
    const temporaryFile: string = join(
      this.__dataDirectory,
      `.${key}.${randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(temporaryFile, jsonString, {
        encoding: "utf8",
        flag: "wx",
      });
      await fs.rename(temporaryFile, destination);
    } catch (reason: unknown) {
      throw new StorageOperationError("write", reason);
    } finally {
      try {
        await fs.unlink(temporaryFile);
      } catch {
        // Cleanup is best effort; the original operation error is more useful.
      }
    }
  }
}

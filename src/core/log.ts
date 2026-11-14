import * as util from "util";
import { Environment } from "./environment";

export class Log {
  /**
   * Callers must pass safe diagnostic context only. This logger deliberately
   * does not attempt to redact arbitrary objects, so credentials and tokens
   * must never be included in data passed to it.
   */
  public static debug(context: string, ...data: readonly unknown[]): void {
    if (Environment.config.devMode) {
      this.__logMessage("log", "DEBUG", "\x1b[2m", context, ...data);
    }
  }

  public static error(context: string, ...data: readonly unknown[]): void {
    this.__logMessage("error", "ERROR", "\x1b[31m", context, ...data);
  }

  public static info(context: string, ...data: readonly unknown[]): void {
    this.__logMessage("log", "INFO", "", context, ...data);
  }

  public static success(context: string, ...data: readonly unknown[]): void {
    this.__logMessage("log", "SUCCESS", "\x1b[32m", context, ...data);
  }

  /**
   * Returns safe, structured details for an unknown thrown value. Error
   * messages and arbitrary properties are intentionally excluded because
   * Discord and other API errors may contain request or response payloads.
   */
  public static summarizeError(reason: unknown): Record<string, string> {
    if (!(reason instanceof Error)) {
      return { reasonType: typeof reason };
    }
    const errorLike: Error & {
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
    if (errorCode !== undefined) {
      summary.errorCode = errorCode;
    }
    if (status !== undefined) {
      summary.status = status;
    }
    return summary;
  }

  public static throw(
    context: string | Error,
    ...data: readonly unknown[]
  ): never {
    [...data].reverse().forEach(item => {
      if (item !== "_NOT_SET_") {
        this.__logData("error", "ERROR", item);
      }
    });
    throw context instanceof Error ? context : new Error(context);
  }

  private static __formatPrefix(): string {
    return `[${new Date().toISOString()}]`;
  }

  private static __formatStableValue(value: unknown): string | undefined {
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : undefined;
    }
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 64 ||
      !/^[A-Za-z0-9_.-]+$/u.test(value)
    ) {
      return undefined;
    }
    return value;
  }

  private static __formatUnknown(item: unknown): unknown {
    if (typeof item === "object" && !(item instanceof Error)) {
      return util.inspect(item, {
        showHidden: false,
        depth: null,
        colors: true,
      });
    }
    return item;
  }

  private static __logData(
    method: "log" | "error",
    severity: "DEBUG" | "ERROR" | "INFO" | "SUCCESS",
    item: unknown,
  ): void {
    console[method](
      `\x1b[2m${this.__formatPrefix()} [${severity}]\x1b[0m`,
      this.__formatUnknown(item),
    );
  }

  private static __logMessage(
    method: "log" | "error",
    severity: "DEBUG" | "ERROR" | "INFO" | "SUCCESS",
    color: string,
    context: string,
    ...data: readonly unknown[]
  ): void {
    console[method](
      `\x1b[2m${this.__formatPrefix()} [${severity}]\x1b[0m ${color}%s\x1b[0m`,
      this.__formatUnknown(context),
    );
    data.forEach(item => {
      if (item !== "_NOT_SET_") {
        this.__logData(method, severity, item);
      }
    });
  }
}

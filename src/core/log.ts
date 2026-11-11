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

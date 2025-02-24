import * as util from "util";
import { Environment } from "./environment";

export class Log {
  public static debug(context: unknown, ...data: unknown[]): void {
    if (Environment.config.devMode) {
      this.__logMessage("log", "\x1b[2m", context, ...data);
    }
  }

  public static error(context: unknown, ...data: unknown[]): void {
    this.__logMessage("error", "\x1b[31m", context, ...data);
  }

  public static info(context: unknown, ...data: unknown[]): void {
    this.__logMessage("log", "", context, ...data);
  }

  public static success(context: unknown, ...data: unknown[]): void {
    this.__logMessage("log", "\x1b[32m", context, ...data);
  }

  public static throw(context: unknown, ...data: unknown[]): never {
    data.reverse().forEach(item => {
      if (item !== "_NOT_SET_") {
        console.error(this.__formatUnknown(item));
      }
    });
    if (typeof context === "string") {
      throw new Error(context);
    } else {
      throw context;
    }
  }

  private static __formatPrefix(): string {
    return `[${Date.now().toString()}]`;
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

  private static __logMessage(
    method: "log" | "error",
    color: string,
    context: unknown,
    ...data: unknown[]
  ): void {
    console[method](
      `\x1b[2m${this.__formatPrefix()}\x1b[0m ${color}%s\x1b[0m`,
      this.__formatUnknown(context),
    );
    data.forEach(item => {
      if (item !== "_NOT_SET_") {
        console[method](this.__formatUnknown(item));
      }
    });
  }
}

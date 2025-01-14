import { Environment } from "./environment";

export class Log {
  private static formatPrefix(): string {
    return `[${Date.now().toString()}]`;
  }

  private static logMessage(
    method: "log" | "error",
    color: string,
    context: unknown,
    ...data: unknown[]
  ): void {
    console[method](
      `\x1b[2m${this.formatPrefix()}\x1b[0m ${color}%s\x1b[0m`,
      context,
    );
    data.forEach((item) => {
      if (item !== "_NOT_SET_") {
        console[method](item);
      }
    });
  }

  public static debug(context: unknown, ...data: unknown[]): void {
    if (Environment.config.devMode) {
      this.logMessage("log", "\x1b[2m", context, ...data);
    }
  }

  public static error(context: unknown, ...data: unknown[]): void {
    this.logMessage("error", "\x1b[31m", context, ...data);
  }

  public static info(context: unknown, ...data: unknown[]): void {
    this.logMessage("log", "", context, ...data);
  }

  public static success(context: unknown, ...data: unknown[]): void {
    this.logMessage("log", "\x1b[32m", context, ...data);
  }

  public static throw(context: unknown, ...data: unknown[]): never {
    data.reverse().forEach((item) => {
      if (item !== "_NOT_SET_") {
        console.error(item);
      }
    });
    if (typeof context === "string") {
      throw new Error(context);
    } else {
      throw context;
    }
  }
}

import dotenv from "dotenv";

export class EnvironmentUtils {
  private static __didLoadDotEnv: boolean = false;

  public static getOptionalBoolean(
    key: string,
    defaultValue: boolean = false,
  ): boolean {
    const value: string | undefined = this.getOptionalEnvVariable(key);
    if (value === undefined) {
      return defaultValue;
    }
    if (value.toUpperCase() === "TRUE") {
      return true;
    }
    if (value.toUpperCase() === "FALSE") {
      return false;
    }
    throw new Error(
      `Configuration value "${key}" must be either "true" or "false".`,
    );
  }

  public static getOptionalEnvVariable(
    key: string,
    defaultValue?: string,
  ): string | undefined {
    this.__loadDotEnv();
    return process.env[key] ?? defaultValue;
  }

  public static getRequiredEnvVariable(key: string): string {
    const value: string | undefined = this.getOptionalEnvVariable(key);
    if (value === undefined) {
      throw new Error(
        `Configuration value "${key}" is required but was not provided.`,
      );
    }
    if (value.trim().length === 0) {
      throw new Error(
        `Configuration value "${key}" is required but was empty.`,
      );
    }
    return value;
  }

  private static __loadDotEnv(): void {
    if (this.__didLoadDotEnv) {
      return;
    }
    dotenv.config();
    this.__didLoadDotEnv = true;
  }
}

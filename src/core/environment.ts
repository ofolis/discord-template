import dotenv from "dotenv";
import * as packageJson from "../../package.json";
import { Log } from "../core";
import type { Config, PackageContext } from "../types";

export class Environment {
  private static _config: Config | null = null;

  private static _packageContext: PackageContext | null = null;

  private static getEnvVariable(key: string, required: boolean): string {
    const value: string | undefined = process.env[key];
    if (value === undefined) {
      if (!required) {
        return "";
      }
      Log.throw(
        "Cannot get environment variable. Requested key was not defined.",
        {
          env: process.env,
          key,
        },
      );
    }
    return value;
  }

  private static getPackageJsonProperty(
    key: string,
    required: boolean,
  ): unknown {
    if (key in packageJson) {
      return (packageJson as Record<string, unknown>)[key];
    }
    if (required) {
      Log.throw(
        `Cannot get package.json property. Requested key was not defined.`,
        {
          packageJson,
          key,
        },
      );
    }
    return undefined;
  }

  public static get config(): Config {
    if (this._config === null) {
      dotenv.config();
      this._config = {
        devMode:
          this.getEnvVariable("DEV_MODE", false).toUpperCase() === "TRUE",
        discordApplicationId: this.getEnvVariable(
          "DISCORD_APPLICATION_ID",
          true,
        ),
        discordBotToken: this.getEnvVariable("DISCORD_BOT_TOKEN", true),
      };
    }
    return this._config;
  }

  public static get dataPath(): string {
    return `${process.cwd()}/data`;
  }

  public static get packageContext(): PackageContext {
    if (this._packageContext === null) {
      this._packageContext = {
        name: this.getPackageJsonProperty("name", true) as string,
        version: this.getPackageJsonProperty("version", false) as
          | string
          | undefined,
      };
    }
    return this._packageContext;
  }
}

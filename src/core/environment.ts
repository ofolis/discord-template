import dotenv from "dotenv";
import { MersenneTwister19937, Random } from "random-js";
import * as packageJson from "../../package.json";
import { Log } from "../core";
import type { Config, PackageContext } from "./types";

export class Environment {
  private static __config: Config | null = null;

  private static __packageContext: PackageContext | null = null;

  private static readonly __random: Random = new Random(
    MersenneTwister19937.autoSeed(),
  );

  public static get config(): Config {
    if (this.__config === null) {
      dotenv.config();
      this.__config = {
        devMode:
          this.__getEnvVariable("DEV_MODE", false).toUpperCase() === "TRUE",
        discordApplicationId: this.__getEnvVariable(
          "DISCORD_APPLICATION_ID",
          true,
        ),
        discordBotToken: this.__getEnvVariable("DISCORD_BOT_TOKEN", true),
      };
    }
    return this.__config;
  }

  public static get dataPath(): string {
    return `${process.cwd()}/data`;
  }

  public static get packageContext(): PackageContext {
    if (this.__packageContext === null) {
      this.__packageContext = {
        name: this.__getPackageJsonProperty("name", true) as string,
        version: this.__getPackageJsonProperty("version", false) as
          | string
          | undefined,
      };
    }
    return this.__packageContext;
  }

  public static get random(): Random {
    return this.__random;
  }

  private static __getEnvVariable(key: string, required: boolean): string {
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

  private static __getPackageJsonProperty(
    key: string,
    required: boolean,
  ): unknown {
    if (key in packageJson) {
      return (packageJson as Record<string, unknown>)[key];
    }
    if (required) {
      Log.throw(
        "Cannot get package.json property. Requested key was not defined.",
        {
          packageJson,
          key,
        },
      );
    }
    return undefined;
  }
}

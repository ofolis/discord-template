import { resolve } from "path";
import { MersenneTwister19937, Random } from "random-js";
import * as packageJson from "../../package.json";
import { Log } from "../core";
import { EnvironmentUtils } from "./environment-utils";
import type { CoreConfig, PackageContext } from "./types";

export class Environment {
  private static __config: CoreConfig | null = null;

  private static __packageContext: PackageContext | null = null;

  private static readonly __random: Random = new Random(
    MersenneTwister19937.autoSeed(),
  );

  public static get config(): CoreConfig {
    return this.loadConfig();
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

  public static loadConfig(): CoreConfig {
    if (this.__config === null) {
      this.__config = {
        dataDirectory: this.__getDataDirectory(),
        devMode: EnvironmentUtils.getOptionalBoolean("DEV_MODE"),
        discordApplicationId: EnvironmentUtils.getRequiredEnvVariable(
          "DISCORD_APPLICATION_ID",
        ),
        discordBotToken:
          EnvironmentUtils.getRequiredEnvVariable("DISCORD_BOT_TOKEN"),
      };
    }
    return this.__config;
  }

  private static __getDataDirectory(): string {
    const configuredDirectory: string =
      EnvironmentUtils.getOptionalEnvVariable("DATA_DIRECTORY", "./data") ?? "";
    if (
      configuredDirectory.trim().length === 0 ||
      configuredDirectory.includes("\0")
    ) {
      throw new Error(
        'Configuration value "DATA_DIRECTORY" must be a valid non-empty path.',
      );
    }
    return resolve(configuredDirectory);
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

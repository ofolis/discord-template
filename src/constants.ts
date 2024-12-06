import dotenv from "dotenv";
import type {
  Config,
} from "./types";
import {
  Utils,
} from "./utils";

export class Constants {
  private static _config: Config | null = null;

  public static get config(): Config {
    if (this._config === null) {
      this._config = {
        "discordApplicationId": this.getEnvVariable("DISCORD_APPLICATION_ID"),
        "discordBotToken": this.getEnvVariable("DISCORD_BOT_TOKEN"),
      };
    }
    return this._config;
  }

  private static envLoaded = false;

  private static getEnvVariable(
    key: string,
  ): string {
    if (!this.envLoaded) {
      try {
        dotenv.config();
        this.envLoaded = true;
      } catch (response: unknown) {
        Utils.catchToError(response);
      }
    }
    if (typeof process.env[key] !== "string") {
      throw new Error(`Environment variable "${key}" is not defined.`);
    }
    return process.env[key];
  }
}

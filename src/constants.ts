import dotenv from "dotenv";
import type {
  Environment,
} from "./types";

export class Constants {
  private static _environment: Environment | null = null;

  public static get environment(): Environment {
    if (this._environment === null) {
      dotenv.config();
      if (typeof process.env.DISCORD_APPLICATION_ID !== 'string' || typeof process.env.DISCORD_BOT_TOKEN !== 'string') {
        throw TypeError("One or more required environment variables are not defined.");
      }
      this._environment = {
        "DISCORD_APPLICATION_ID": process.env.DISCORD_APPLICATION_ID,
        "DISCORD_BOT_TOKEN": process.env.DISCORD_BOT_TOKEN,
      };
    }
    return this._environment;
  }
}

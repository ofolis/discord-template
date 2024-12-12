import dotenv from "dotenv";
import type {
  Config,
} from "./types";

export class Constants {
  private static _config: Config | null = null;

  private static envLoaded = false;

  private static getEnvVariable(
    key: string,
  ): string {
    if (!this.envLoaded) {
      dotenv.config();
      this.envLoaded = true;
    }
    if (typeof process.env[key] !== "string") {
      throw new Error(`Environment variable "${key}" is not defined.`);
    }
    return process.env[key];
  }

  public static get config(): Config {
    if (this._config === null) {
      this._config = {
        "discordApplicationId": this.getEnvVariable("DISCORD_APPLICATION_ID"),
        "discordBotToken": this.getEnvVariable("DISCORD_BOT_TOKEN"),
      };
    }
    return this._config;
  }

  public static get dataPath(): string {
    const currentDirectoryPath: string = process.cwd();
    const dataDirectoryName: string = "data";
    return `${currentDirectoryPath}/${dataDirectoryName}`;
  }
}

import {
  Constants,
} from "../constants";
import {
  Ping,
} from "./commands";
import {
  Client,
  REST,
  Routes,
  type SlashCommandBuilder,
} from "discord.js";

export class Discord {
  private static readonly globalCommandBuilders: SlashCommandBuilder[] = [
    Ping.builder,
  ];

  private static readonly guildCommandBuilders: SlashCommandBuilder[] = [];

  private static _client: Client | null = null;

  public static async DeployCommands(guildIds: string[]): Promise<void> {
    const rest: REST = new REST({
      "version": "10",
    }).setToken(Constants.environment.DISCORD_BOT_TOKEN);
    await this.DeployGlobalCommands(rest);
    await this.DeployGuildCommands(
      rest,
      guildIds,
    );
  }

  private static async DeployGlobalCommands(rest: REST): Promise<void> {
    console.log("Deploying global commands...");
    await rest.put(
      Routes.applicationCommands(Constants.environment.DISCORD_APPLICATION_ID),
      {
        "body": this.globalCommandBuilders,
      },
    );
    console.log("Successfully deployed global commands.");
  }

  private static async DeployGuildCommands(rest: REST, guildIds: string[]): Promise<void> {
    console.log("Deploying guild commands...");
    const promises: Array<Promise<unknown>> = guildIds.map(async(guildId: string) => await rest.put(
      Routes.applicationGuildCommands(
        Constants.environment.DISCORD_APPLICATION_ID,
        guildId,
      ),
      {
        "body": this.guildCommandBuilders,
      },
    ));
    await Promise.all(promises);
    console.log("Successfully deployed guild commands.");
  }

  public static get client(): Client {
    if (this._client === null) {
      this._client = new Client({
        "intents": [
          "DirectMessages",
          "Guilds",
          "GuildMessages",
        ],
      });
    }
    return this._client;
  }
}

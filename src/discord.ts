import {
  Client,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import {
  Constants,
} from "./constants";
import type {
  Command,
} from "./types";

export type {
  CommandInteraction as DiscordCommandInteraction,
} from "discord.js";

export class Discord {
  private static _client: Client | null = null;

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

  private static async deployGlobalCommands(
    rest: REST,
    commandMap: Record<string, Command>,
    builderMap: Record<string, SlashCommandBuilder>,
  ): Promise<void> {
    console.log("Deploying global commands...");
    const commandBuilders: SlashCommandBuilder[] = Object.entries(commandMap)
      .filter(([
        _,
        value,
      ]) => value.isGlobal)
      .map(([
        key,
      ]) => builderMap[key]);
    await rest.put(
      Routes.applicationCommands(Constants.config.discordApplicationId),
      {
        "body": commandBuilders,
      },
    );
    console.log("Successfully deployed global commands.");
  }

  private static async deployGuildCommands(
    rest: REST,
    commandMap: Record<string, Command>,
    builderMap: Record<string, SlashCommandBuilder>,
    guildIds: string[],
  ): Promise<void> {
    console.log("Deploying guild commands...");
    const commandBuilders: SlashCommandBuilder[] = Object.entries(commandMap)
      .filter(([
        _,
        value,
      ]) => value.isGuild)
      .map(([
        key,
      ]) => builderMap[key]);
    const promises: Promise<unknown>[] = guildIds.map(async(guildId: string) => await rest.put(
      Routes.applicationGuildCommands(
        Constants.config.discordApplicationId,
        guildId,
      ),
      {
        "body": commandBuilders,
      },
    ));
    await Promise.all(promises);
    console.log("Successfully deployed guild commands.");
  }

  public static async deployCommands(
    commandMap: Record<string, Command>,
    guildIds: string[] | undefined = undefined,
  ): Promise<void> {
    const rest: REST = new REST({
      "version": "10",
    }).setToken(Constants.config.discordBotToken);
    if (guildIds === undefined) {
      guildIds = Array.from(this.client.guilds.cache.keys());
    }
    const builderMap: Record<string, SlashCommandBuilder> = Object.fromEntries(Object.entries(commandMap).map(([
      key,
      value,
    ]) => [
      key,
      new SlashCommandBuilder().setName(value.name).setDescription(value.description),
    ]));
    await this.deployGlobalCommands(
      rest,
      commandMap,
      builderMap,
    );
    await this.deployGuildCommands(
      rest,
      commandMap,
      builderMap,
      guildIds,
    );
  }
}

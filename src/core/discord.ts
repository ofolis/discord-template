import * as discordJs from "discord.js";
import {
  ChannelMessage,
  CommandOptionType,
  CommandRegistrationType,
  Environment,
  Log,
} from ".";
import { Command } from "../core";

export class Discord {
  private static __client: discordJs.Client | null = null;

  public static get client(): discordJs.Client {
    if (this.__client === null) {
      Log.debug("Creating Discord client...");
      this.__client = new discordJs.Client({
        intents: ["Guilds"],
      });
      Log.debug("Discord client created successfully.");
    }
    return this.__client;
  }

  public static async deployCommands(
    commandList: Command[],
    guildIds?: string[],
  ): Promise<void> {
    Log.debug("Deploying Discord commands...", {
      commandCount: commandList.length,
      guildIds,
    });
    const rest: discordJs.REST = new discordJs.REST({
      version: "10",
    }).setToken(Environment.config.discordBotToken);
    const globalCommandMap: Record<string, discordJs.SlashCommandBuilder> = {};
    const guildCommandMap: Record<string, discordJs.SlashCommandBuilder> = {};
    commandList.forEach(command => {
      const slashCommandBuilder: discordJs.SlashCommandBuilder =
        new discordJs.SlashCommandBuilder()
          .setName(command.name)
          .setDescription(command.description);
      command.options.forEach(option => {
        switch (option.type) {
          case CommandOptionType.BOOLEAN:
            slashCommandBuilder.addBooleanOption(booleanOption =>
              booleanOption
                .setName(option.name)
                .setDescription(option.description)
                .setRequired(option.isRequired),
            );
            break;
          case CommandOptionType.INTEGER:
            slashCommandBuilder.addIntegerOption(integerOption =>
              integerOption
                .setName(option.name)
                .setDescription(option.description)
                .setRequired(option.isRequired)
                .setMaxValue(option.maxValue)
                .setMinValue(option.minValue),
            );
            break;
          case CommandOptionType.NUMBER:
            slashCommandBuilder.addNumberOption(numberOption =>
              numberOption
                .setName(option.name)
                .setDescription(option.description)
                .setRequired(option.isRequired)
                .setMaxValue(option.maxValue)
                .setMinValue(option.minValue),
            );
            break;
          case CommandOptionType.STRING:
            slashCommandBuilder.addStringOption(stringOption =>
              stringOption
                .setName(option.name)
                .setDescription(option.description)
                .setRequired(option.isRequired)
                .setMaxLength(option.maxLength)
                .setMinLength(option.minLength),
            );
            break;
          default:
            Log.throw("Cannot build command. Unknown command option type.", {
              option,
            });
        }
      });
      switch (command.registrationType) {
        case CommandRegistrationType.GLOBAL:
          if (command.name in globalCommandMap) {
            Log.throw(
              "Cannot deploy global commands. Names in command list are not unique.",
              { commandNames: commandList.map(command => command.name) },
            );
          }
          globalCommandMap[command.name] = slashCommandBuilder;
          break;
        case CommandRegistrationType.GUILD:
          if (command.name in guildCommandMap) {
            Log.throw(
              "Cannot deploy guild commands. Names in command list are not unique.",
              { commandNames: commandList.map(command => command.name) },
            );
          }
          guildCommandMap[command.name] = slashCommandBuilder;
          break;
        default:
          Log.throw("Cannot deploy command. Unknown registration type.", {
            command,
          });
      }
    });
    guildIds = guildIds ?? Array.from(this.client.guilds.cache.keys());
    await this.__deployGlobalCommands(rest, Object.values(globalCommandMap));
    await this.__deployGuildCommands(
      rest,
      Object.values(guildCommandMap),
      guildIds,
    );
    Log.debug("Discord commands deployed successfully.");
  }

  public static formatAvatarUrl(
    user: Pick<discordJs.User, "avatar" | "id">,
  ): string | null {
    if (user.avatar === null) {
      return null;
    }
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=240`;
  }

  public static formatChannelMentionString(): string {
    return "@everyone";
  }

  public static formatUserMentionString(
    user: Pick<discordJs.User, "id">,
  ): string {
    return `<@${user.id}>`;
  }

  public static formatUserNameString(
    user: Pick<discordJs.User, "globalName" | "username">,
  ): string {
    return user.globalName ?? user.username;
  }

  public static async sendChannelMessage(
    channelId: string,
    messageCreateOptions: discordJs.MessageCreateOptions,
  ): Promise<ChannelMessage> {
    Log.debug("Sending Discord channel message...", { channelId });
    const channel: discordJs.TextChannel = this.__getChannel(channelId);
    const message: discordJs.Message = await channel.send(messageCreateOptions);
    Log.debug("Discord message sent successfully.", { messageId: message.id });
    const channelMessage: ChannelMessage = new ChannelMessage(
      message,
      channelId,
    );
    return channelMessage;
  }

  private static async __deployGlobalCommands(
    rest: discordJs.REST,
    commands: discordJs.SlashCommandBuilder[],
  ): Promise<void> {
    Log.debug("Deploying global commands to Discord...", {
      commandCount: commands.length,
    });
    await rest.put(
      discordJs.Routes.applicationCommands(
        Environment.config.discordApplicationId,
      ),
      {
        body: commands,
      },
    );
    Log.debug("Discord global commands deployed successfully.");
  }

  private static async __deployGuildCommands(
    rest: discordJs.REST,
    commands: discordJs.SlashCommandBuilder[],
    guildIds: string[],
  ): Promise<void> {
    Log.debug("Deploying commands to Discord guilds...", {
      commandCount: commands.length,
      guildIds,
    });
    await Promise.all(
      guildIds.map(guildId =>
        rest.put(
          discordJs.Routes.applicationGuildCommands(
            Environment.config.discordApplicationId,
            guildId,
          ),
          {
            body: commands,
          },
        ),
      ),
    );
    Log.debug("Discord guild commands deployed successfully.");
  }

  private static __getChannel(channelId: string): discordJs.TextChannel {
    Log.debug("Retrieving Discord channel...", { channelId });
    const channel: discordJs.Channel | undefined =
      this.client.channels.cache.get(channelId);
    if (channel === undefined) {
      Log.throw(
        "Cannot get Discord channel. ID was not found in the channel cache.",
        { channelId },
      );
    }
    if (channel.type !== discordJs.ChannelType.GuildText) {
      Log.throw(
        "Cannot get Discord channel. Channel at ID was not a guild text channel.",
        { channelId, channelType: channel.type },
      );
    }
    Log.debug("Discord channel retrieved successfully.", {
      channelId,
      channelType: channel.type,
    });
    return channel;
  }
}

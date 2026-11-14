import * as discordJs from "discord.js";
import {
  ChannelMessage,
  CommandOptionType,
  CommandRegistrationType,
  Environment,
  Log,
} from ".";
import { Command, resolveRequiredMemberPermissions } from "../core";
import { sanitizeBaseMessageOptions } from "./message-options";

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
    const globalCommandMap: Map<string, discordJs.SlashCommandBuilder> =
      new Map();
    const guildCommandMap: Map<string, discordJs.SlashCommandBuilder> =
      new Map();
    commandList.forEach(command => {
      const requiredMemberPermissions: bigint | undefined =
        resolveRequiredMemberPermissions(command);
      const slashCommandBuilder: discordJs.SlashCommandBuilder =
        new discordJs.SlashCommandBuilder()
          .setName(command.name)
          .setDescription(command.description);
      if (requiredMemberPermissions !== undefined) {
        slashCommandBuilder.setDefaultMemberPermissions(
          requiredMemberPermissions,
        );
      }
      command.options.forEach(option => {
        if (
          option.type === CommandOptionType.STRING &&
          ((option.minLength !== undefined &&
            (!Number.isInteger(option.minLength) ||
              option.minLength < 0 ||
              option.minLength > 6000)) ||
            (option.maxLength !== undefined &&
              (!Number.isInteger(option.maxLength) ||
                option.maxLength < 1 ||
                option.maxLength > 6000)) ||
            (option.minLength !== undefined &&
              option.maxLength !== undefined &&
              option.minLength > option.maxLength))
        ) {
          Log.throw("Cannot build command. Invalid string option bounds.", {
            maxLength: option.maxLength,
            minLength: option.minLength,
            optionName: option.name,
          });
        }
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
            slashCommandBuilder.addStringOption(stringOption => {
              const stringOptionBuilder: discordJs.SlashCommandStringOption =
                stringOption
                  .setName(option.name)
                  .setDescription(option.description)
                  .setRequired(option.isRequired);
              if (option.minLength !== undefined) {
                stringOptionBuilder.setMinLength(option.minLength);
              }
              if (option.maxLength !== undefined) {
                stringOptionBuilder.setMaxLength(option.maxLength);
              }
              return stringOptionBuilder;
            });
            break;
          case CommandOptionType.USER:
            slashCommandBuilder.addUserOption(userOption =>
              userOption
                .setName(option.name)
                .setDescription(option.description)
                .setRequired(option.isRequired),
            );
            break;
          default:
            Log.throw("Cannot build command. Unknown command option type.", {
              optionName: "unknown",
              optionType: "unknown",
            });
        }
      });
      switch (command.registrationType) {
        case CommandRegistrationType.GLOBAL:
          if (globalCommandMap.has(command.name)) {
            Log.throw(
              "Cannot deploy global commands. Names in command list are not unique.",
              { commandNames: commandList.map(command => command.name) },
            );
          }
          globalCommandMap.set(command.name, slashCommandBuilder);
          break;
        case CommandRegistrationType.GUILD:
          if (guildCommandMap.has(command.name)) {
            Log.throw(
              "Cannot deploy guild commands. Names in command list are not unique.",
              { commandNames: commandList.map(command => command.name) },
            );
          }
          guildCommandMap.set(command.name, slashCommandBuilder);
          break;
        default:
          Log.throw("Cannot deploy command. Unknown registration type.", {
            commandName: command.name,
            registrationType: command.registrationType,
          });
      }
    });
    guildIds = guildIds ?? Array.from(this.client.guilds.cache.keys());
    await this.__deployGlobalCommands(rest, [...globalCommandMap.values()]);
    await this.__deployGuildCommands(
      rest,
      [...guildCommandMap.values()],
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
    const safeMessageCreateOptions: discordJs.MessageCreateOptions =
      sanitizeBaseMessageOptions(messageCreateOptions);
    Log.debug("Sending Discord channel message...", { channelId });
    const channel: discordJs.TextChannel = await this.__getChannel(channelId);
    const message: discordJs.Message = await channel.send(
      safeMessageCreateOptions,
    );
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

  private static async __getChannel(
    channelId: string,
  ): Promise<discordJs.TextChannel> {
    Log.debug("Retrieving Discord channel...", { channelId });
    let channel: discordJs.Channel | null | undefined =
      this.client.channels.cache.get(channelId);
    if (channel === undefined) {
      try {
        channel = await this.client.channels.fetch(channelId);
      } catch (reason: unknown) {
        if (this.__isUnknownChannelError(reason)) {
          channel = null;
        } else {
          Log.throw("Cannot get Discord channel. Fetch failed.", {
            channelId,
            error: Log.summarizeError(reason),
          });
        }
      }
    }
    if (channel === null) {
      Log.throw("Cannot get Discord channel. ID was not found.", { channelId });
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

  private static __isUnknownChannelError(reason: unknown): boolean {
    return (
      typeof reason === "object" &&
      reason !== null &&
      "code" in reason &&
      reason.code === 10003
    );
  }
}

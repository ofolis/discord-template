import * as discordJs from "discord.js";
import { ChannelMessage } from ".";
import { CommandOptionType, Log } from "../..";
import {
  hasCommandOptionValue,
  isCommandOptionValueValid,
} from "./command-option-utils";

export class ChannelCommandMessage extends ChannelMessage {
  private __commandOptions: discordJs.CommandInteractionOption[] | undefined;

  private __guildMember: discordJs.GuildMember;

  private __user: discordJs.User;

  private constructor(
    interactionResponse: discordJs.InteractionResponse,
    channelId: string,
    user: discordJs.User,
    guildMember: discordJs.GuildMember,
    commandOptions?: discordJs.CommandInteractionOption[],
  ) {
    super(interactionResponse, channelId);
    this.__commandOptions = commandOptions;
    this.__guildMember = guildMember;
    this.__user = user;
    this._buttonInteractionFilter = (i): boolean =>
      i.user.id === this.__user.id;
    Log.debug("Channel command message context added.");
  }

  public get member(): discordJs.GuildMember {
    return this.__guildMember;
  }

  public get user(): discordJs.User {
    return this.__user;
  }

  public static async create(
    commandInteraction: discordJs.CommandInteraction,
    isPrivate: boolean,
  ): Promise<ChannelCommandMessage> {
    if (!(commandInteraction.member instanceof discordJs.GuildMember)) {
      Log.throw(
        "Cannot create channel command message. Member is not a Discord guild member instance.",
      );
    }
    if (commandInteraction.deferred || commandInteraction.replied) {
      Log.throw(
        "Cannot create channel command message. Interaction is already acknowledged.",
      );
    }
    Log.debug("Deferring command interaction...");
    const interactionResponse: discordJs.InteractionResponse =
      await commandInteraction.deferReply({ ephemeral: isPrivate });
    Log.debug("Command interaction deferred successfully.");
    return new ChannelCommandMessage(
      interactionResponse,
      commandInteraction.channelId,
      commandInteraction.user,
      commandInteraction.member,
      [...commandInteraction.options.data],
    );
  }

  public getCommandOption(
    name: string,
    type: CommandOptionType.BOOLEAN,
  ): boolean | undefined;

  public getCommandOption(
    name: string,
    type: CommandOptionType.INTEGER | CommandOptionType.NUMBER,
  ): number | undefined;

  public getCommandOption(
    name: string,
    type: CommandOptionType.STRING,
  ): string | undefined;

  public getCommandOption(
    name: string,
    type: CommandOptionType.USER,
  ): discordJs.User | undefined;

  public getCommandOption(
    name: string,
    type: CommandOptionType,
  ): boolean | number | string | discordJs.User | undefined {
    if (this.__commandOptions === undefined) {
      Log.throw(
        "Cannot get command option. Command options have not been set.",
      );
    }
    const option: discordJs.CommandInteractionOption | undefined =
      this.__commandOptions.find(opt => opt.name === name);
    if (option === undefined || !hasCommandOptionValue(option, type)) {
      // Option is intentionally undefined
      return undefined;
    }
    if (!isCommandOptionValueValid(option, type)) {
      Log.throw("Cannot get command option. Type mismatch.", {
        expectedType: type,
      });
    }
    if (type === CommandOptionType.USER) {
      return option.user;
    }
    return option.value;
  }
}

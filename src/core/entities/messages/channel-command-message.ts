import * as discordJs from "discord.js";
import { ChannelMessage } from ".";
import { CommandOptionType, Log } from "../..";
import { isCommandOptionValueValid } from "./command-option-utils";

export type CommandGuildMember = Pick<discordJs.GuildMember, "nickname">;

export class ChannelCommandMessage extends ChannelMessage {
  private __commandOptions: discordJs.CommandInteractionOption[] | undefined;

  private __guildMember: CommandGuildMember;

  private __user: discordJs.User;

  private constructor(
    interactionResponse: discordJs.InteractionResponse,
    channelId: string,
    user: discordJs.User,
    guildMember: CommandGuildMember,
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

  public get member(): CommandGuildMember {
    return this.__guildMember;
  }

  public get user(): discordJs.User {
    return this.__user;
  }

  public static async create(
    commandInteraction: discordJs.ChatInputCommandInteraction,
    isPrivate: boolean,
  ): Promise<ChannelCommandMessage> {
    if (commandInteraction.deferred || commandInteraction.replied) {
      Log.throw(
        "Cannot create channel command message. Interaction is already acknowledged.",
      );
    }
    const guildMember: CommandGuildMember = resolveCommandGuildMember(
      commandInteraction.member,
    );
    Log.debug("Deferring command interaction...");
    const interactionResponse: discordJs.InteractionResponse =
      await commandInteraction.deferReply({ ephemeral: isPrivate });
    Log.debug("Command interaction deferred successfully.");
    return new ChannelCommandMessage(
      interactionResponse,
      commandInteraction.channelId,
      commandInteraction.user,
      guildMember,
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
    if (option === undefined) {
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

function resolveCommandGuildMember(
  member: discordJs.GuildMember | discordJs.APIInteractionGuildMember | null,
): CommandGuildMember {
  if (member instanceof discordJs.GuildMember) {
    return member;
  }
  if (typeof member !== "object" || member === null) {
    Log.throw(
      "Cannot create channel command message. Guild member data is malformed.",
    );
  }
  const rawMember: Record<string, unknown> = member as unknown as Record<
    string,
    unknown
  >;
  if (
    typeof rawMember.user !== "object" ||
    rawMember.user === null ||
    typeof rawMember.permissions !== "string" ||
    !/^\d+$/u.test(rawMember.permissions) ||
    (rawMember.nick !== undefined &&
      rawMember.nick !== null &&
      typeof rawMember.nick !== "string")
  ) {
    Log.throw(
      "Cannot create channel command message. Guild member data is malformed.",
    );
  }
  return {
    nickname: typeof rawMember.nick === "string" ? rawMember.nick : null,
  };
}

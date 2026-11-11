import * as discordJs from "discord.js";
import { DirectMessage } from ".";
import { CommandOptionType, Log } from "../..";
import {
  hasCommandOptionValue,
  isCommandOptionValueValid,
} from "./command-option-utils";

export class DirectCommandMessage extends DirectMessage {
  private __commandOptions: discordJs.CommandInteractionOption[] | undefined;

  private constructor(
    interactionResponse: discordJs.InteractionResponse,
    user: discordJs.User,
    commandOptions?: discordJs.CommandInteractionOption[],
  ) {
    super(interactionResponse, user);
    this.__commandOptions = commandOptions;
    Log.debug("Direct command message context added.");
  }

  public static async create(
    commandInteraction: discordJs.CommandInteraction,
    isPrivate: boolean,
  ): Promise<DirectCommandMessage> {
    if (commandInteraction.deferred || commandInteraction.replied) {
      Log.throw(
        "Cannot create direct command message. Interaction is already acknowledged.",
      );
    }
    Log.debug("Deferring command interaction...");
    const interactionResponse: discordJs.InteractionResponse =
      await commandInteraction.deferReply({ ephemeral: isPrivate });
    Log.debug("Command interaction deferred successfully.");
    return new DirectCommandMessage(
      interactionResponse,
      commandInteraction.user,
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

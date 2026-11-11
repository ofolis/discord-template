import * as discordJs from "discord.js";
import { CommandOptionType } from "../..";

export function hasCommandOptionValue(
  option: discordJs.CommandInteractionOption,
  type: CommandOptionType,
): boolean {
  return type === CommandOptionType.USER
    ? option.user !== undefined
    : option.value !== undefined;
}

export function isCommandOptionValueValid(
  option: discordJs.CommandInteractionOption,
  type: CommandOptionType,
): boolean {
  switch (type) {
    case CommandOptionType.BOOLEAN:
      return (
        option.type === discordJs.ApplicationCommandOptionType.Boolean &&
        typeof option.value === "boolean"
      );
    case CommandOptionType.INTEGER:
      return (
        option.type === discordJs.ApplicationCommandOptionType.Integer &&
        typeof option.value === "number"
      );
    case CommandOptionType.NUMBER:
      return (
        option.type === discordJs.ApplicationCommandOptionType.Number &&
        typeof option.value === "number"
      );
    case CommandOptionType.STRING:
      return (
        option.type === discordJs.ApplicationCommandOptionType.String &&
        typeof option.value === "string"
      );
    case CommandOptionType.USER:
      return (
        option.type === discordJs.ApplicationCommandOptionType.User &&
        option.user instanceof discordJs.User
      );
  }
}

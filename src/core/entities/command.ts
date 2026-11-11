import { ChannelCommandMessage } from ".";
import { CommandRegistrationType } from "../enums";
import { CommandOption } from "../types";

export abstract class Command {
  abstract description: string;

  abstract isPrivate: boolean;

  abstract name: string;

  abstract options: CommandOption[];

  abstract registrationType: CommandRegistrationType;

  abstract execute(message: ChannelCommandMessage): Promise<void>;
}

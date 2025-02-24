import { ChannelCommandMessage } from ".";
import { CommandOption } from "../types";

export abstract class Command {
  abstract description: string;

  abstract isGlobal: boolean;

  abstract isGuild: boolean;

  abstract isPrivate: boolean;

  abstract name: string;

  abstract options: CommandOption[];

  abstract execute(message: ChannelCommandMessage): Promise<void>;
}

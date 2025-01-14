import { DiscordCommandInteraction } from "./discord";

export abstract class Command {
  abstract description: string;

  abstract isGlobal: boolean;

  abstract isGuild: boolean;

  abstract name: string;

  abstract execute(interaction: DiscordCommandInteraction): Promise<void>;
}

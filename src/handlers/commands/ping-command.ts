import { Command } from "../../core";
import { Discord, type DiscordCommandInteraction } from "../../core/discord";

export class PingCommand implements Command {
  public readonly description = 'Responds with "Pong!".';

  public readonly isGlobal = false;

  public readonly isGuild = true;

  public readonly name = "info";

  public async execute(interaction: DiscordCommandInteraction): Promise<void> {
    await Discord.sendMessage(interaction.channelId, "Pong!");
  }
}

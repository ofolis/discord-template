import {
  type CommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export class Ping {
  public static get builder(): SlashCommandBuilder {
    const builder: SlashCommandBuilder = new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Replies with Pong!");
    return builder;
  }

  public static async execute(interaction: CommandInteraction): Promise<void> {
    await interaction.reply("Pong!");
  }
}

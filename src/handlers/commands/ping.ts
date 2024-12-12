import type {
  DiscordCommandInteraction,
} from "../../discord";
import type {
  Command,
} from "../../types";

export const command: Command = {
  "name": "ping",
  "description": "Responds with \"Pong!\".",
  "isGlobal": false,
  "isGuild": true,
  "execute": async(interaction: DiscordCommandInteraction): Promise<void> => {
    await interaction.reply("Pong!");
  },
};

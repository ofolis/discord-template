import type {
  DiscordCommandInteraction,
} from "../../discord";
import type {
  Command,
} from "../../types";

export const command: Command = {
  "description": "Responds with \"Pong!\".",
  "execute": async(interaction: DiscordCommandInteraction): Promise<void> => {
    await interaction.reply("Pong!");
  },
  "isGlobal": false,
  "isGuild": true,
  "name": "ping",
};

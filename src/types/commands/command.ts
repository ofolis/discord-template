import type {
  DiscordCommandInteraction,
} from "../../discord";

export type Command = {
  "description": string;
  "execute": (interaction: DiscordCommandInteraction) => Promise<void>;
  "isGlobal": boolean;
  "isGuild": boolean;
  "name": string;
};

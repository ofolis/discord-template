import type * as discordJs from "discord.js";
import { Log } from "./log";

export const DISCORD_MESSAGE_CONTENT_MAX_LENGTH: number = 2000;

export const DISCORD_EMBED_DESCRIPTION_MAX_LENGTH: number = 4096;

type MessageOptionsWithSafetyFields = {
  readonly allowedMentions?: discordJs.MessageMentionOptions;
  readonly content?: string | null;
  readonly embeds?: readonly (
    | discordJs.JSONEncodable<discordJs.APIEmbed>
    | discordJs.APIEmbed
  )[];
};

export function sanitizeBaseMessageOptions<
  T extends MessageOptionsWithSafetyFields,
>(options: T): T {
  if (
    options.content !== undefined &&
    options.content !== null &&
    typeof options.content !== "string"
  ) {
    Log.throw("Cannot send or update Discord message. Content is malformed.");
  }
  if (
    typeof options.content === "string" &&
    options.content.length > DISCORD_MESSAGE_CONTENT_MAX_LENGTH
  ) {
    Log.throw("Cannot send or update Discord message. Content is too long.", {
      maxLength: DISCORD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  }
  options.embeds?.forEach(embed => {
    const embedData: discordJs.APIEmbed | discordJs.EmbedData =
      typeof embed === "object" && "toJSON" in embed ? embed.toJSON() : embed;
    if (
      typeof embedData.description === "string" &&
      embedData.description.length > DISCORD_EMBED_DESCRIPTION_MAX_LENGTH
    ) {
      Log.throw(
        "Cannot send or update Discord message. Embed description is too long.",
        { maxLength: DISCORD_EMBED_DESCRIPTION_MAX_LENGTH },
      );
    }
  });
  return {
    ...options,
    allowedMentions: {
      ...(options.allowedMentions ?? {}),
      parse: options.allowedMentions?.parse ?? [],
    },
  };
}

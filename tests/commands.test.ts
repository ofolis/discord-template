import * as discordJs from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { Ping } from "../src/commands";
import type { Command, CommandOption } from "../src/core";
import { CommandOptionType, Discord } from "../src/core";

describe("command contracts", () => {
  it("exposes the ping command registration metadata", () => {
    const command: Ping = new Ping();

    expect(command.name).toBe("ping");
    expect(command.description).toBe('Responds with "PONG!".');
    expect(command.isGlobal).toBe(false);
    expect(command.isGuild).toBe(true);
    expect(command.isPrivate).toBe(true);
    expect(command.options).toStrictEqual([]);
  });

  it("converts representative command options for Discord registration", async () => {
    const options: CommandOption[] = [
      {
        description: "A boolean value.",
        isRequired: true,
        name: "enabled",
        type: CommandOptionType.BOOLEAN,
      },
      {
        description: "An integer value.",
        isRequired: false,
        maxValue: 10,
        minValue: 1,
        name: "count",
        type: CommandOptionType.INTEGER,
      },
      {
        description: "A number value.",
        isRequired: false,
        maxValue: 10,
        minValue: 1,
        name: "ratio",
        type: CommandOptionType.NUMBER,
      },
      {
        description: "A string value.",
        isRequired: false,
        maxLength: 20,
        minLength: 1,
        name: "label",
        type: CommandOptionType.STRING,
      },
    ];
    const command: Command = {
      description: "Option conversion test.",
      execute: () => Promise.resolve(),
      isGlobal: true,
      isGuild: false,
      isPrivate: false,
      name: "option-conversion",
      options,
    };
    const put = vi
      .spyOn(discordJs.REST.prototype, "put")
      .mockResolvedValue({} as never);

    await Discord.deployCommands([command], []);

    const request = put.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    const commandBuilders = request?.body as discordJs.SlashCommandBuilder[];
    const body: discordJs.APIApplicationCommand[] = commandBuilders.map(
      commandBuilder => commandBuilder.toJSON(),
    );
    expect(body[0]).toMatchObject({
      description: "Option conversion test.",
      name: "option-conversion",
      type: discordJs.ApplicationCommandType.ChatInput,
    });
    expect(body[0]?.options).toMatchObject([
      {
        description: "A boolean value.",
        name: "enabled",
        required: true,
        type: discordJs.ApplicationCommandOptionType.Boolean,
      },
      {
        description: "An integer value.",
        max_value: 10,
        min_value: 1,
        name: "count",
        required: false,
        type: discordJs.ApplicationCommandOptionType.Integer,
      },
      {
        description: "A number value.",
        max_value: 10,
        min_value: 1,
        name: "ratio",
        required: false,
        type: discordJs.ApplicationCommandOptionType.Number,
      },
      {
        description: "A string value.",
        max_length: 20,
        min_length: 1,
        name: "label",
        required: false,
        type: discordJs.ApplicationCommandOptionType.String,
      },
    ]);
    put.mockRestore();
  });
});

describe("Discord formatting", () => {
  it("formats avatar and mention values without a client connection", () => {
    expect(Discord.formatAvatarUrl({ avatar: null, id: "123" })).toBeNull();
    expect(Discord.formatAvatarUrl({ avatar: "hash", id: "123" })).toBe(
      "https://cdn.discordapp.com/avatars/123/hash.webp?size=240",
    );
    expect(Discord.formatChannelMentionString()).toBe("@everyone");
    expect(Discord.formatUserMentionString({ id: "123" })).toBe("<@123>");
    expect(
      Discord.formatUserNameString({ globalName: "Display", username: "user" }),
    ).toBe("Display");
    expect(
      Discord.formatUserNameString({ globalName: null, username: "user" }),
    ).toBe("user");
  });
});

describe("Discord client configuration", () => {
  it("uses only the gateway intent required by the template", () => {
    const intents = Discord.client.options.intents;

    expect(intents.has(discordJs.GatewayIntentBits.Guilds)).toBe(true);
    expect(intents.has(discordJs.GatewayIntentBits.DirectMessages)).toBe(false);
    expect(intents.has(discordJs.GatewayIntentBits.GuildMessages)).toBe(false);
    expect(intents.has(discordJs.GatewayIntentBits.GuildMembers)).toBe(false);
    expect(intents.has(discordJs.GatewayIntentBits.GuildVoiceStates)).toBe(
      false,
    );
    expect(intents.has(discordJs.GatewayIntentBits.MessageContent)).toBe(false);
  });
});

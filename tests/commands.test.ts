import * as discordJs from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { Ping } from "../src/commands";
import type { Command, CommandOption } from "../src/core";
import {
  CommandOptionType,
  CommandRegistrationType,
  Discord,
} from "../src/core";

describe("command contracts", () => {
  it("exposes the ping command registration metadata", () => {
    const command: Ping = new Ping();

    expect(command.name).toBe("ping");
    expect(command.description).toBe('Responds with "PONG!".');
    expect(command.isPrivate).toBe(true);
    expect(command.requiredMemberPermissions).toBeUndefined();
    expect(command.options).toStrictEqual([]);
    expect(command.registrationType).toBe(CommandRegistrationType.GUILD);
  });

  it("serializes native default member permissions for global and guild commands", async () => {
    const globalCommand: Command = {
      requiredMemberPermissions: discordJs.PermissionFlagsBits.Administrator,
      description: "Administrator command.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "administrator-command",
      options: [],
      registrationType: CommandRegistrationType.GLOBAL,
    };
    const guildCommand: Command = {
      requiredMemberPermissions: discordJs.PermissionFlagsBits.Administrator,
      description: "Guild administrator command.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "guild-administrator-command",
      options: [],
      registrationType: CommandRegistrationType.GUILD,
    };
    const put = vi
      .spyOn(discordJs.REST.prototype, "put")
      .mockResolvedValue({} as never);

    await Discord.deployCommands([globalCommand, guildCommand], ["guild-id"]);

    const globalBuilders = put.mock.calls[0]?.[1]
      ?.body as discordJs.SlashCommandBuilder[];
    const guildBuilders = put.mock.calls[1]?.[1]
      ?.body as discordJs.SlashCommandBuilder[];
    expect(globalBuilders[0]?.toJSON()).toMatchObject({
      default_member_permissions: "8",
    });
    expect(guildBuilders[0]?.toJSON()).toMatchObject({
      default_member_permissions: "8",
    });
    put.mockRestore();
  });

  it.each([
    ["zero", 0n],
    ["invalid type", "8"],
  ])("rejects %s required member permissions", async (_description, value) => {
    const command = {
      description: "Invalid permissions.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "invalid-permissions",
      options: [],
      registrationType: CommandRegistrationType.GLOBAL,
      requiredMemberPermissions: value,
    } as unknown as Command;
    const put = vi
      .spyOn(discordJs.REST.prototype, "put")
      .mockResolvedValue({} as never);

    await expect(Discord.deployCommands([command], [])).rejects.toThrow(
      "Invalid required member permissions",
    );
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it("partitions commands by registration type and serializes each payload", async () => {
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
        minLength: 1,
        name: "label",
        type: CommandOptionType.STRING,
      },
      {
        description: "A user value.",
        isRequired: false,
        name: "user",
        type: CommandOptionType.USER,
      },
      {
        description: "A minimum-only string.",
        isRequired: false,
        minLength: 0,
        name: "minimum-only",
        type: CommandOptionType.STRING,
      },
      {
        description: "A maximum-only string.",
        isRequired: false,
        maxLength: 1,
        name: "maximum-only",
        type: CommandOptionType.STRING,
      },
      {
        description: "A boundary string.",
        isRequired: false,
        maxLength: 6000,
        minLength: 6000,
        name: "boundary",
        type: CommandOptionType.STRING,
      },
    ];
    const globalCommand: Command = {
      description: "Option conversion test.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "option-conversion",
      options,
      registrationType: CommandRegistrationType.GLOBAL,
    };
    const guildCommand: Command = {
      description: "Guild command.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "guild-command",
      options: [],
      registrationType: CommandRegistrationType.GUILD,
    };
    const put = vi
      .spyOn(discordJs.REST.prototype, "put")
      .mockResolvedValue({} as never);

    await Discord.deployCommands([globalCommand, guildCommand], ["guild-id"]);

    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[0]?.[0]).toContain("/applications/");
    expect(put.mock.calls[0]?.[0]).not.toContain("/guilds/");
    expect(put.mock.calls[1]?.[0]).toContain("/guilds/guild-id/");
    const globalBuilders = put.mock.calls[0]?.[1]
      ?.body as discordJs.SlashCommandBuilder[];
    const guildBuilders = put.mock.calls[1]?.[1]
      ?.body as discordJs.SlashCommandBuilder[];
    const globalBody: discordJs.APIApplicationCommand[] = globalBuilders.map(
      commandBuilder => commandBuilder.toJSON(),
    );
    const guildBody: discordJs.APIApplicationCommand[] = guildBuilders.map(
      commandBuilder => commandBuilder.toJSON(),
    );
    expect(globalBody[0]).toMatchObject({
      description: "Option conversion test.",
      name: "option-conversion",
      type: discordJs.ApplicationCommandType.ChatInput,
    });
    expect(globalBody[0]?.options).toMatchObject([
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
        min_length: 1,
        name: "label",
        required: false,
        type: discordJs.ApplicationCommandOptionType.String,
      },
      {
        description: "A user value.",
        name: "user",
        required: false,
        type: discordJs.ApplicationCommandOptionType.User,
      },
      {
        description: "A minimum-only string.",
        min_length: 0,
        name: "minimum-only",
        required: false,
        type: discordJs.ApplicationCommandOptionType.String,
      },
      {
        description: "A maximum-only string.",
        max_length: 1,
        name: "maximum-only",
        required: false,
        type: discordJs.ApplicationCommandOptionType.String,
      },
      {
        description: "A boundary string.",
        max_length: 6000,
        min_length: 6000,
        name: "boundary",
        required: false,
        type: discordJs.ApplicationCommandOptionType.String,
      },
    ]);
    expect(guildBody).toMatchObject([
      {
        description: "Guild command.",
        name: "guild-command",
        type: discordJs.ApplicationCommandType.ChatInput,
      },
    ]);
    put.mockRestore();
  });

  it.each([
    ["negative minimum", { minLength: -1 }],
    ["zero maximum", { maxLength: 0 }],
    ["non-integer maximum", { maxLength: 1.5 }],
    ["maximum above Discord limit", { maxLength: 6001 }],
    ["reversed bounds", { maxLength: 1, minLength: 2 }],
  ])("rejects string option with %s", async (_description, bounds) => {
    const command: Command = {
      description: "Invalid option.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "invalid-option",
      options: [
        {
          description: "Invalid string.",
          isRequired: false,
          name: "value",
          type: CommandOptionType.STRING,
          ...bounds,
        },
      ],
      registrationType: CommandRegistrationType.GLOBAL,
    };
    const put = vi
      .spyOn(discordJs.REST.prototype, "put")
      .mockResolvedValue({} as never);

    await expect(Discord.deployCommands([command], [])).rejects.toThrow(
      "Invalid string option bounds",
    );
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it("rejects an unknown registration type at runtime", async () => {
    const command = {
      description: "Invalid command.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "invalid-command",
      options: [],
      registrationType: "both",
    } as unknown as Command;
    const put = vi
      .spyOn(discordJs.REST.prototype, "put")
      .mockResolvedValue({} as never);

    await expect(Discord.deployCommands([command], [])).rejects.toThrow(
      "Unknown registration type",
    );
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it("accepts prototype-property command names and rejects real duplicates", async () => {
    const command: Command = {
      description: "Prototype property command.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "constructor",
      options: [],
      registrationType: CommandRegistrationType.GLOBAL,
    };
    const put = vi
      .spyOn(discordJs.REST.prototype, "put")
      .mockResolvedValue({} as never);

    await Discord.deployCommands([command], []);
    expect(put).toHaveBeenCalledOnce();

    await expect(
      Discord.deployCommands([command, command], []),
    ).rejects.toThrow("Names in command list are not unique");
    put.mockRestore();
  });

  it("does not log complete invalid command metadata", async () => {
    const command = {
      description: "Invalid command.",
      execute: () => Promise.resolve(),
      isPrivate: false,
      name: "safe-name",
      options: [],
      registrationType: "invalid-registration",
      secret: "synthetic-secret",
    } as unknown as Command;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const put = vi
      .spyOn(discordJs.REST.prototype, "put")
      .mockResolvedValue({} as never);

    await expect(Discord.deployCommands([command], [])).rejects.toThrow(
      "Unknown registration type",
    );

    expect(error.mock.calls.flat().join(" ")).not.toContain("synthetic-secret");
    expect(error.mock.calls.flat().join(" ")).toContain("safe-name");
    error.mockRestore();
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

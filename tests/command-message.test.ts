import * as discordJs from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Command } from "../src/core";
import {
  ChannelCommandMessage,
  CommandOptionType,
  handleCommandInteraction,
  isSupportedCommandInteraction,
  Message,
} from "../src/core";

const createMessage = (
  options: discordJs.CommandInteractionOption[],
): ChannelCommandMessage => {
  const message = Object.create(
    ChannelCommandMessage.prototype,
  ) as ChannelCommandMessage;
  Object.assign(message, { __commandOptions: options });
  return message;
};

describe("command option retrieval", () => {
  it("returns scalar values with their declared runtime types", () => {
    const message = createMessage([
      {
        name: "enabled",
        type: discordJs.ApplicationCommandOptionType.Boolean,
        value: true,
      },
      {
        name: "count",
        type: discordJs.ApplicationCommandOptionType.Integer,
        value: 3,
      },
      {
        name: "ratio",
        type: discordJs.ApplicationCommandOptionType.Number,
        value: 1.5,
      },
      {
        name: "label",
        type: discordJs.ApplicationCommandOptionType.String,
        value: "hello",
      },
    ]);

    expect(message.getCommandOption("enabled", CommandOptionType.BOOLEAN)).toBe(
      true,
    );
    expect(message.getCommandOption("count", CommandOptionType.INTEGER)).toBe(
      3,
    );
    expect(message.getCommandOption("ratio", CommandOptionType.NUMBER)).toBe(
      1.5,
    );
    expect(message.getCommandOption("label", CommandOptionType.STRING)).toBe(
      "hello",
    );
  });

  it("returns the resolved Discord user for a user option", () => {
    const user = Object.create(discordJs.User.prototype) as discordJs.User;
    const message = createMessage([
      {
        name: "user",
        type: discordJs.ApplicationCommandOptionType.User,
        user,
      },
    ]);

    expect(message.getCommandOption("user", CommandOptionType.USER)).toBe(user);
  });

  it.each([
    ["null", null],
    ["an arbitrary object", { id: "not-a-user" }],
    ["a string", "not-a-user"],
  ])("rejects %s as a resolved user", (_description, user) => {
    const message = createMessage([
      {
        name: "user",
        type: discordJs.ApplicationCommandOptionType.User,
        user: user as unknown as discordJs.User,
      },
    ]);

    expect(() =>
      message.getCommandOption("user", CommandOptionType.USER),
    ).toThrow("Type mismatch");
  });

  it("returns undefined for absent optional values", () => {
    const message = createMessage([
      {
        name: "label",
        type: discordJs.ApplicationCommandOptionType.String,
      },
    ]);

    expect(message.getCommandOption("missing", CommandOptionType.STRING)).toBe(
      undefined,
    );
    expect(() =>
      message.getCommandOption("label", CommandOptionType.STRING),
    ).toThrow("Type mismatch");
  });

  it("rejects a present option with no runtime value", () => {
    const message = createMessage([
      {
        name: "user",
        type: discordJs.ApplicationCommandOptionType.User,
      },
    ]);

    expect(() =>
      message.getCommandOption("user", CommandOptionType.USER),
    ).toThrow("Type mismatch");
  });

  it("rejects a mismatched requested type without logging the option payload", () => {
    const message = createMessage([
      {
        name: "label",
        type: discordJs.ApplicationCommandOptionType.String,
        value: "hello",
      },
    ]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      message.getCommandOption("label", CommandOptionType.INTEGER),
    ).toThrow("Type mismatch");
    expect(error.mock.calls.flat().join(" ")).not.toContain("hello");
    error.mockRestore();
  });
});

describe("command interaction acknowledgment", () => {
  it("accepts chat-input interactions and ignores context-menu interactions", () => {
    const chatInputInteraction = {
      isChatInputCommand: () => true,
    } as unknown as discordJs.Interaction;
    const contextMenuInteraction = {
      isChatInputCommand: () => false,
    } as unknown as discordJs.Interaction;

    expect(isSupportedCommandInteraction(chatInputInteraction)).toBe(true);
    expect(isSupportedCommandInteraction(contextMenuInteraction)).toBe(false);
  });

  it("does not defer an already acknowledged interaction", async () => {
    const deferReply = vi.fn();
    const interaction = {
      channelId: "channel-id",
      commandName: "test-command",
      createdAt: new Date("2026-11-11T17:00:00.000Z"),
      deferred: true,
      guild: { id: "guild-id" },
      guildId: "guild-id",
      id: "interaction-id",
      isChatInputCommand: () => true,
      member: { permissions: "0" },
      replied: false,
      deferReply,
      user: { id: "user-id" },
    } as unknown as discordJs.CommandInteraction;

    await handleCommandInteraction(interaction, []);
    expect(deferReply).not.toHaveBeenCalled();
  });
});

describe("command interaction failure handling", () => {
  class TestMessage extends Message {}

  const createResponseMessage = (
    edit: (options: discordJs.BaseMessageOptions) => Promise<unknown>,
  ): TestMessage => {
    const response = Object.create(
      discordJs.InteractionResponse.prototype,
    ) as discordJs.InteractionResponse;
    response.edit = edit;
    return new TestMessage(response);
  };

  it("tracks successful and failed finalization attempts without retrying", async () => {
    const successfulEdit = vi.fn().mockResolvedValue({});
    const successfulMessage = createResponseMessage(successfulEdit);

    expect(successfulMessage.canFinalizeInteractionResponse).toBe(true);
    await successfulMessage.update({ content: "done" });
    expect(successfulMessage.canFinalizeInteractionResponse).toBe(false);

    const failedEdit = vi.fn().mockRejectedValue(new Error("edit failed"));
    const failedMessage = createResponseMessage(failedEdit);

    await expect(failedMessage.update({ content: "failed" })).rejects.toThrow(
      "edit failed",
    );
    expect(failedMessage.canFinalizeInteractionResponse).toBe(false);
    expect(failedEdit).toHaveBeenCalledOnce();
  });

  const command: Command = {
    description: "Test command.",
    execute: () => Promise.reject(new Error("internal failure")),
    isPrivate: true,
    name: "test-command",
    options: [],
    registrationType: "GUILD" as Command["registrationType"],
  };
  const restrictedCommand: Command = {
    ...command,
    requiredMemberPermissions: discordJs.PermissionFlagsBits.Administrator,
    execute: vi.fn().mockResolvedValue(undefined),
    name: "restricted-command",
  };

  const createInteraction = (states: {
    commandName?: string;
    deferred: boolean;
    dm?: boolean;
    member?: unknown;
    replied: boolean;
    reply?: (options: discordJs.InteractionReplyOptions) => Promise<unknown>;
  }): discordJs.CommandInteraction =>
    ({
      channelId: "channel-id",
      commandName: states.commandName ?? command.name,
      createdAt: new Date("2026-11-11T17:00:00.000Z"),
      deferred: states.deferred,
      guild: states.dm === true ? null : { id: "guild-id" },
      guildId: states.dm === true ? null : "guild-id",
      id: "interaction-id",
      isChatInputCommand: () => true,
      member:
        states.dm === true ? null : (states.member ?? { permissions: "0" }),
      replied: states.replied,
      reply: states.reply,
      user: { id: "user-id" },
    }) as unknown as discordJs.CommandInteraction;

  it("executes with a raw API guild member", async () => {
    const response = Object.create(
      discordJs.InteractionResponse.prototype,
    ) as discordJs.InteractionResponse;
    response.edit = vi.fn().mockResolvedValue(undefined);
    const deferReply = vi.fn().mockResolvedValue(response);
    const execute = vi.fn(async (message: ChannelCommandMessage) => {
      expect(message.member.nickname).toBe("Raw Nickname");
      await message.update({ content: "done" });
    });
    const rawMember = {
      nick: "Raw Nickname",
      permissions: "0",
      user: { id: "user-id" },
    } as unknown as discordJs.APIInteractionGuildMember;
    const interaction = {
      ...createInteraction({
        deferred: false,
        member: rawMember,
        replied: false,
      }),
      deferReply,
      options: { data: [] },
    } as unknown as discordJs.CommandInteraction;
    const commandUnderTest: Command = {
      ...command,
      execute,
    };

    await handleCommandInteraction(interaction, [commandUnderTest]);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    ["an omitted nickname", undefined],
    ["a null nickname", null],
    ["a string nickname", "Raw Nickname"],
  ])("normalizes %s", async (_description, nick) => {
    const response = Object.create(
      discordJs.InteractionResponse.prototype,
    ) as discordJs.InteractionResponse;
    response.edit = vi.fn().mockResolvedValue(undefined);
    const deferReply = vi.fn().mockResolvedValue(response);
    const execute = vi.fn((message: ChannelCommandMessage) => {
      expect(message.member.nickname).toBe(nick ?? null);
      return Promise.resolve();
    });
    const rawMember = {
      ...(nick === undefined ? {} : { nick }),
      permissions: "0",
      user: { id: "member-user-id" },
    } as unknown as discordJs.APIInteractionGuildMember;
    const interaction = {
      ...createInteraction({
        deferred: false,
        member: rawMember,
        replied: false,
      }),
      deferReply,
      options: { data: [] },
    } as unknown as discordJs.CommandInteraction;

    await handleCommandInteraction(interaction, [{ ...command, execute }]);

    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects malformed raw member data before acknowledgment", async () => {
    const deferReply = vi.fn();
    const execute = vi.fn();
    const interaction = {
      ...createInteraction({
        deferred: false,
        member: { nick: "Nickname", user: { id: "member-user-id" } },
        replied: false,
      }),
      deferReply,
      options: { data: [] },
    } as unknown as discordJs.CommandInteraction;

    await handleCommandInteraction(interaction, [{ ...command, execute }]);

    expect(deferReply).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes with a Discord.js GuildMember", async () => {
    const response = Object.create(
      discordJs.InteractionResponse.prototype,
    ) as discordJs.InteractionResponse;
    response.edit = vi.fn().mockResolvedValue(undefined);
    const deferReply = vi.fn().mockResolvedValue(response);
    const guildMember = Object.assign(
      Object.create(discordJs.GuildMember.prototype),
      { nickname: "Cached Nickname" },
    ) as discordJs.GuildMember;
    const execute = vi.fn((message: ChannelCommandMessage) => {
      expect(message.member.nickname).toBe("Cached Nickname");
      return Promise.resolve();
    });
    const interaction = {
      ...createInteraction({
        deferred: false,
        member: guildMember,
        replied: false,
      }),
      deferReply,
      options: { data: [] },
    } as unknown as discordJs.CommandInteraction;
    const commandUnderTest: Command = {
      ...command,
      execute,
    };

    await handleCommandInteraction(interaction, [commandUnderTest]);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects unrestricted commands in DMs with an ephemeral response", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const create = vi.spyOn(ChannelCommandMessage, "create");
    const execute = vi.spyOn(command, "execute");

    await handleCommandInteraction(
      createInteraction({ deferred: false, dm: true, replied: false, reply }),
      [command],
    );

    expect(reply).toHaveBeenCalledWith({
      content: "This command is only available in a server.",
      ephemeral: true,
    });
    expect(create).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    create.mockRestore();
    execute.mockRestore();
  });

  it("responds ephemerally to an unknown chat-input command", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await handleCommandInteraction(
      createInteraction({
        commandName: "unknown-command",
        deferred: false,
        replied: false,
        reply,
      }),
      [command],
    );

    expect(reply).toHaveBeenCalledWith({
      content: "This command is unavailable.",
      ephemeral: true,
    });
  });

  it("ignores a context-menu interaction passed directly to the handler", async () => {
    const reply = vi.fn();
    const execute = vi.fn();
    const interaction = {
      ...createInteraction({ deferred: false, replied: false, reply }),
      isChatInputCommand: () => false,
    } as unknown as discordJs.CommandInteraction;

    await handleCommandInteraction(interaction, [{ ...command, execute }]);

    expect(reply).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not reply to an already-acknowledged unknown command", async () => {
    const reply = vi.fn();

    await handleCommandInteraction(
      createInteraction({
        commandName: "unknown-command",
        deferred: true,
        replied: false,
        reply,
      }),
      [command],
    );

    expect(reply).not.toHaveBeenCalled();
  });

  it("logs a failed unknown-command acknowledgment safely", async () => {
    const reply = vi.fn().mockRejectedValue(new Error("response failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleCommandInteraction(
      createInteraction({
        commandName: "unknown-command",
        deferred: false,
        replied: false,
        reply,
      }),
      [command],
    );

    expect(reply).toHaveBeenCalledOnce();
    expect(error.mock.calls.flat().join(" ")).not.toContain("response failed");
    error.mockRestore();
  });

  it("finalizes a deferred interaction with a generic response", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const message = {
      canFinalizeInteractionResponse: true,
      update,
    } as unknown as ChannelCommandMessage;
    const create = vi
      .spyOn(ChannelCommandMessage, "create")
      .mockResolvedValue(message);

    await handleCommandInteraction(
      createInteraction({ deferred: false, replied: false }),
      [command],
    );

    expect(update).toHaveBeenCalledWith({
      content: "Something went wrong while executing this command.",
    });
    create.mockRestore();
  });

  it.each([
    ["already finalized", false],
    ["failure finalization attempted", false],
  ])("does not overwrite a %s response", async (_description, canFinalize) => {
    const update = vi.fn();
    const message = {
      canFinalizeInteractionResponse: canFinalize,
      update,
    } as unknown as ChannelCommandMessage;
    const create = vi
      .spyOn(ChannelCommandMessage, "create")
      .mockResolvedValue(message);

    await handleCommandInteraction(
      createInteraction({ deferred: false, replied: false }),
      [command],
    );

    expect(update).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it("logs a failure-finalization error without retrying", async () => {
    const update = vi.fn().mockRejectedValue(new Error("finalization failed"));
    const message = {
      canFinalizeInteractionResponse: true,
      update,
    } as unknown as ChannelCommandMessage;
    const create = vi
      .spyOn(ChannelCommandMessage, "create")
      .mockResolvedValue(message);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleCommandInteraction(
      createInteraction({ deferred: false, replied: false }),
      [command],
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain("internal failure");
    expect(error.mock.calls.flat().join(" ")).not.toContain(
      "finalization failed",
    );
    error.mockRestore();
    create.mockRestore();
  });

  it.each([
    [{ deferred: true, replied: false }],
    [{ deferred: false, replied: true }],
    [{ deferred: true, replied: true }],
  ])("does not create a message for acknowledged state %o", async states => {
    const create = vi.spyOn(ChannelCommandMessage, "create");

    await handleCommandInteraction(createInteraction(states), [command]);

    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it("executes commands without permission metadata", async () => {
    const create = vi.spyOn(ChannelCommandMessage, "create").mockResolvedValue({
      canFinalizeInteractionResponse: false,
    } as unknown as ChannelCommandMessage);
    const execute = vi.spyOn(command, "execute");

    await handleCommandInteraction(
      createInteraction({ deferred: false, replied: false }),
      [command],
    );

    expect(create).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    create.mockRestore();
    execute.mockRestore();
  });

  it.each([
    ["Administrator permission", restrictedCommand, "8", true],
    ["another permission only", restrictedCommand, "4", false],
    ["missing permission information", restrictedCommand, undefined, false],
    ["malformed permission string", restrictedCommand, "not-a-number", false],
    [
      "combined permissions without all bits",
      {
        ...restrictedCommand,
        name: "combined-command",
        requiredMemberPermissions:
          discordJs.PermissionFlagsBits.ManageGuild |
          discordJs.PermissionFlagsBits.ManageChannels,
      },
      String(discordJs.PermissionFlagsBits.ManageGuild),
      false,
    ],
    [
      "all combined permissions",
      {
        ...restrictedCommand,
        name: "combined-command",
        requiredMemberPermissions:
          discordJs.PermissionFlagsBits.ManageGuild |
          discordJs.PermissionFlagsBits.ManageChannels,
      },
      String(
        discordJs.PermissionFlagsBits.ManageGuild |
          discordJs.PermissionFlagsBits.ManageChannels,
      ),
      true,
    ],
    [
      "Administrator override",
      {
        ...restrictedCommand,
        name: "combined-command",
        requiredMemberPermissions:
          discordJs.PermissionFlagsBits.ManageGuild |
          discordJs.PermissionFlagsBits.ManageChannels,
      },
      "8",
      true,
    ],
  ])(
    "checks authorization with %s",
    async (_description, commandUnderTest, permission, allowed) => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const create = vi
        .spyOn(ChannelCommandMessage, "create")
        .mockResolvedValue({
          canFinalizeInteractionResponse: false,
        } as unknown as ChannelCommandMessage);
      const execute = vi.spyOn(commandUnderTest, "execute");

      await handleCommandInteraction(
        createInteraction({
          deferred: false,
          replied: false,
          member: permission === undefined ? {} : { permissions: permission },
          reply,
          commandName: commandUnderTest.name,
        }),
        [commandUnderTest],
      );

      if (allowed) {
        expect(create).toHaveBeenCalledOnce();
        expect(execute).toHaveBeenCalledOnce();
        expect(reply).not.toHaveBeenCalled();
      } else {
        expect(create).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
        expect(reply).toHaveBeenCalledWith({
          content: "You don't have permission to use this command.",
          ephemeral: true,
        });
      }
      create.mockRestore();
      execute.mockClear();
    },
  );

  it("rejects restricted commands in DMs without acknowledging publicly", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const create = vi.spyOn(ChannelCommandMessage, "create");

    await handleCommandInteraction(
      createInteraction({
        deferred: false,
        dm: true,
        replied: false,
        reply,
        commandName: restrictedCommand.name,
      }),
      [restrictedCommand],
    );

    expect(create).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: "This command is only available in a server.",
      ephemeral: true,
    });
    create.mockRestore();
  });

  it("handles a denial reply failure without retrying acknowledgment", async () => {
    const reply = vi.fn().mockRejectedValue(new Error("reply failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleCommandInteraction(
      createInteraction({
        deferred: false,
        replied: false,
        member: { permissions: "0" },
        reply,
        commandName: restrictedCommand.name,
      }),
      [restrictedCommand],
    );

    expect(reply).toHaveBeenCalledOnce();
    expect(error.mock.calls.flat().join(" ")).not.toContain("reply failed");
    error.mockRestore();
  });

  it("rejects invalid runtime permission metadata without executing", async () => {
    const execute = vi.fn();
    const invalidCommand = {
      ...command,
      execute,
      name: "invalid-runtime-permissions",
      requiredMemberPermissions: { secret: "permission-value" },
    } as unknown as Command;
    const reply = vi.fn().mockResolvedValue(undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleCommandInteraction(
      createInteraction({
        deferred: false,
        replied: false,
        member: { permissions: "8" },
        reply,
        commandName: invalidCommand.name,
      }),
      [invalidCommand],
    );

    expect(execute).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: "You don't have permission to use this command.",
      ephemeral: true,
    });
    expect(error.mock.calls.flat().join(" ")).not.toContain("permission-value");
    error.mockRestore();
  });

  it("does not finalize when acknowledgment fails", async () => {
    const create = vi
      .spyOn(ChannelCommandMessage, "create")
      .mockRejectedValue(new Error("acknowledgment failed"));

    await handleCommandInteraction(
      createInteraction({ deferred: false, replied: false }),
      [command],
    );

    expect(create).toHaveBeenCalledOnce();
    create.mockRestore();
  });
});

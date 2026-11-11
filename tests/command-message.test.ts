import * as discordJs from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Command } from "../src/core";
import {
  ChannelCommandMessage,
  CommandOptionType,
  DirectCommandMessage,
  handleCommandInteraction,
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

  it("returns undefined for absent or missing optional values", () => {
    const message = createMessage([
      {
        name: "label",
        type: discordJs.ApplicationCommandOptionType.String,
      },
      {
        name: "user",
        type: discordJs.ApplicationCommandOptionType.User,
      },
    ]);

    expect(message.getCommandOption("missing", CommandOptionType.STRING)).toBe(
      undefined,
    );
    expect(message.getCommandOption("label", CommandOptionType.STRING)).toBe(
      undefined,
    );
    expect(message.getCommandOption("user", CommandOptionType.USER)).toBe(
      undefined,
    );
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
  it("does not defer an already acknowledged interaction", async () => {
    const deferReply = vi.fn();
    const interaction = {
      deferred: true,
      replied: false,
      deferReply,
    } as unknown as discordJs.CommandInteraction;

    await expect(
      DirectCommandMessage.create(interaction, false),
    ).rejects.toThrow("already acknowledged");
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

  const createInteraction = (states: {
    deferred: boolean;
    replied: boolean;
  }): discordJs.CommandInteraction =>
    ({
      channelId: "channel-id",
      commandName: command.name,
      createdAt: new Date("2026-11-11T17:00:00.000Z"),
      deferred: states.deferred,
      guild: null,
      id: "interaction-id",
      replied: states.replied,
      user: { id: "user-id" },
    }) as unknown as discordJs.CommandInteraction;

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

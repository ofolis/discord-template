import * as discordJs from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Discord, Message } from "../src/core";

const createClient = (
  channel: unknown,
  fetch: ReturnType<typeof vi.fn> = vi.fn(),
): {
  channels: {
    cache: Map<string, unknown>;
    fetch: ReturnType<typeof vi.fn>;
  };
} => ({
  channels: {
    cache: new Map(channel === undefined ? [] : [["channel-id", channel]]),
    fetch,
  },
});

const createChannel = (
  type: discordJs.ChannelType,
  send: ReturnType<typeof vi.fn> = vi.fn(),
): { send: ReturnType<typeof vi.fn>; type: discordJs.ChannelType } => ({
  send,
  type,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Discord channel message sending", () => {
  it("uses a cached guild text channel without fetching", async () => {
    const send = vi.fn().mockResolvedValue({ id: "message-id" });
    const fetch = vi.fn();
    vi.spyOn(Discord, "client", "get").mockReturnValue(
      createClient(
        createChannel(discordJs.ChannelType.GuildText, send),
        fetch,
      ) as never,
    );

    await Discord.sendChannelMessage("channel-id", { content: "hello" });

    expect(fetch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({
      content: "hello",
      allowedMentions: { parse: [] },
    });
  });

  it("fetches a guild text channel on a cache miss", async () => {
    const send = vi.fn().mockResolvedValue({ id: "message-id" });
    const channel = createChannel(discordJs.ChannelType.GuildText, send);
    const fetch = vi.fn().mockResolvedValue(channel);
    vi.spyOn(Discord, "client", "get").mockReturnValue(
      createClient(undefined, fetch) as never,
    );

    await Discord.sendChannelMessage("channel-id", { content: "hello" });

    expect(fetch).toHaveBeenCalledWith("channel-id");
    expect(send).toHaveBeenCalledOnce();
  });

  it("distinguishes missing and unsupported channels", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    vi.spyOn(Discord, "client", "get").mockReturnValue(
      createClient(undefined, fetch) as never,
    );
    await expect(
      Discord.sendChannelMessage("channel-id", { content: "hello" }),
    ).rejects.toThrow("ID was not found");

    vi.restoreAllMocks();
    vi.spyOn(Discord, "client", "get").mockReturnValue(
      createClient(createChannel(discordJs.ChannelType.GuildVoice)) as never,
    );
    await expect(
      Discord.sendChannelMessage("channel-id", { content: "hello" }),
    ).rejects.toThrow("not a guild text channel");
  });

  it("does not expose Discord fetch error details", async () => {
    const fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("token=synthetic-secret"), {
        code: 50001,
        requestBody: { token: "synthetic-secret" },
      }),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(Discord, "client", "get").mockReturnValue(
      createClient(undefined, fetch) as never,
    );

    await expect(
      Discord.sendChannelMessage("channel-id", { content: "hello" }),
    ).rejects.toThrow("Fetch failed");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "synthetic-secret",
    );
  });
});

describe("outbound message safety", () => {
  it.each([2000, 4096])(
    "allows the valid %s-character boundary",
    async length => {
      const edit = vi.fn().mockResolvedValue(undefined);
      const response = Object.create(
        discordJs.InteractionResponse.prototype,
      ) as discordJs.InteractionResponse;
      response.edit = edit;
      const message = new (class extends Message {})(response);
      const options =
        length === 2000
          ? { content: "x".repeat(length) }
          : { embeds: [{ description: "x".repeat(length) }] };

      await message.update(options);

      expect(edit).toHaveBeenCalledOnce();
    },
  );

  it("rejects overlong content and embed descriptions", async () => {
    const edit = vi.fn().mockResolvedValue(undefined);
    const response = Object.create(
      discordJs.InteractionResponse.prototype,
    ) as discordJs.InteractionResponse;
    response.edit = edit;
    const message = new (class extends Message {})(response);

    await expect(message.update({ content: "x".repeat(2001) })).rejects.toThrow(
      "Content is too long",
    );
    await expect(
      message.update({ embeds: [{ description: "x".repeat(4097) }] }),
    ).rejects.toThrow("Embed description is too long");
    expect(edit).not.toHaveBeenCalled();
  });

  it("suppresses implicit mentions while preserving explicit allowances", async () => {
    const send = vi.fn().mockResolvedValue({ id: "message-id" });
    const allowedMentions = { users: ["user-id"] };
    vi.spyOn(Discord, "client", "get").mockReturnValue(
      createClient(
        createChannel(discordJs.ChannelType.GuildText, send),
      ) as never,
    );
    await Discord.sendChannelMessage("channel-id", {
      content: "<@user-id>",
      allowedMentions,
    });
    expect(send.mock.calls[0]?.[0]).toEqual({
      content: "<@user-id>",
      allowedMentions: { users: ["user-id"], parse: [] },
    });
    expect(allowedMentions).toEqual({ users: ["user-id"] });
  });

  it("preserves deliberate parsed mention opt-in and applies it to edits", async () => {
    const send = vi.fn().mockResolvedValue({ id: "message-id" });
    vi.spyOn(Discord, "client", "get").mockReturnValue(
      createClient(
        createChannel(discordJs.ChannelType.GuildText, send),
      ) as never,
    );
    await Discord.sendChannelMessage("channel-id", {
      content: "@everyone",
      allowedMentions: { parse: ["everyone"] },
    });
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      allowedMentions: { parse: ["everyone"] },
    });

    const edit = vi.fn().mockResolvedValue(undefined);
    const response = Object.create(
      discordJs.InteractionResponse.prototype,
    ) as discordJs.InteractionResponse;
    response.edit = edit;
    await new (class extends Message {})(response).update({ content: "edit" });
    expect(edit).toHaveBeenCalledWith({
      content: "edit",
      allowedMentions: { parse: [] },
    });
  });
});

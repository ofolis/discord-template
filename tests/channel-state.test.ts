import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Ping } from "../src/commands";
import { DataController } from "../src/controllers";
import {
  ChannelCommandMessage,
  InvalidDomainStateError,
  JsonStore,
  StorageOperationError,
} from "../src/core";
import { ChannelState } from "../src/saveables";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { force: true, recursive: true })),
  );
});

describe("channel-state persistence", () => {
  it("rejects structurally invalid persisted channel state", () => {
    expect(() => ChannelState.fromJson({ channelId: "channel" })).toThrow(
      InvalidDomainStateError,
    );
    expect(() =>
      ChannelState.fromJson({
        channelId: "channel",
        userStates: { user: { id: "user", nickname: 42 } },
      }),
    ).toThrow(InvalidDomainStateError);
  });

  it("rejects a user-state key that differs from its nested ID", () => {
    expect(() =>
      ChannelState.fromJson({
        channelId: "channel",
        userStates: { outer: { id: "nested", nickname: null } },
      }),
    ).toThrow(InvalidDomainStateError);
  });

  it("accepts matching user-state keys and IDs", () => {
    expect(
      ChannelState.fromJson({
        channelId: "channel",
        userStates: { user: { id: "user", nickname: "before" } },
      }).toJson(),
    ).toStrictEqual({
      channelId: "channel",
      userStates: { user: { id: "user", nickname: "before" } },
    });
  });

  it("updates and preserves valid channel state in one store transaction", async () => {
    const directory: string = await mkdtemp(
      join(tmpdir(), "discord-template-"),
    );
    temporaryDirectories.push(directory);
    const store: JsonStore = new JsonStore(directory);
    await store.initialize();
    await store.write("channel", {
      channelId: "channel",
      userStates: {
        user: { id: "user", nickname: "before" },
      },
    });
    const controller: DataController = new DataController(store);
    const message: ChannelCommandMessage = {
      channelId: "channel",
      member: { nickname: "after" },
      user: { id: "user" },
    } as ChannelCommandMessage;

    await controller.updateChannelState(message, async () => {});

    await expect(store.read("channel")).resolves.toStrictEqual({
      channelId: "channel",
      userStates: {
        user: { id: "user", nickname: "after" },
      },
    });
  });

  it("does not overwrite malformed persisted state", async () => {
    const directory: string = await mkdtemp(
      join(tmpdir(), "discord-template-"),
    );
    temporaryDirectories.push(directory);
    const store: JsonStore = new JsonStore(directory);
    await store.initialize();
    const malformed = {
      channelId: "channel",
      userStates: { outer: { id: "nested", nickname: null } },
    };
    await store.write("channel", malformed);
    const controller: DataController = new DataController(store);
    const message: ChannelCommandMessage = {
      channelId: "channel",
      member: { nickname: "after" },
      user: { id: "nested" },
    } as ChannelCommandMessage;

    await expect(
      controller.updateChannelState(message, async () => {}),
    ).rejects.toBeInstanceOf(InvalidDomainStateError);
    await expect(store.read("channel")).resolves.toStrictEqual(malformed);
  });

  it("persists before invoking the success callback", async () => {
    const directory: string = await mkdtemp(
      join(tmpdir(), "discord-template-"),
    );
    temporaryDirectories.push(directory);
    const store: JsonStore = new JsonStore(directory);
    await store.initialize();
    await store.write("channel", {
      channelId: "channel",
      userStates: { user: { id: "user", nickname: "before" } },
    });
    const controller: DataController = new DataController(store);
    const message: ChannelCommandMessage = {
      channelId: "channel",
      member: { nickname: "after" },
      user: { id: "user" },
    } as ChannelCommandMessage;
    let callbackState: unknown;

    await controller.updateChannelState(message, async () => {
      callbackState = await store.read("channel");
    });

    expect(callbackState).toStrictEqual({
      channelId: "channel",
      userStates: { user: { id: "user", nickname: "after" } },
    });
  });

  it("does not invoke the success callback when persistence fails", async () => {
    const failure: StorageOperationError = new StorageOperationError("write");
    const store = {
      update: vi.fn().mockRejectedValue(failure),
    } as unknown as JsonStore;
    const controller: DataController = new DataController(store);
    const callback = vi.fn(async () => {});
    const message: ChannelCommandMessage = {
      channelId: "channel",
      member: { nickname: "after" },
      user: { id: "user" },
    } as ChannelCommandMessage;

    await expect(controller.updateChannelState(message, callback)).rejects.toBe(
      failure,
    );
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not report PONG when the atomic persistence update fails", async () => {
    const store = {
      update: vi.fn().mockRejectedValue(new StorageOperationError("write")),
    } as unknown as JsonStore;
    const ping: Ping = new Ping(new DataController(store));
    const update = vi.fn(async () => {});
    const message: ChannelCommandMessage = {
      channelId: "channel",
      member: { nickname: null },
      update,
      user: { id: "user" },
    } as unknown as ChannelCommandMessage;

    await expect(ping.execute(message)).rejects.toBeInstanceOf(
      StorageOperationError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps committed state when the Discord response fails", async () => {
    const directory: string = await mkdtemp(
      join(tmpdir(), "discord-template-"),
    );
    temporaryDirectories.push(directory);
    const store: JsonStore = new JsonStore(directory);
    await store.initialize();
    await store.write("channel", {
      channelId: "channel",
      userStates: { user: { id: "user", nickname: "before" } },
    });
    const ping: Ping = new Ping(new DataController(store));
    const message: ChannelCommandMessage = {
      channelId: "channel",
      member: { nickname: "after" },
      update: vi.fn().mockRejectedValue(new Error("Discord response failed")),
      user: { id: "user" },
    } as unknown as ChannelCommandMessage;

    await expect(ping.execute(message)).rejects.toThrow(
      "Discord response failed",
    );
    await expect(store.read("channel")).resolves.toStrictEqual({
      channelId: "channel",
      userStates: { user: { id: "user", nickname: "after" } },
    });
  });

  it("serializes concurrent updates for the same channel", async () => {
    const directory: string = await mkdtemp(
      join(tmpdir(), "discord-template-"),
    );
    temporaryDirectories.push(directory);
    const store: JsonStore = new JsonStore(directory);
    await store.initialize();
    await store.write("channel", {
      channelId: "channel",
      userStates: { user: { id: "user", nickname: "before" } },
    });
    const controller: DataController = new DataController(store);
    const message = (nickname: string): ChannelCommandMessage =>
      ({
        channelId: "channel",
        member: { nickname },
        user: { id: "user" },
      }) as ChannelCommandMessage;

    await Promise.all([
      controller.updateChannelState(message("first"), async () => {}),
      controller.updateChannelState(message("second"), async () => {}),
    ]);

    await expect(store.read("channel")).resolves.toStrictEqual({
      channelId: "channel",
      userStates: { user: { id: "user", nickname: "second" } },
    });
  });
});

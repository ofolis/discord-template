import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { DataController } from "../src/controllers";
import {
  ChannelCommandMessage,
  InvalidDomainStateError,
  JsonStore,
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
});

import * as discordJs from "discord.js";
import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationLifecycle,
  ApplicationLifecycleState,
} from "../src/application-lifecycle";
import { JsonStore } from "../src/core";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise: Promise<T> = new Promise<T>(
    (promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    },
  );
  return { promise, reject, resolve };
}

class FakeClient extends EventEmitter {
  public readonly destroy = vi.fn<() => Promise<void>>(() => Promise.resolve());

  public readonly login = vi.fn<(token: string) => Promise<string>>(() =>
    Promise.resolve("token"),
  );
}

function createLifecycle(
  client: FakeClient,
  store: Pick<JsonStore, "initialize" | "drain"> = {
    initialize: () => Promise.resolve(),
    drain: () => Promise.resolve(),
  },
  deployCommands: (
    commands: never[],
    guildIds?: string[],
  ) => Promise<void> = () => Promise.resolve(),
): ApplicationLifecycle {
  return new ApplicationLifecycle({
    loadConfig: () => ({
      dataDirectory: "unused",
      devMode: false,
      discordApplicationId: "application-id",
      discordBotToken: "bot-token",
    }),
    createStore: () => store as JsonStore,
    createClient: () => client as unknown as discordJs.Client,
    createCommands: () => [],
    deployCommands,
  });
}

async function startRunning(
  lifecycle: ApplicationLifecycle,
  client: FakeClient,
): Promise<void> {
  const starting: Promise<void> = lifecycle.start();
  await Promise.resolve();
  client.emit("ready", client);
  await starting;
  expect(lifecycle.state).toBe("running");
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ApplicationLifecycle", () => {
  it("waits for ready and initial deployment before running", async () => {
    const client = new FakeClient();
    const deployment = createDeferred<undefined>();
    const lifecycle = createLifecycle(
      client,
      undefined,
      () => deployment.promise,
    );
    const starting: Promise<void> = lifecycle.start();

    await Promise.resolve();
    expect(lifecycle.state).toBe("starting");
    expect(client.login).toHaveBeenCalledWith("bot-token");

    client.emit("ready", client);
    await Promise.resolve();
    expect(lifecycle.state).toBe("starting");
    expect(lifecycle.activeRegistrationCount).toBe(1);

    deployment.resolve(undefined);
    await starting;
    expect(lifecycle.state).toBe("running");

    client.emit("ready", client);
    expect(lifecycle.activeRegistrationCount).toBe(0);
  });

  it("tracks accepted command work and drains it before persistence and client destruction", async () => {
    const client = new FakeClient();
    const reply = createDeferred<unknown>();
    const storeOrder: string[] = [];
    const store = {
      initialize: (): Promise<void> => Promise.resolve(),
      drain: (): Promise<void> => {
        storeOrder.push("drain");
        return Promise.resolve();
      },
    };
    client.destroy.mockImplementation((): Promise<void> => {
      storeOrder.push("destroy");
      return Promise.resolve();
    });
    const lifecycle = createLifecycle(client, store);
    await startRunning(lifecycle, client);

    const interaction = {
      channelId: "channel-id",
      commandName: "unknown",
      createdAt: new Date(),
      deferred: false,
      guild: { id: "guild-id" },
      guildId: "guild-id",
      id: "interaction-id",
      isChatInputCommand: () => true,
      replied: false,
      reply: vi.fn(() => reply.promise),
      user: { id: "user-id" },
    } as unknown as discordJs.ChatInputCommandInteraction;
    client.emit("interactionCreate", interaction);
    await Promise.resolve();
    expect(lifecycle.activeHandlerCount).toBe(1);

    const shuttingDown: Promise<void> = lifecycle.shutdown();
    expect(lifecycle.state).toBe("stopping");
    expect(client.destroy).not.toHaveBeenCalled();

    client.emit("interactionCreate", interaction);
    expect(lifecycle.activeHandlerCount).toBe(1);
    reply.resolve(undefined);
    await shuttingDown;

    expect(storeOrder).toEqual(["drain", "destroy"]);
    expect(lifecycle.state).toBe("stopped");
    expect(lifecycle.activeHandlerCount).toBe(0);
  });

  it("tracks runtime guild registration without terminating on failure", async () => {
    const client = new FakeClient();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const deployment = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("synthetic registration failure"));
    const lifecycle = createLifecycle(client, undefined, deployment);
    await startRunning(lifecycle, client);

    client.emit("guildCreate", { id: "guild-id" });
    expect(lifecycle.activeRegistrationCount).toBe(1);
    await vi.waitFor(() => {
      expect(lifecycle.activeRegistrationCount).toBe(0);
    });
    expect(consoleError).toHaveBeenCalled();
    expect(lifecycle.state).toBe("running");
  });

  it("shares one shutdown operation for repeated requests", async () => {
    const client = new FakeClient();
    const lifecycle = createLifecycle(client);
    await startRunning(lifecycle, client);

    const first: Promise<void> = lifecycle.shutdown();
    const second: Promise<void> = lifecycle.shutdown();
    expect(second).toBe(first);
    await first;
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(lifecycle.state satisfies ApplicationLifecycleState).toBe("stopped");
  });

  it("cleans up a startup failure after client creation", async () => {
    const client = new FakeClient();
    client.login.mockRejectedValue(new Error("synthetic login failure"));
    const lifecycle = createLifecycle(client);
    await expect(lifecycle.start()).rejects.toThrow("synthetic login failure");

    expect(client.destroy).toHaveBeenCalledOnce();
    expect(lifecycle.state).toBe("stopped");
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it("cancels startup when shutdown begins before login completes", async () => {
    const client = new FakeClient();
    const login = createDeferred<string>();
    client.login.mockReturnValue(login.promise);
    const lifecycle = createLifecycle(client);
    const starting: Promise<void> = lifecycle.start();

    await Promise.resolve();
    await lifecycle.shutdown();
    await starting;

    expect(lifecycle.state).toBe("stopped");
    expect(client.destroy).toHaveBeenCalledOnce();
    login.resolve("late-token");
  });

  it("sets a failure status when active work exceeds the shutdown deadline", async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const reply = createDeferred<unknown>();
    const lifecycle = createLifecycle(client);
    await startRunning(lifecycle, client);

    const interaction = {
      channelId: "channel-id",
      commandName: "unknown",
      createdAt: new Date(),
      deferred: false,
      guild: { id: "guild-id" },
      guildId: "guild-id",
      id: "interaction-id",
      isChatInputCommand: () => true,
      replied: false,
      reply: vi.fn(() => reply.promise),
      user: { id: "user-id" },
    } as unknown as discordJs.ChatInputCommandInteraction;
    client.emit("interactionCreate", interaction);
    await Promise.resolve();

    const shuttingDown: Promise<void> = lifecycle.shutdown();
    await vi.advanceTimersByTimeAsync(10_000);
    await shuttingDown;

    expect(lifecycle.state).toBe("stopped");
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    reply.resolve(undefined);
    vi.useRealTimers();
  });
});

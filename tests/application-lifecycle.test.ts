import * as discordJs from "discord.js";
import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationLifecycle,
  ApplicationLifecycleState,
} from "../src/application-lifecycle";
import { JsonStore, Log, configurationError } from "../src/core";

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
  options: {
    readonly devMode?: boolean;
    readonly flushLogging?: (timeoutMilliseconds: number) => Promise<void>;
    readonly initializeLogging?: (directory: string, devMode: boolean) => void;
  } = {},
): ApplicationLifecycle {
  return new ApplicationLifecycle({
    loadConfig: () => ({
      dataDirectory: "unused",
      devMode: options.devMode ?? false,
      discordApplicationId: "application-id",
      discordBotToken: "bot-token",
    }),
    createStore: () => store as JsonStore,
    createClient: () => client as unknown as discordJs.Client,
    createCommands: () => [],
    deployCommands,
    flushLogging:
      options.flushLogging ?? ((): Promise<void> => Promise.resolve()),
    initializeLogging: options.initializeLogging ?? ((): void => undefined),
  });
}

async function startRunning(
  lifecycle: ApplicationLifecycle,
  client: FakeClient,
): Promise<void> {
  const starting: Promise<void> = lifecycle.start();
  await Promise.resolve();
  client.emit("clientReady", client);
  await starting;
  expect(lifecycle.state).toBe("running");
}

afterEach(() => {
  vi.useRealTimers();
  Log.resetForTests();
  vi.restoreAllMocks();
});

describe("ApplicationLifecycle", () => {
  it.each([
    [false, "unused/logs"],
    [true, "logs"],
  ])(
    "initializes persistent logging after configuration and before Discord startup (%s)",
    async (devMode, expectedDirectory) => {
      const client = new FakeClient();
      const order: string[] = [];
      const initializeLogging = vi.fn((directory: string): void => {
        order.push(`initialize:${directory}`);
      });
      client.login.mockImplementation(() => {
        order.push("login");
        return Promise.resolve("token");
      });
      const lifecycle = createLifecycle(
        client,
        undefined,
        () => Promise.resolve(),
        { devMode, initializeLogging },
      );

      const starting: Promise<void> = lifecycle.start();
      await Promise.resolve();
      expect(initializeLogging).toHaveBeenCalledOnce();
      expect(initializeLogging.mock.calls[0]?.[0]).toContain(expectedDirectory);
      expect(order[0]).toContain("initialize:");
      expect(order[1]).toBe("login");

      client.emit("clientReady", client);
      await starting;
      expect(initializeLogging).toHaveBeenCalledOnce();
    },
  );

  it("shares one in-flight startup and does not duplicate initialization", async () => {
    const client = new FakeClient();
    const storeInitialization = createDeferred<undefined>();
    const initializeLogging = vi.fn((directory: string): void => {
      void directory;
    });
    const deployCommands = vi.fn(() => Promise.resolve());
    const lifecycle = createLifecycle(
      client,
      {
        initialize: () => storeInitialization.promise,
        drain: () => Promise.resolve(),
      },
      deployCommands,
      { initializeLogging },
    );

    const first: Promise<void> = lifecycle.start();
    const second: Promise<void> = lifecycle.start();
    expect(second).toBe(first);

    await Promise.resolve();
    expect(initializeLogging).toHaveBeenCalledOnce();
    expect(client.login).not.toHaveBeenCalled();

    storeInitialization.resolve(undefined);
    await Promise.resolve();
    expect(client.login).toHaveBeenCalledOnce();
    client.emit("clientReady", client);
    await first;

    expect(deployCommands).toHaveBeenCalledOnce();
  });

  it("does not reopen startup after a failed single-flight execution", async () => {
    const client = new FakeClient();
    const initializeLogging = vi.fn((): void => undefined);
    client.login.mockRejectedValue(new Error("synthetic login failure"));
    const lifecycle = createLifecycle(client, undefined, undefined, {
      initializeLogging,
    });

    const first: Promise<void> = lifecycle.start();
    const second: Promise<void> = lifecycle.start();
    await expect(first).rejects.toThrow("synthetic login failure");
    await expect(second).rejects.toThrow("synthetic login failure");
    await expect(lifecycle.start()).rejects.toThrow("synthetic login failure");

    expect(initializeLogging).toHaveBeenCalledOnce();
    expect(client.login).toHaveBeenCalledOnce();
  });

  it("classifies configuration failures before logging is initialized", async () => {
    const client = new FakeClient();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const initializeLogging = vi.fn((): void => undefined);
    const lifecycle = new ApplicationLifecycle({
      loadConfig: (): never => {
        throw configurationError("DISCORD_APPLICATION_ID", "secret=value");
      },
      createClient: (): discordJs.Client =>
        client as unknown as discordJs.Client,
      initializeLogging,
    });

    await expect(lifecycle.start()).rejects.toMatchObject({
      configField: "DISCORD_APPLICATION_ID",
      startupCode: "CONFIG_INVALID",
    });

    expect(initializeLogging).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(client.login).not.toHaveBeenCalled();
    process.exitCode = undefined;
  });

  it("continues startup when persistent logging initialization fails", async () => {
    const client = new FakeClient();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const lifecycle = createLifecycle(client, undefined, undefined, {
      initializeLogging: () => {
        throw new Error("synthetic log failure");
      },
    });

    const starting: Promise<void> = lifecycle.start();
    await Promise.resolve();
    client.emit("clientReady", client);
    await starting;

    expect(lifecycle.state).toBe("running");
    expect(consoleError).toHaveBeenCalledWith(
      "Persistent application logging unavailable.",
      { errorName: "Error" },
    );
    await lifecycle.shutdown();
  });

  it("emits trusted lifecycle events and flushes after cleanup", async () => {
    const client = new FakeClient();
    const events: string[] = [];
    const event = vi
      .spyOn(Log, "event")
      .mockImplementation((eventCode: string): void => {
        events.push(eventCode);
      });
    const order: string[] = [];
    const lifecycle = createLifecycle(
      client,
      {
        initialize: () => Promise.resolve(),
        drain: () => {
          order.push("store-drain");
          return Promise.resolve();
        },
      },
      () => Promise.resolve(),
      {
        flushLogging: (): Promise<void> => {
          order.push("log-flush");
          return Promise.resolve();
        },
      },
    );
    client.destroy.mockImplementation((): Promise<void> => {
      order.push("client-destroy");
      return Promise.resolve();
    });

    await startRunning(lifecycle, client);
    await lifecycle.shutdown();

    expect(events).toEqual([
      "APPLICATION_STARTUP_INITIATED",
      "DISCORD_CLIENT_CONNECTED",
      "COMMAND_DEPLOYMENT_COMPLETED",
      "APPLICATION_STARTUP_COMPLETED",
      "APPLICATION_SHUTDOWN_INITIATED",
      "APPLICATION_SHUTDOWN_COMPLETED",
    ]);
    expect(order).toEqual(["store-drain", "client-destroy", "log-flush"]);
    expect(
      event.mock.calls.find(
        ([eventCode]) => eventCode === "APPLICATION_SHUTDOWN_COMPLETED",
      ),
    ).toEqual(["APPLICATION_SHUTDOWN_COMPLETED", "SUCCESS", { failed: false }]);
    expect(event).toHaveBeenCalledTimes(6);
  });

  it("does not emit contradictory shutdown events after startup failure", async () => {
    const client = new FakeClient();
    const events: string[] = [];
    vi.spyOn(Log, "event").mockImplementation((eventCode: string): void => {
      events.push(eventCode);
    });
    client.login.mockRejectedValue(new Error("synthetic login failure"));
    const lifecycle = createLifecycle(client);

    await expect(lifecycle.start()).rejects.toThrow("synthetic login failure");

    expect(events).toContain("APPLICATION_STARTUP_FAILED");
    expect(events).toContain("APPLICATION_SHUTDOWN_COMPLETED");
    expect(events).not.toContain("APPLICATION_SHUTDOWN_FAILED");
  });

  it.each(["store", "client"] as const)(
    "%s cleanup failure does not emit successful shutdown completion",
    async stage => {
      const client = new FakeClient();
      const events: string[] = [];
      vi.spyOn(Log, "event").mockImplementation((eventCode: string): void => {
        events.push(eventCode);
      });
      const store = {
        initialize: (): Promise<void> => Promise.resolve(),
        drain: (): Promise<void> =>
          stage === "store"
            ? Promise.reject(new Error("synthetic drain failure"))
            : Promise.resolve(),
      };
      if (stage === "client") {
        client.destroy.mockRejectedValue(
          new Error("synthetic destroy failure"),
        );
      }
      const lifecycle = createLifecycle(client, store);
      await startRunning(lifecycle, client);

      await lifecycle.shutdown();

      expect(events).toContain("APPLICATION_SHUTDOWN_FAILED");
      expect(events).not.toContain("APPLICATION_SHUTDOWN_COMPLETED");
      process.exitCode = undefined;
    },
  );

  it("contains a rejected log flush without adding a lifecycle event", async () => {
    const client = new FakeClient();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const events: string[] = [];
    vi.spyOn(Log, "event").mockImplementation((eventCode: string): void => {
      events.push(eventCode);
    });
    const lifecycle = createLifecycle(client, undefined, undefined, {
      flushLogging: (): Promise<void> =>
        Promise.reject(new Error("synthetic flush failure")),
    });
    await startRunning(lifecycle, client);

    await lifecycle.shutdown();

    expect(consoleError).toHaveBeenCalledWith("Application log flush failed.", {
      errorName: "Error",
    });
    expect(events).toEqual([
      "APPLICATION_STARTUP_INITIATED",
      "DISCORD_CLIENT_CONNECTED",
      "COMMAND_DEPLOYMENT_COMPLETED",
      "APPLICATION_STARTUP_COMPLETED",
      "APPLICATION_SHUTDOWN_INITIATED",
      "APPLICATION_SHUTDOWN_COMPLETED",
    ]);
    process.exitCode = undefined;
  });

  it("keeps shutdown bounded when persistent logging flush stalls", async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const events: string[] = [];
    vi.spyOn(Log, "event").mockImplementation((eventCode: string): void => {
      events.push(eventCode);
    });
    const lifecycle = createLifecycle(client, undefined, undefined, {
      flushLogging: () => new Promise<void>(() => undefined),
    });
    await startRunning(lifecycle, client);

    const shuttingDown: Promise<void> = lifecycle.shutdown();
    await vi.advanceTimersByTimeAsync(10_000);
    await shuttingDown;

    expect(lifecycle.state).toBe("stopped");
    expect(events).toContain("APPLICATION_SHUTDOWN_COMPLETED");
    expect(events).not.toContain("APPLICATION_SHUTDOWN_FAILED");
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it("waits for clientReady and initial deployment before running", async () => {
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

    client.emit("clientReady", client);
    await Promise.resolve();
    expect(lifecycle.state).toBe("starting");
    expect(lifecycle.activeRegistrationCount).toBe(1);

    deployment.resolve(undefined);
    await starting;
    expect(lifecycle.state).toBe("running");

    client.emit("clientReady", client);
    expect(lifecycle.activeRegistrationCount).toBe(0);
  });

  it("treats initial deployment rejection as a startup failure", async () => {
    const client = new FakeClient();
    const deployment = createDeferred<undefined>();
    const deployCommands = vi.fn(() => deployment.promise);
    const lifecycle = createLifecycle(client, undefined, deployCommands);
    const starting: Promise<void> = lifecycle.start();

    await Promise.resolve();
    client.emit("clientReady", client);
    expect(deployCommands).toHaveBeenCalledOnce();
    expect(lifecycle.activeRegistrationCount).toBe(1);
    const startupFailure = expect(starting).rejects.toThrow(
      "synthetic initial deployment failure",
    );
    deployment.reject(new Error("synthetic initial deployment failure"));

    await startupFailure;
    expect(lifecycle.state).toBe("stopped");
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it("classifies initial deployment failures with a generic Discord operation", async () => {
    const client = new FakeClient();
    const deployment = createDeferred<undefined>();
    const events: Array<[string, string, Record<string, unknown>?]> = [];
    vi.spyOn(Log, "event").mockImplementation(
      (
        eventCode: string,
        severity: "DEBUG" | "ERROR" | "INFO" | "SUCCESS",
        fields?: Record<string, unknown>,
      ): void => {
        events.push([eventCode, severity, fields]);
      },
    );
    const lifecycle = createLifecycle(
      client,
      undefined,
      () => deployment.promise,
    );
    const starting: Promise<void> = lifecycle.start();

    await Promise.resolve();
    client.emit("clientReady", client);
    deployment.reject({ message: "payload=synthetic-secret" });

    await expect(starting).rejects.toMatchObject({
      operation: "discord-command-deployment",
      startupCode: "DISCORD_INITIALIZATION_FAILED",
    });
    const failure = events.find(
      ([eventCode]) => eventCode === "APPLICATION_STARTUP_FAILED",
    );
    expect(failure).toEqual([
      "APPLICATION_STARTUP_FAILED",
      "ERROR",
      {
        category: "DISCORD_INITIALIZATION_FAILED",
        operation: "discord-command-deployment",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("synthetic-secret");
    expect(client.destroy).toHaveBeenCalledOnce();
    process.exitCode = undefined;
  });

  it("classifies login failures and preserves single-flight identity", async () => {
    const client = new FakeClient();
    client.login.mockRejectedValue(
      Object.assign(new Error("token=synthetic-secret"), {
        code: "401: raw response",
      }),
    );
    const lifecycle = createLifecycle(client);
    const first = lifecycle.start();

    await expect(first).rejects.toMatchObject({
      operation: "discord-login",
      platformCode: undefined,
      startupCode: "DISCORD_INITIALIZATION_FAILED",
    });
    expect(lifecycle.start()).toBe(first);
    expect(client.destroy).toHaveBeenCalledOnce();
    process.exitCode = undefined;
  });

  it("classifies synchronous login exceptions as Discord initialization failures", async () => {
    const client = new FakeClient();
    client.login.mockImplementation(() => {
      throw new Error("token=synthetic-secret");
    });
    const lifecycle = createLifecycle(client);

    await expect(lifecycle.start()).rejects.toMatchObject({
      operation: "discord-login",
      startupCode: "DISCORD_INITIALIZATION_FAILED",
    });
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(lifecycle.state).toBe("stopped");
    process.exitCode = undefined;
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
    const deploymentError = new Error("synthetic registration failure");
    const deployment = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => {
        Log.error("Failed to deploy Discord guild commands.", {
          commandCount: 0,
          error: Log.summarizeError(deploymentError),
          guildCount: 1,
        });
        return Promise.reject(deploymentError);
      });
    const lifecycle = createLifecycle(client, undefined, deployment);
    await startRunning(lifecycle, client);

    client.emit("guildCreate", { id: "guild-id" });
    expect(lifecycle.activeRegistrationCount).toBe(1);
    await vi.waitFor(() => {
      expect(lifecycle.activeRegistrationCount).toBe(0);
    });
    const deploymentLogs = consoleError.mock.calls.filter(call =>
      call.some(value =>
        String(value).includes("Failed to deploy Discord guild commands"),
      ),
    );
    expect(deploymentLogs).toHaveLength(1);
    expect(
      consoleError.mock.calls.some(call =>
        call.some(value =>
          String(value).includes("Failed to deploy Discord bot on new guild"),
        ),
      ),
    ).toBe(false);
    expect(lifecycle.state).toBe("running");
  });

  it("logs client errors during startup, operation, and shutdown", async () => {
    const client = new FakeClient();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const destroy = createDeferred<undefined>();
    client.destroy.mockReturnValue(destroy.promise);
    const lifecycle = createLifecycle(client);
    const starting: Promise<void> = lifecycle.start();

    await Promise.resolve();
    client.emit("error", new Error("token=synthetic-secret"));
    expect(lifecycle.state).toBe("starting");
    client.emit("clientReady", client);
    await starting;

    client.emit("error", new Error("token=synthetic-secret"));
    expect(lifecycle.state).toBe("running");

    const stopping: Promise<void> = lifecycle.shutdown();
    await vi.waitFor(() => {
      expect(client.destroy).toHaveBeenCalledOnce();
    });
    client.emit("error", new Error("token=synthetic-secret"));
    expect(lifecycle.state).toBe("stopping");

    const runtimeErrorLogs = consoleError.mock.calls.filter(call =>
      call.some(value =>
        String(value).includes("Discord client runtime error"),
      ),
    );
    expect(runtimeErrorLogs).toHaveLength(3);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "synthetic-secret",
    );

    destroy.resolve(undefined);
    await stopping;
    expect(client.listenerCount("error")).toBe(0);
  });

  it("shares one shutdown operation for repeated requests", async () => {
    const client = new FakeClient();
    const event = vi.spyOn(Log, "event");
    const lifecycle = createLifecycle(client);
    await startRunning(lifecycle, client);

    const first: Promise<void> = lifecycle.shutdown();
    const second: Promise<void> = lifecycle.shutdown();
    expect(second).toBe(first);
    await first;
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(
      event.mock.calls.filter(
        ([eventCode]) => eventCode === "APPLICATION_SHUTDOWN_INITIATED",
      ),
    ).toHaveLength(1);
    expect(
      event.mock.calls.filter(
        ([eventCode]) => eventCode === "APPLICATION_SHUTDOWN_COMPLETED",
      ),
    ).toHaveLength(1);
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

  it("observes late readiness rejection while shutdown is draining", async () => {
    const client = new FakeClient();
    const login = createDeferred<string>();
    const drain = createDeferred<undefined>();
    const drainStarted = createDeferred<undefined>();
    const store = {
      initialize: (): Promise<void> => Promise.resolve(),
      drain: vi.fn((): Promise<void> => {
        drainStarted.resolve(undefined);
        return drain.promise;
      }),
    };
    const deployCommands = vi.fn(() => Promise.resolve());
    client.login.mockReturnValue(login.promise);
    const lifecycle = createLifecycle(client, store, deployCommands);
    const unhandledReasons: unknown[] = [];
    const observeUnhandledRejection = (reason: unknown): void => {
      unhandledReasons.push(reason);
    };
    process.on("unhandledRejection", observeUnhandledRejection);

    let stopping: Promise<void> | undefined;
    let starting: Promise<void> | undefined;
    try {
      starting = lifecycle.start();
      await Promise.resolve();
      expect(client.login).toHaveBeenCalledOnce();

      stopping = lifecycle.shutdown();
      expect(lifecycle.shutdown()).toBe(stopping);
      await drainStarted.promise;
      expect(lifecycle.state).toBe("stopping");

      client.emit("clientReady", client);
      await new Promise<void>(resolve => {
        setImmediate(resolve);
      });

      expect(unhandledReasons).toStrictEqual([]);
      expect(deployCommands).not.toHaveBeenCalled();
      expect(lifecycle.state).toBe("stopping");

      drain.resolve(undefined);
      await stopping;
      await starting;

      expect(lifecycle.state).toBe("stopped");
      expect(store.drain).toHaveBeenCalledOnce();
      expect(client.destroy).toHaveBeenCalledOnce();
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.off("unhandledRejection", observeUnhandledRejection);
      drain.resolve(undefined);
      await stopping;
      await starting;
      login.resolve("late-token");
    }
  });

  it("sets a failure status when active work exceeds the shutdown deadline", async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const reply = createDeferred<unknown>();
    const event = vi.spyOn(Log, "event");
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
    expect(
      event.mock.calls.some(
        ([eventCode]) => eventCode === "APPLICATION_SHUTDOWN_FAILED",
      ),
    ).toBe(true);
    expect(
      event.mock.calls.some(
        ([eventCode]) => eventCode === "APPLICATION_SHUTDOWN_COMPLETED",
      ),
    ).toBe(false);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    reply.resolve(undefined);
    vi.useRealTimers();
  });
});

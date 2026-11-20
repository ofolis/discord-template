import * as discordJs from "discord.js";
import { join, resolve } from "path";
import { Ping } from "./commands";
import { DataController } from "./controllers";
import type { CoreConfig } from "./core";
import {
  asStartupDiagnostic,
  Command,
  Discord,
  Environment,
  handleCommandInteraction,
  isSupportedCommandInteraction,
  JsonStore,
  Log,
  StartupDiagnosticError,
} from "./core";

export type ApplicationLifecycleState =
  | "starting"
  | "running"
  | "stopping"
  | "stopped";

const shutdownDeadlineMilliseconds: number = 10_000;

type LifecycleDependencies = {
  readonly createClient?: () => discordJs.Client;
  readonly createCommands?: (store: JsonStore) => Command[];
  readonly createStore?: (dataDirectory: string) => JsonStore;
  readonly deployCommands?: (
    commands: Command[],
    guildIds?: string[],
  ) => Promise<void>;
  readonly flushLogging?: (timeoutMilliseconds: number) => Promise<void>;
  readonly initializeLogging?: (directory: string, devMode: boolean) => void;
  readonly loadConfig?: () => CoreConfig;
};

type TimedStageResult = {
  completed: boolean;
  failed: boolean;
};

export class ApplicationLifecycle {
  private readonly __activeHandlers: Set<Promise<void>> = new Set();

  private readonly __activeRegistrations: Set<Promise<void>> = new Set();

  private __cleanupFailed: boolean = false;

  private __client: discordJs.Client | undefined;

  private __clientErrorListener: ((error: Error) => void) | undefined;

  private __clientReadyListener:
    | ((client: discordJs.Client<true>) => void)
    | undefined;

  private __commands: Command[] = [];

  private readonly __createClient: () => discordJs.Client;

  private readonly __createCommands: (store: JsonStore) => Command[];

  private readonly __createStore: (dataDirectory: string) => JsonStore;

  private readonly __deployCommands: (
    commands: Command[],
    guildIds?: string[],
  ) => Promise<void>;

  private readonly __flushLogging: (
    timeoutMilliseconds: number,
  ) => Promise<void>;

  private __guildCreateListener: ((guild: discordJs.Guild) => void) | undefined;

  private __initialDeploymentPromise: Promise<void> = Promise.resolve();

  private readonly __initializeLogging: (
    directory: string,
    devMode: boolean,
  ) => void;

  private __interactionListener:
    | ((interaction: discordJs.Interaction) => void)
    | undefined;

  private readonly __loadConfig: () => CoreConfig;

  private __loggingInitialized: boolean = false;

  private __readyObserved: boolean = false;

  private __resolveShutdownRequested!: () => void;

  private __shutdownPromise: Promise<void> | undefined;

  private __shutdownRequested: Promise<void>;

  private __signalListenersInstalled: boolean = false;

  private __startPromise: Promise<void> | undefined;

  private __state: ApplicationLifecycleState = "starting";

  private __store: JsonStore | undefined;

  public constructor(dependencies: LifecycleDependencies = {}) {
    this.__loadConfig =
      dependencies.loadConfig ?? ((): CoreConfig => Environment.loadConfig());
    this.__createStore =
      dependencies.createStore ??
      ((dataDirectory: string): JsonStore => new JsonStore(dataDirectory));
    this.__createClient =
      dependencies.createClient ?? ((): discordJs.Client => Discord.client);
    this.__createCommands =
      dependencies.createCommands ??
      ((store: JsonStore): Command[] => [new Ping(new DataController(store))]);
    this.__deployCommands =
      dependencies.deployCommands ??
      ((commands: Command[], guildIds?: string[]): Promise<void> =>
        Discord.deployCommands(commands, guildIds));
    this.__initializeLogging =
      dependencies.initializeLogging ??
      ((directory: string, devMode: boolean): void => {
        Log.initialize({ directory, devMode });
      });
    this.__flushLogging =
      dependencies.flushLogging ??
      ((timeoutMilliseconds: number): Promise<void> =>
        Log.flush(timeoutMilliseconds));
    this.__shutdownRequested = new Promise(resolve => {
      this.__resolveShutdownRequested = resolve;
    });
  }

  public get activeHandlerCount(): number {
    return this.__activeHandlers.size;
  }

  public get activeRegistrationCount(): number {
    return this.__activeRegistrations.size;
  }

  public get state(): ApplicationLifecycleState {
    return this.__state;
  }

  public installSignalHandlers(): void {
    if (this.__signalListenersInstalled) {
      return;
    }
    process.on("SIGTERM", this.__handleSignal);
    process.on("SIGINT", this.__handleSignal);
    this.__signalListenersInstalled = true;
  }

  public shutdown(startupFailure: boolean = false): Promise<void> {
    if (this.__shutdownPromise !== undefined) {
      return this.__shutdownPromise;
    }
    this.__state = "stopping";
    this.__resolveShutdownRequested();
    this.__shutdownPromise = this.__performShutdown(startupFailure);
    return this.__shutdownPromise;
  }

  public start(): Promise<void> {
    if (this.__startPromise !== undefined) {
      return this.__startPromise;
    }
    this.__startPromise = this.__performStart();
    return this.__startPromise;
  }

  private __assertStarting(): void {
    if (this.__state !== "starting") {
      throw new Error("Application shutdown requested during startup.");
    }
  }

  private __awaitStartupOperation<T>(operation: Promise<T>): Promise<T> {
    const cancellation: Promise<never> = this.__shutdownRequested.then(() => {
      throw new Error("Application shutdown requested during startup.");
    });
    void cancellation.catch(() => undefined);
    return Promise.race([operation, cancellation]);
  }

  private readonly __handleSignal = (): void => {
    void this.shutdown().catch((reason: unknown) => {
      this.__cleanupFailed = true;
      console.error("Application shutdown failed.", Log.summarizeError(reason));
      process.exitCode = 1;
    });
  };

  private __logRuntimeFailure(context: string, reason: unknown): void {
    Log.error(context, Log.summarizeError(reason));
  }

  private async __performShutdown(startupFailure: boolean): Promise<void> {
    const deadline: number = performance.now() + shutdownDeadlineMilliseconds;
    let cleanupTimedOut: boolean = false;

    if (this.__loggingInitialized) {
      Log.event("APPLICATION_SHUTDOWN_INITIATED", "INFO", {
        failed: startupFailure,
      });
    }

    const acceptedWork: Promise<unknown>[] = [
      ...this.__activeHandlers,
      ...this.__activeRegistrations,
    ];
    const workResult: TimedStageResult = await this.__settleWithin(
      Promise.allSettled(acceptedWork).then(() => undefined),
      deadline,
    );
    cleanupTimedOut ||= !workResult.completed;

    if (this.__store !== undefined) {
      const storeResult: TimedStageResult = await this.__settleWithin(
        Promise.resolve().then(() => this.__store?.drain()),
        deadline,
      );
      cleanupTimedOut ||= !storeResult.completed;
    }

    if (this.__client !== undefined) {
      const clientResult: TimedStageResult = await this.__settleWithin(
        Promise.resolve().then(() => this.__client?.destroy()),
        deadline,
      );
      cleanupTimedOut ||= !clientResult.completed;
    }

    const remaining: number = Math.max(0, deadline - performance.now());
    const cleanupFailed: boolean = cleanupTimedOut || this.__cleanupFailed;
    if (cleanupFailed && this.__loggingInitialized) {
      Log.event("APPLICATION_SHUTDOWN_FAILED", "ERROR", {
        failed: true,
        timeout: cleanupTimedOut,
      });
    }
    if (!cleanupFailed && this.__loggingInitialized) {
      Log.event("APPLICATION_SHUTDOWN_COMPLETED", "SUCCESS", {
        failed: false,
      });
    }
    const flushResult: TimedStageResult = await this.__settleWithin(
      Promise.resolve().then(() => this.__flushLogging(remaining)),
      deadline,
      "Application log flush",
      false,
    );
    if (!flushResult.completed) {
      console.error("Application log flush deadline exceeded.");
    }

    this.__removeClientListeners();
    this.__removeSignalListeners();
    this.__state = "stopped";

    if (
      startupFailure ||
      cleanupFailed ||
      flushResult.failed ||
      !flushResult.completed
    ) {
      process.exitCode = 1;
    }
    if (cleanupTimedOut) {
      console.error("Application shutdown deadline exceeded.", {
        activeHandlerCount: this.__activeHandlers.size,
        activeRegistrationCount: this.__activeRegistrations.size,
      });
    }
  }

  private async __performStart(): Promise<void> {
    try {
      const config: CoreConfig = this.__loadConfig();
      this.__assertStarting();
      this.__loggingInitialized = true;
      try {
        this.__initializeLogging(
          resolve(
            config.devMode ? "./logs" : join(config.dataDirectory, "logs"),
          ),
          config.devMode,
        );
      } catch (reason: unknown) {
        console.error(
          "Persistent application logging unavailable.",
          Log.summarizeError(reason),
        );
      }
      Log.event("APPLICATION_STARTUP_INITIATED", "INFO");
      if (config.devMode) {
        Log.info("Running in development mode.");
      }
      Log.info(
        `Initializing ${Environment.packageContext.name} (${Environment.packageContext.version ?? "DEVELOPMENT"}, ${Environment.packageContext.commitSha ?? "NO COMMIT SHA"})...`,
      );

      this.__store = this.__createStore(config.dataDirectory);
      await this.__store.initialize();
      this.__assertStarting();

      this.__commands = this.__createCommands(this.__store);
      this.__assertStarting();

      this.__client = this.__createClient();
      this.__registerClientListeners();

      try {
        const loginPromise: Promise<string> = this.__client.login(
          config.discordBotToken,
        );
        void loginPromise.catch(() => undefined);
        await this.__awaitStartupOperation(loginPromise);
      } catch (reason: unknown) {
        throw asStartupDiagnostic(
          reason,
          "DISCORD_INITIALIZATION_FAILED",
          "discord-login",
        );
      }
      this.__assertStarting();

      try {
        await this.__awaitStartupOperation(this.__initialDeploymentPromise);
      } catch (reason: unknown) {
        throw asStartupDiagnostic(
          reason,
          "DISCORD_INITIALIZATION_FAILED",
          "discord-command-deployment",
        );
      }
      this.__assertStarting();

      this.__state = "running";
      Log.event("APPLICATION_STARTUP_COMPLETED", "SUCCESS");
    } catch (reason: unknown) {
      if (this.__state === "stopping" || this.__state === "stopped") {
        await this.__shutdownPromise;
        return;
      }
      const diagnostic: StartupDiagnosticError = asStartupDiagnostic(
        reason,
        "STARTUP_UNEXPECTED",
        "startup",
      );
      if (this.__loggingInitialized) {
        Log.event("APPLICATION_STARTUP_FAILED", "ERROR", {
          category: diagnostic.startupCode,
          ...(diagnostic.configField === undefined
            ? {}
            : { configField: diagnostic.configField }),
          ...(diagnostic.operation === undefined
            ? {}
            : { operation: diagnostic.operation }),
          ...(diagnostic.platformCode === undefined
            ? {}
            : { platformCode: diagnostic.platformCode }),
        });
      }
      await this.shutdown(true);
      throw diagnostic;
    }
  }

  private __registerClientListeners(): void {
    const client: discordJs.Client = this.__client as discordJs.Client;
    this.__initialDeploymentPromise = new Promise<void>((resolve, reject) => {
      this.__clientReadyListener = (): void => {
        if (this.__readyObserved) {
          return;
        }
        this.__readyObserved = true;
        if (this.__state !== "starting") {
          reject(new Error("Application shutdown requested before readiness."));
          return;
        }
        Log.event("DISCORD_CLIENT_CONNECTED", "SUCCESS");
        let deployment: Promise<void>;
        try {
          deployment = this.__trackRegistration(
            this.__deployCommands(this.__commands),
          );
        } catch (reason: unknown) {
          reject(
            reason instanceof Error
              ? reason
              : new Error("Initial command deployment failed."),
          );
          return;
        }
        void deployment.then(
          () => {
            Log.event("COMMAND_DEPLOYMENT_COMPLETED", "SUCCESS", {
              commandCount: this.__commands.length,
            });
            resolve();
          },
          (reason: unknown): void => {
            reject(
              reason instanceof Error
                ? reason
                : new Error("Initial command deployment failed."),
            );
          },
        );
      };
      client.once("clientReady", this.__clientReadyListener);
    });
    void this.__initialDeploymentPromise.catch(() => undefined);

    this.__clientErrorListener = (error): void => {
      this.__logRuntimeFailure("Discord client runtime error.", error);
    };
    client.on("error", this.__clientErrorListener);

    this.__guildCreateListener = (guild): void => {
      if (this.__state !== "running") {
        return;
      }
      let deployment: Promise<void>;
      try {
        deployment = this.__trackRegistration(
          this.__deployCommands(this.__commands, [guild.id]),
        );
      } catch (reason: unknown) {
        this.__logRuntimeFailure(
          "Failed to deploy Discord bot on new guild.",
          reason,
        );
        return;
      }
      void deployment.catch(() => undefined);
    };
    client.on("guildCreate", this.__guildCreateListener);

    this.__interactionListener = (interaction): void => {
      if (
        this.__state !== "running" ||
        !isSupportedCommandInteraction(interaction)
      ) {
        return;
      }
      let handler: Promise<void>;
      try {
        handler = handleCommandInteraction(interaction, this.__commands);
      } catch (reason: unknown) {
        this.__logRuntimeFailure(
          "Unexpected command interaction handling failure.",
          reason,
        );
        return;
      }
      this.__trackHandler(handler);
      void handler.catch((reason: unknown) => {
        this.__logRuntimeFailure(
          "Unexpected command interaction handling failure.",
          reason,
        );
      });
    };
    client.on("interactionCreate", this.__interactionListener);
  }

  private __removeClientListeners(): void {
    if (this.__client === undefined) {
      return;
    }
    if (this.__clientErrorListener !== undefined) {
      this.__client.off("error", this.__clientErrorListener);
    }
    if (this.__clientReadyListener !== undefined) {
      this.__client.off("clientReady", this.__clientReadyListener);
    }
    if (this.__guildCreateListener !== undefined) {
      this.__client.off("guildCreate", this.__guildCreateListener);
    }
    if (this.__interactionListener !== undefined) {
      this.__client.off("interactionCreate", this.__interactionListener);
    }
  }

  private __removeSignalListeners(): void {
    if (!this.__signalListenersInstalled) {
      return;
    }
    process.off("SIGTERM", this.__handleSignal);
    process.off("SIGINT", this.__handleSignal);
    this.__signalListenersInstalled = false;
  }

  private async __settleWithin(
    operation: Promise<unknown>,
    deadline: number,
    failureContext: string = "Application cleanup",
    markCleanupFailed: boolean = true,
  ): Promise<TimedStageResult> {
    let timer: NodeJS.Timeout | undefined;
    const completion: Promise<TimedStageResult> = operation.then(
      () => {
        return { completed: true, failed: false };
      },
      (reason: unknown) => {
        if (markCleanupFailed) {
          this.__cleanupFailed = true;
        }
        console.error(`${failureContext} failed.`, Log.summarizeError(reason));
        return { completed: true, failed: true };
      },
    );
    const remaining: number = Math.max(0, deadline - performance.now());
    const timeout: Promise<TimedStageResult> = new Promise(resolve => {
      timer = setTimeout((): void => {
        resolve({ completed: false, failed: false });
      }, remaining);
    });
    const result: TimedStageResult = await Promise.race([completion, timeout]);
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    return result;
  }

  private __trackHandler(handler: Promise<void>): void {
    this.__activeHandlers.add(handler);
    void handler.then(
      () => this.__activeHandlers.delete(handler),
      () => this.__activeHandlers.delete(handler),
    );
  }

  private __trackRegistration(registration: Promise<void>): Promise<void> {
    this.__activeRegistrations.add(registration);
    void registration.then(
      () => this.__activeRegistrations.delete(registration),
      () => this.__activeRegistrations.delete(registration),
    );
    return registration;
  }
}

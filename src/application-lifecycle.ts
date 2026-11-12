import * as discordJs from "discord.js";
import { Ping } from "./commands";
import { DataController } from "./controllers";
import type { CoreConfig } from "./core";
import {
  Command,
  Discord,
  Environment,
  handleCommandInteraction,
  isSupportedCommandInteraction,
  JsonStore,
  Log,
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
  readonly loadConfig?: () => CoreConfig;
};

type TimedStageResult = {
  completed: boolean;
};

export class ApplicationLifecycle {
  private readonly __activeHandlers: Set<Promise<void>> = new Set();

  private readonly __activeRegistrations: Set<Promise<void>> = new Set();

  private __cleanupFailed: boolean = false;

  private __client: discordJs.Client | undefined;

  private __commands: Command[] = [];

  private readonly __createClient: () => discordJs.Client;

  private readonly __createCommands: (store: JsonStore) => Command[];

  private readonly __createStore: (dataDirectory: string) => JsonStore;

  private readonly __deployCommands: (
    commands: Command[],
    guildIds?: string[],
  ) => Promise<void>;

  private __guildCreateListener: ((guild: discordJs.Guild) => void) | undefined;

  private __initialDeploymentPromise: Promise<void> = Promise.resolve();

  private __interactionListener:
    | ((interaction: discordJs.Interaction) => void)
    | undefined;

  private readonly __loadConfig: () => CoreConfig;

  private __readyListener:
    | ((client: discordJs.Client<true>) => void)
    | undefined;

  private __readyObserved: boolean = false;

  private __resolveShutdownRequested!: () => void;

  private __shutdownPromise: Promise<void> | undefined;

  private __shutdownRequested: Promise<void>;

  private __signalListenersInstalled: boolean = false;

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

  public async start(): Promise<void> {
    try {
      const config: CoreConfig = this.__loadConfig();
      this.__assertStarting();
      if (config.devMode) {
        Log.info("Running in development mode.");
      }
      Log.info(
        `Initializing ${Environment.packageContext.name} (${Environment.packageContext.version ?? "NO VERSION"})...`,
      );

      this.__store = this.__createStore(config.dataDirectory);
      await this.__store.initialize();
      this.__assertStarting();

      this.__commands = this.__createCommands(this.__store);
      this.__assertStarting();

      this.__client = this.__createClient();
      this.__registerClientListeners();

      const loginPromise: Promise<string> = this.__client.login(
        config.discordBotToken,
      );
      void loginPromise.catch(() => undefined);
      await this.__awaitStartupOperation(loginPromise);
      this.__assertStarting();

      await this.__awaitStartupOperation(this.__initialDeploymentPromise);
      this.__assertStarting();

      this.__state = "running";
      Log.success("Application started successfully.");
    } catch (reason: unknown) {
      if (this.__state === "stopping" || this.__state === "stopped") {
        await this.__shutdownPromise;
        return;
      }
      await this.shutdown(true);
      throw reason;
    }
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
    let timedOut: boolean = false;

    const acceptedWork: Promise<unknown>[] = [
      ...this.__activeHandlers,
      ...this.__activeRegistrations,
    ];
    const workResult: TimedStageResult = await this.__settleWithin(
      Promise.allSettled(acceptedWork).then(() => undefined),
      deadline,
    );
    timedOut ||= !workResult.completed;

    if (this.__store !== undefined) {
      const storeResult: TimedStageResult = await this.__settleWithin(
        Promise.resolve().then(() => this.__store?.drain()),
        deadline,
      );
      timedOut ||= !storeResult.completed;
    }

    if (this.__client !== undefined) {
      const clientResult: TimedStageResult = await this.__settleWithin(
        Promise.resolve().then(() => this.__client?.destroy()),
        deadline,
      );
      timedOut ||= !clientResult.completed;
    }

    this.__removeClientListeners();
    this.__removeSignalListeners();
    this.__state = "stopped";

    if (startupFailure || timedOut || this.__cleanupFailed) {
      process.exitCode = 1;
    }
    if (timedOut) {
      console.error("Application shutdown deadline exceeded.", {
        activeHandlerCount: this.__activeHandlers.size,
        activeRegistrationCount: this.__activeRegistrations.size,
      });
    }
  }

  private __registerClientListeners(): void {
    const client: discordJs.Client = this.__client as discordJs.Client;
    this.__initialDeploymentPromise = new Promise<void>((resolve, reject) => {
      this.__readyListener = (): void => {
        if (this.__readyObserved) {
          return;
        }
        this.__readyObserved = true;
        if (this.__state !== "starting") {
          reject(new Error("Application shutdown requested before readiness."));
          return;
        }
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
        void deployment.then(resolve, (reason: unknown): void => {
          reject(
            reason instanceof Error
              ? reason
              : new Error("Initial command deployment failed."),
          );
        });
      };
      client.once("ready", this.__readyListener);
    });

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
      void deployment.catch((reason: unknown) => {
        this.__logRuntimeFailure(
          "Failed to deploy Discord bot on new guild.",
          reason,
        );
      });
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
    if (this.__readyListener !== undefined) {
      this.__client.off("ready", this.__readyListener);
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
  ): Promise<TimedStageResult> {
    let timer: NodeJS.Timeout | undefined;
    const completion: Promise<TimedStageResult> = operation.then(
      () => {
        return { completed: true };
      },
      (reason: unknown) => {
        this.__cleanupFailed = true;
        console.error(
          "Application cleanup failed.",
          Log.summarizeError(reason),
        );
        return { completed: true };
      },
    );
    const remaining: number = Math.max(0, deadline - performance.now());
    const timeout: Promise<TimedStageResult> = new Promise(resolve => {
      timer = setTimeout((): void => {
        resolve({ completed: false });
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

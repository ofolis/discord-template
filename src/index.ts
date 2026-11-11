import { Ping } from "./commands";
import type { CoreConfig } from "./core";
import {
  Command,
  Discord,
  Environment,
  handleCommandInteraction,
  isSupportedCommandInteraction,
  Log,
} from "./core";

const commands: Command[] = [new Ping()];

function initializeApp(): void {
  const config: CoreConfig = Environment.loadConfig();

  if (config.devMode) {
    Log.info("Running in development mode.");
  }
  Log.info(
    `Initializing ${Environment.packageContext.name} (${Environment.packageContext.version ?? "NO VERSION"})...`,
  );

  // Ready Event
  Discord.client.once("ready", () => {
    Discord.deployCommands(commands)
      .then(() => {
        Log.success("Discord bot is ready.");
      })
      .catch((reason: unknown) => {
        Log.error(
          "Failed to initialize Discord bot.",
          Log.summarizeError(reason),
        );
      });
  });

  // Guild Create Event
  Discord.client.on("guildCreate", guild => {
    Discord.deployCommands(commands, [guild.id])
      .then(() => {
        Log.success("Discord bot deployed to new guild.", {
          guildId: guild.id,
          guildName: guild.name,
        });
      })
      .catch((reason: unknown) => {
        Log.error("Failed to deploy Discord bot on new guild.", {
          guildId: guild.id,
          guildName: guild.name,
          ...Log.summarizeError(reason),
        });
      });
  });

  // Interaction Create Event
  Discord.client.on("interactionCreate", interaction => {
    if (!isSupportedCommandInteraction(interaction)) {
      return;
    }
    void handleCommandInteraction(interaction, commands).catch(
      (reason: unknown) => {
        Log.error(
          "Unexpected command interaction handling failure.",
          Log.summarizeError(reason),
        );
      },
    );
  });

  // Login
  Discord.client
    .login(config.discordBotToken)
    .then(() => {
      Log.debug("Discord bot logged in successfully.");
    })
    .catch((reason: unknown) => {
      Log.error("Failed to log into Discord.", Log.summarizeError(reason));
    });
}

initializeApp();

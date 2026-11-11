import { Ping } from "./commands";
import type { CoreConfig } from "./core";
import {
  ChannelCommandMessage,
  Command,
  Discord,
  Environment,
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
    if (!interaction.isCommand()) {
      return;
    }
    const interactionInfo: Record<string, unknown> = {
      channelId: interaction.channelId,
      command: interaction.commandName,
      createdAt: interaction.createdAt.toUTCString(),
      guildId: interaction.guild?.id ?? null,
      id: interaction.id,
      userId: interaction.user.id,
    };
    Log.info(`New interaction ${interaction.id}.`, interactionInfo);
    const interactionCommand: Command | undefined = commands.find(
      command => command.name === interaction.commandName,
    );
    if (interactionCommand === undefined) {
      Log.error(
        "Cannot handle interaction. Unknown command was provided.",
        interactionInfo,
      );
      return;
    }
    ChannelCommandMessage.create(interaction, interactionCommand.isPrivate)
      .then(privateChannelMessage => {
        interactionCommand
          .execute(privateChannelMessage)
          .then(() => {
            Log.success(`Completed interaction ${interaction.id}.`);
          })
          .catch((reason: unknown) => {
            Log.error(
              "Could not complete command execution.",
              Log.summarizeError(reason),
            );
          });
      })
      .catch((reason: unknown) => {
        Log.error(
          "Could not create user channel interaction from command interaction.",
          Log.summarizeError(reason),
        );
      });
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

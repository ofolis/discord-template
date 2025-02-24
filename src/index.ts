import { Ping } from "./commands";
import {
  ChannelCommandMessage,
  Command,
  Discord,
  Environment,
  Log,
} from "./core";

const commands: Command[] = [new Ping()];

function initializeApp(): void {
  if (Environment.config.devMode) {
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
        Log.error("Failed to initialize Discord bot.", reason);
      });
  });

  // Guild Create Event
  Discord.client.on("guildCreate", guild => {
    Discord.deployCommands(commands, [guild.id])
      .then(() => {
        Log.success("Discord bot deployed to new guild.", { guild });
      })
      .catch((reason: unknown) => {
        Log.error("Failed to deploy Discord bot on new guild.", reason, {
          guild,
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
      guild:
        interaction.guild !== null
          ? {
              id: interaction.guild.id,
              name: interaction.guild.name,
            }
          : null,
      id: interaction.id,
      user: {
        displayName: interaction.user.displayName,
        globalName: interaction.user.globalName,
        id: interaction.user.id,
        username: interaction.user.username,
      },
    };
    Log.info(`New interaction ${interaction.id}.`, interactionInfo);
    const interactionCommand: Command | undefined = commands.find(
      command => command.name === interaction.commandName,
    );
    if (interactionCommand === undefined) {
      Log.error(
        "Cannot handle interaction. Unknown command was provided.",
        interaction,
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
            Log.error("Could not complete command execution.", reason);
          });
      })
      .catch((reason: unknown) => {
        Log.error(
          "Could not create user channel interaction from command interaction.",
          reason,
        );
      });
  });

  // Login
  Discord.client
    .login(Environment.config.discordBotToken)
    .then(() => {
      Log.debug("Discord bot logged in successfully.");
    })
    .catch((reason: unknown) => {
      Log.error("Failed to log into Discord.", reason);
    });
}

initializeApp();

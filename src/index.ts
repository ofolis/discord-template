import {
  Constants,
} from "./constants";
import {
  Discord,
} from "./discord";
import {
  Ping
} from "./handlers/commands";
import type {
  Command,
} from "./types";

const commands: Command[] = [
  Ping
];

function initializeApp(): void {
  const commandMap: Record<string, Command> = commands.reduce<Record<string, Command>>(
    (map, command) => {
      map[command.name] = command;
      return map;
    },
    {},
  );
  Discord.client.once(
    "ready",
    () => {
      console.log("Initializing Discord bot...");
      Discord.deployCommands(commandMap).then(
        () => {
          console.log("Discord bot is ready.");
        },
        (reason: unknown) => {
          console.error("Failed to initialize Discord bot.");
          console.error(reason);
        },
      );
    },
  );
  Discord.client.on(
    "guildCreate",
    (guild) => {
      console.log(`Initializing guild ${guild.id}...`);
      Discord.deployCommands(
        commandMap,
        [
          guild.id,
        ],
      ).then(
        () => {
          console.log(`Guild ${guild.id} is ready.`);
        },
        (reason: unknown) => {
          console.error(`Failed to initialize guild ${guild.id}.`);
          console.error(reason);
        },
      );
    },
  );
  Discord.client.on(
    "interactionCreate",
    (interaction) => {
      if (!interaction.isCommand()) {
        return;
      }
      console.log(interaction);
      try {
        const interactionCommand: Command | undefined = commands.find(command => command.name === interaction.commandName);
        if (interactionCommand === undefined) {
          throw new ReferenceError(`Unknown command "${interaction.commandName}".`);
        }
        interactionCommand.execute(interaction).catch((reason: unknown) => {
          throw reason;
        });
      } catch (e) {
        console.error(`Failed to handle "${interaction.commandName}".`);
        console.error(e);
      }
    },
  );
  Discord.client.login(Constants.config.discordBotToken).catch((response: unknown) => {
    console.error(`Failed to log in.`);
    console.error(response);
  });
}

initializeApp();

import {
  Constants,
} from "./constants";
import {
  Discord,
} from "./handlers";
import {
  Ping,
} from "./handlers/commands";

function initializeApp(): void {
  Discord.client.once(
    "ready",
    () => {
      console.log("Initializing Discord bot...");
      const guildIds: string[] = Array.from(Discord.client.guilds.cache.keys());
      Discord.DeployCommands(guildIds).then(
        () => {
          console.log("Discord bot is ready! 🤖");
        },
        () => {
          console.error("Failed to initialize Discord bot.");
        },
      );
    },
  );
  Discord.client.on(
    "guildCreate",
    (guild) => {
      Discord.DeployCommands([
        guild.id,
      ]).then(
        () => {
          console.log("Discord bot is ready! 🤖");
        },
        () => {
          console.error("Failed to initialize Discord bot.");
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
      switch (interaction.commandName) {
      case "ping":
        Ping.execute(interaction).catch((reason: unknown) => {
          console.error(`Failed to handle "${interaction.commandName}".`);
          console.error(reason);
        });
        break;
      default:
        console.error(`Command "${interaction.commandName}" has no execution path.`);
      }
    },
  );
  Discord.client.login(Constants.environment.DISCORD_BOT_TOKEN).catch((reason: unknown) => {
    console.error(`Failed to log in.`);
    console.error(reason);
  });
}

initializeApp();

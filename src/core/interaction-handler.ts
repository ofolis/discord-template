import * as discordJs from "discord.js";
import { ChannelCommandMessage } from "./entities";
import { Command } from "./entities/command";
import { Log } from "./log";

const commandFailureResponse: discordJs.MessageCreateOptions = {
  content: "Something went wrong while executing this command.",
};

export async function handleCommandInteraction(
  interaction: discordJs.CommandInteraction,
  commands: readonly Command[],
): Promise<void> {
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
  if (interaction.deferred || interaction.replied) {
    Log.error(
      "Cannot handle interaction. Interaction is already acknowledged.",
      { interactionId: interaction.id },
    );
    return;
  }

  let commandMessage: ChannelCommandMessage | undefined;
  try {
    commandMessage = await ChannelCommandMessage.create(
      interaction,
      interactionCommand.isPrivate,
    );
    await interactionCommand.execute(commandMessage);
    Log.success(`Completed interaction ${interaction.id}.`);
  } catch (reason: unknown) {
    Log.error(
      "Could not complete command interaction.",
      Log.summarizeError(reason),
    );
    if (
      commandMessage !== undefined &&
      commandMessage.canFinalizeInteractionResponse
    ) {
      try {
        await commandMessage.update(commandFailureResponse);
      } catch (finalizationReason: unknown) {
        Log.error(
          "Could not finalize failed command interaction.",
          Log.summarizeError(finalizationReason),
        );
      }
    }
  }
}

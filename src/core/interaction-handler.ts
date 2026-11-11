import * as discordJs from "discord.js";
import { ChannelCommandMessage } from "./entities";
import { Command, resolveRequiredMemberPermissions } from "./entities/command";
import { Log } from "./log";

const commandFailureResponse: discordJs.MessageCreateOptions = {
  content: "Something went wrong while executing this command.",
};

const unauthorizedCommandResponse: discordJs.InteractionReplyOptions = {
  content: "You don't have permission to use this command.",
  ephemeral: true,
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

  let requiredMemberPermissions: bigint | undefined;
  try {
    requiredMemberPermissions =
      resolveRequiredMemberPermissions(interactionCommand);
  } catch (reason: unknown) {
    Log.error(
      "Cannot authorize command. Invalid permission metadata.",
      Log.summarizeError(reason),
    );
    await denyCommandInteraction(interaction);
    return;
  }

  if (!canUseCommand(interaction, requiredMemberPermissions)) {
    await denyCommandInteraction(interaction);
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

async function denyCommandInteraction(
  interaction: discordJs.CommandInteraction,
): Promise<void> {
  try {
    await interaction.reply(unauthorizedCommandResponse);
  } catch (reason: unknown) {
    Log.error(
      "Could not send command authorization denial.",
      Log.summarizeError(reason),
    );
  }
}

function canUseCommand(
  interaction: discordJs.CommandInteraction,
  requiredMemberPermissions: bigint | undefined,
): boolean {
  if (requiredMemberPermissions === undefined) {
    return true;
  }
  if (interaction.guildId === null || interaction.member === null) {
    return false;
  }

  const permissions: discordJs.PermissionsBitField | null =
    interaction.member instanceof discordJs.GuildMember
      ? interaction.member.permissions
      : parseInteractionMemberPermissions(interaction.member.permissions);
  if (permissions === null) {
    return false;
  }
  return permissions.has(requiredMemberPermissions);
}

function parseInteractionMemberPermissions(
  permissions: unknown,
): discordJs.PermissionsBitField | null {
  if (typeof permissions !== "string" || !/^\d+$/u.test(permissions)) {
    return null;
  }
  try {
    return new discordJs.PermissionsBitField(BigInt(permissions));
  } catch (_reason: unknown) {
    return null;
  }
}

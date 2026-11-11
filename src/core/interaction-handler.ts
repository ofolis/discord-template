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

const guildOnlyCommandResponse: discordJs.InteractionReplyOptions = {
  content: "This command is only available in a server.",
  ephemeral: true,
};

const unknownCommandResponse: discordJs.InteractionReplyOptions = {
  content: "This command is unavailable.",
  ephemeral: true,
};

export function isSupportedCommandInteraction(
  interaction: discordJs.Interaction,
): interaction is discordJs.ChatInputCommandInteraction {
  return interaction.isChatInputCommand();
}

export async function handleCommandInteraction(
  interaction: discordJs.CommandInteraction,
  commands: readonly Command[],
): Promise<void> {
  if (!interaction.isChatInputCommand()) {
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
  if (interaction.deferred || interaction.replied) {
    Log.error(
      "Cannot handle interaction. Interaction is already acknowledged.",
      { interactionId: interaction.id },
    );
    return;
  }
  const commandMap: Map<string, Command> = new Map(
    commands.map(command => [command.name, command]),
  );
  const interactionCommand: Command | undefined = commandMap.get(
    interaction.commandName,
  );
  if (interactionCommand === undefined) {
    await replyToInteraction(
      interaction,
      unknownCommandResponse,
      "unknown command",
    );
    return;
  }
  if (interaction.guildId === null) {
    await replyToInteraction(
      interaction,
      guildOnlyCommandResponse,
      "guild-only command",
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
  await replyToInteraction(
    interaction,
    unauthorizedCommandResponse,
    "command authorization denial",
  );
}

async function replyToInteraction(
  interaction: discordJs.CommandInteraction,
  response: discordJs.InteractionReplyOptions,
  operation: string,
): Promise<void> {
  try {
    await interaction.reply(response);
  } catch (reason: unknown) {
    Log.error(
      `Could not send ${operation} response.`,
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

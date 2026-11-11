import { ChannelCommandMessage } from ".";
import { CommandRegistrationType } from "../enums";
import { CommandOption } from "../types";

export abstract class Command {
  readonly requiredMemberPermissions?: bigint;

  abstract description: string;

  abstract isPrivate: boolean;

  abstract name: string;

  abstract options: CommandOption[];

  abstract registrationType: CommandRegistrationType;

  abstract execute(message: ChannelCommandMessage): Promise<void>;
}

export function resolveRequiredMemberPermissions(
  command: Pick<Command, "requiredMemberPermissions">,
): bigint | undefined {
  const requiredMemberPermissions: unknown = command.requiredMemberPermissions;
  if (requiredMemberPermissions === undefined) {
    return undefined;
  }
  if (
    typeof requiredMemberPermissions !== "bigint" ||
    requiredMemberPermissions <= 0n
  ) {
    throw new Error("Invalid required member permissions.");
  }
  return requiredMemberPermissions;
}

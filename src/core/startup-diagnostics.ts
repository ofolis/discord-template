import { Log } from "./log";
import { StartupDiagnosticError } from "./startup-error";

export function reportStartupFailure(reason: unknown): void {
  const details: Record<string, string> =
    reason instanceof StartupDiagnosticError
      ? {
          ...(reason.configField === undefined
            ? {}
            : { configField: reason.configField }),
          ...(reason.operation === undefined
            ? {}
            : { operation: reason.operation }),
          ...(reason.platformCode === undefined
            ? {}
            : { platformCode: reason.platformCode }),
          errorCode: reason.startupCode,
          errorName: reason.name,
        }
      : Log.summarizeError(reason);
  console.error("Failed to initialize application.", details);
}

import { Log } from "./log";
import { StartupDiagnosticError } from "./startup-error";

export function reportStartupFailure(reason: unknown): void {
  const details: Record<string, string> = isStartupDiagnostic(reason)
    ? safeStartupDetails(reason)
    : Log.summarizeError(reason);
  console.error("Failed to initialize application.", details);
}

function isStartupDiagnostic(value: unknown): value is StartupDiagnosticError {
  try {
    return value instanceof StartupDiagnosticError;
  } catch (_reason: unknown) {
    return false;
  }
}

function safeStartupDetails(
  reason: StartupDiagnosticError,
): Record<string, string> {
  const details: Record<string, string> = {};
  const configField: unknown = readSafeProperty(reason, "configField");
  const operation: unknown = readSafeProperty(reason, "operation");
  const platformCode: unknown = readSafeProperty(reason, "platformCode");
  const startupCode: unknown = readSafeProperty(reason, "startupCode");
  const name: unknown = readSafeProperty(reason, "name");
  if (
    typeof configField === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/u.test(configField)
  ) {
    details.configField = configField;
  }
  if (
    typeof operation === "string" &&
    /^[a-z][a-z0-9-]{0,63}$/u.test(operation)
  ) {
    details.operation = operation;
  }
  if (
    (typeof platformCode === "string" &&
      /^[A-Za-z0-9_.:-]{1,64}$/u.test(platformCode)) ||
    (typeof platformCode === "number" && Number.isFinite(platformCode))
  ) {
    details.platformCode = String(platformCode);
  }
  if (
    startupCode === "CONFIG_INVALID" ||
    startupCode === "DISCORD_INITIALIZATION_FAILED" ||
    startupCode === "STARTUP_UNEXPECTED"
  ) {
    details.errorCode = startupCode;
  }
  if (name === "StartupDiagnosticError") details.errorName = name;
  return details;
}

function readSafeProperty(value: unknown, property: string): unknown {
  try {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null
    ) {
      return undefined;
    }
    return (value as Record<string, unknown>)[property];
  } catch (_reason: unknown) {
    return undefined;
  }
}

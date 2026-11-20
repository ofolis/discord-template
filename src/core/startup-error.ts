export type StartupDiagnosticCode =
  | "CONFIG_INVALID"
  | "DISCORD_INITIALIZATION_FAILED"
  | "STARTUP_UNEXPECTED";

export type StartupDiagnosticOptions = {
  readonly cause?: unknown;
  readonly configField?: string;
  readonly message?: string;
  readonly operation?: string;
  readonly platformCode?: number | string;
};

export class StartupDiagnosticError extends Error {
  public readonly configField: string | undefined;

  public readonly operation: string | undefined;

  public readonly platformCode: string | undefined;

  public readonly startupCode: StartupDiagnosticCode;

  public constructor(
    startupCode: StartupDiagnosticCode,
    options: StartupDiagnosticOptions = {},
  ) {
    super(options.message ?? "Application startup failed.", {
      cause: options.cause,
    });
    this.name = "StartupDiagnosticError";
    this.configField = StartupDiagnosticError.__safeConfigField(
      options.configField,
    );
    this.operation = StartupDiagnosticError.__safeOperation(options.operation);
    this.platformCode = StartupDiagnosticError.__safePlatformCode(
      options.platformCode,
    );
    this.startupCode = startupCode;
  }

  private static __safeConfigField(
    value: string | undefined,
  ): string | undefined {
    return value !== undefined && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value)
      ? value
      : undefined;
  }

  private static __safeOperation(
    value: string | undefined,
  ): string | undefined {
    return value !== undefined && /^[a-z][a-z0-9-]{0,63}$/u.test(value)
      ? value
      : undefined;
  }

  private static __safePlatformCode(
    value: number | string | undefined,
  ): string | undefined {
    const normalized: string | undefined =
      typeof value === "number"
        ? Number.isFinite(value)
          ? String(value)
          : undefined
        : value;
    return normalized !== undefined &&
      /^[A-Za-z0-9_.:-]{1,64}$/u.test(normalized)
      ? normalized
      : undefined;
  }
}

export function configurationError(
  configField: string,
  message: string,
): StartupDiagnosticError {
  return new StartupDiagnosticError("CONFIG_INVALID", {
    configField,
    message,
  });
}

export function asStartupDiagnostic(
  reason: unknown,
  startupCode: StartupDiagnosticCode,
  operation: string,
): StartupDiagnosticError {
  if (isStartupDiagnostic(reason)) return reason;
  const errorLike: boolean = isError(reason);
  const message: unknown = errorLike
    ? readSafeProperty(reason, "message")
    : undefined;
  const platformCode: unknown = errorLike
    ? readSafeProperty(reason, "code")
    : undefined;
  return new StartupDiagnosticError(startupCode, {
    cause: reason,
    message: typeof message === "string" ? message : undefined,
    operation,
    platformCode:
      typeof platformCode === "string" ||
      (typeof platformCode === "number" && Number.isFinite(platformCode))
        ? platformCode
        : undefined,
  });
}

function isStartupDiagnostic(value: unknown): value is StartupDiagnosticError {
  try {
    return value instanceof StartupDiagnosticError;
  } catch {
    return false;
  }
}

function isError(value: unknown): boolean {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

function readSafeProperty(value: unknown, property: string): unknown {
  try {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null ||
      !(property in value)
    ) {
      return undefined;
    }
    return (value as Record<string, unknown>)[property];
  } catch {
    return undefined;
  }
}

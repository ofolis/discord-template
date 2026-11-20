import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asStartupDiagnostic,
  configurationError,
  reportStartupFailure,
  StartupDiagnosticError,
} from "../src/core";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startup diagnostics", () => {
  it.each([
    [50001, "50001"],
    ["E_DISCORD", "E_DISCORD"],
  ] as const)("normalizes safe platform code %s", (code, expected) => {
    const diagnostic = asStartupDiagnostic(
      Object.assign(new Error("token=synthetic-secret"), { code }),
      "DISCORD_INITIALIZATION_FAILED",
      "discord-login",
    );
    expect(diagnostic.platformCode).toBe(expected);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    { code: "50001" },
    "not valid!",
  ])("rejects unsafe platform code %s", code => {
    const diagnostic = asStartupDiagnostic(
      Object.assign(new Error("synthetic"), { code }),
      "DISCORD_INITIALIZATION_FAILED",
      "discord-login",
    );
    expect(diagnostic.platformCode).toBeUndefined();
  });

  it("normalizes errors with throwing metadata accessors", () => {
    const codeError = new Error("synthetic");
    Object.defineProperty(codeError, "code", {
      configurable: true,
      get: (): never => {
        throw new Error("code getter failed");
      },
    });
    const messageError = new Error("synthetic");
    Object.defineProperty(messageError, "message", {
      configurable: true,
      get: (): never => {
        throw new Error("message getter failed");
      },
    });

    expect(() =>
      asStartupDiagnostic(codeError, "STARTUP_UNEXPECTED", "startup"),
    ).not.toThrow();
    expect(() =>
      asStartupDiagnostic(messageError, "STARTUP_UNEXPECTED", "startup"),
    ).not.toThrow();
    expect(
      asStartupDiagnostic(codeError, "STARTUP_UNEXPECTED", "startup"),
    ).toMatchObject({
      startupCode: "STARTUP_UNEXPECTED",
      operation: "startup",
      platformCode: undefined,
    });
    expect(
      asStartupDiagnostic(messageError, "STARTUP_UNEXPECTED", "startup")
        .message,
    ).toBe("Application startup failed.");
  });

  it.each([
    new Proxy(new Error("synthetic"), {
      has: (): never => {
        throw new Error("has trap failed");
      },
    }),
    new Proxy(new Error("synthetic"), {
      get: (): never => {
        throw new Error("get trap failed");
      },
    }),
    { reason: "synthetic" },
  ])("normalizes inaccessible and non-Error thrown values safely", reason => {
    expect(() => {
      const diagnostic = asStartupDiagnostic(
        reason,
        "STARTUP_UNEXPECTED",
        "startup",
      );
      expect(diagnostic.startupCode).toBe("STARTUP_UNEXPECTED");
      expect(diagnostic.operation).toBe("startup");
      expect(diagnostic.platformCode).toBeUndefined();
    }).not.toThrow();
  });

  it("reports a safe configuration classification and field", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    reportStartupFailure(
      configurationError("DISCORD_BOT_TOKEN", "token=synthetic-secret"),
    );

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to initialize application.",
      {
        configField: "DISCORD_BOT_TOKEN",
        errorCode: "CONFIG_INVALID",
        errorName: "StartupDiagnosticError",
      },
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "synthetic-secret",
    );
  });

  it.each([
    ["login", "discord-login"],
    ["deployment", "discord-command-deployment"],
  ] as const)(
    "reports a safe Discord %s classification",
    (_name, operation) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      reportStartupFailure(
        new StartupDiagnosticError("DISCORD_INITIALIZATION_FAILED", {
          message: "authorization=synthetic-secret response body",
          operation,
          platformCode: "50001",
        }),
      );

      expect(consoleError).toHaveBeenCalledWith(
        "Failed to initialize application.",
        {
          errorCode: "DISCORD_INITIALIZATION_FAILED",
          errorName: "StartupDiagnosticError",
          operation,
          platformCode: "50001",
        },
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        "synthetic-secret",
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        "response body",
      );
    },
  );

  it("reports unexpected and non-Error startup failures safely", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    reportStartupFailure(
      new StartupDiagnosticError("STARTUP_UNEXPECTED", {
        message: "raw exception stack and token=synthetic-secret",
        operation: "startup",
      }),
    );
    reportStartupFailure({ message: "synthetic-secret", payload: "body" });

    expect(consoleError.mock.calls[0]).toEqual([
      "Failed to initialize application.",
      {
        errorCode: "STARTUP_UNEXPECTED",
        errorName: "StartupDiagnosticError",
        operation: "startup",
      },
    ]);
    expect(consoleError.mock.calls[1]).toEqual([
      "Failed to initialize application.",
      { reasonType: "object" },
    ]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "synthetic-secret",
    );
  });

  it("reports bounded safe diagnostics without requiring configuration", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const reason: Error & { code: string; secret: string } = Object.assign(
      new Error("raw secret and filesystem details"),
      { code: "EACCES", secret: "synthetic-secret" },
    );

    expect(() => {
      reportStartupFailure(reason);
    }).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consoleError.mock.calls)).toContain("EACCES");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "synthetic-secret",
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("raw secret");
  });
});

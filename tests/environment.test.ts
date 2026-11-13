import { resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Environment, EnvironmentUtils } from "../src/core";

const environmentKeys: string[] = [
  "DEV_MODE",
  "DATA_DIRECTORY",
  "DISCORD_APPLICATION_ID",
  "DISCORD_BOT_TOKEN",
  "APP_VERSION",
  "APP_COMMIT_SHA",
  "TEST_OPTIONAL_VALUE",
];

let originalEnvironment: Record<string, string | undefined>;

beforeEach(() => {
  originalEnvironment = Object.fromEntries(
    environmentKeys.map(key => [key, process.env[key]]),
  );
});

afterEach(() => {
  environmentKeys.forEach(key => {
    const value: string | undefined = originalEnvironment[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  vi.restoreAllMocks();
});

describe("environment utilities", () => {
  it.each([undefined, "", "   "])(
    "rejects a missing or blank required value: %j",
    value => {
      if (value === undefined) {
        delete process.env["TEST_OPTIONAL_VALUE"];
      } else {
        process.env["TEST_OPTIONAL_VALUE"] = value;
      }

      expect(() =>
        EnvironmentUtils.getRequiredEnvVariable("TEST_OPTIONAL_VALUE"),
      ).toThrow(/TEST_OPTIONAL_VALUE/);
      expect(() =>
        EnvironmentUtils.getRequiredEnvVariable("TEST_OPTIONAL_VALUE"),
      ).not.toThrow(/secret|token/i);
    },
  );

  it("returns a valid required value without trimming meaningful whitespace", () => {
    process.env["TEST_OPTIONAL_VALUE"] = "  value with padding  ";

    expect(EnvironmentUtils.getRequiredEnvVariable("TEST_OPTIONAL_VALUE")).toBe(
      "  value with padding  ",
    );
  });

  it("returns undefined for an absent optional value", () => {
    delete process.env["TEST_OPTIONAL_VALUE"];

    expect(
      EnvironmentUtils.getOptionalEnvVariable("TEST_OPTIONAL_VALUE"),
    ).toBeUndefined();
  });

  it("returns a present optional value unchanged", () => {
    process.env["TEST_OPTIONAL_VALUE"] = "  optional value  ";

    expect(EnvironmentUtils.getOptionalEnvVariable("TEST_OPTIONAL_VALUE")).toBe(
      "  optional value  ",
    );
  });

  it("returns an explicit default for an absent optional value", () => {
    delete process.env["TEST_OPTIONAL_VALUE"];

    expect(
      EnvironmentUtils.getOptionalEnvVariable(
        "TEST_OPTIONAL_VALUE",
        "documented default",
      ),
    ).toBe("documented default");
  });

  it("parses the optional development-mode flag with a false default", () => {
    delete process.env["DEV_MODE"];
    expect(EnvironmentUtils.getOptionalBoolean("DEV_MODE")).toBe(false);

    process.env["DEV_MODE"] = "TrUe";
    expect(EnvironmentUtils.getOptionalBoolean("DEV_MODE")).toBe(true);
  });

  it("rejects invalid boolean configuration", () => {
    process.env["DEV_MODE"] = "enabled";

    expect(() => EnvironmentUtils.getOptionalBoolean("DEV_MODE")).toThrow(
      /DEV_MODE/,
    );
  });
});

describe("core environment configuration", () => {
  it("uses externally supplied release metadata", async () => {
    process.env["APP_VERSION"] = "1.2.3";
    process.env["APP_COMMIT_SHA"] = "abc123";
    vi.resetModules();

    const { Environment: isolatedEnvironment } = await import(
      "../src/core/environment"
    );

    expect(isolatedEnvironment.packageContext).toMatchObject({
      version: "1.2.3",
      commitSha: "abc123",
    });
  });

  it("loads only core configuration with safe defaults", () => {
    process.env["DEV_MODE"] = "FALSE";
    process.env["DISCORD_APPLICATION_ID"] = "test-application-id";
    process.env["DISCORD_BOT_TOKEN"] = "test-bot-token";
    delete process.env["DATA_DIRECTORY"];

    const config = Environment.loadConfig();
    expect(config.dataDirectory).toMatch(/data$/u);
    expect(config).toMatchObject({
      devMode: false,
      discordApplicationId: "test-application-id",
      discordBotToken: "test-bot-token",
    });
  });

  it.each(["./configured-data", resolve("/tmp/discord-template-data")])(
    "resolves DATA_DIRECTORY %j to an absolute path",
    async configuredDirectory => {
      process.env["DATA_DIRECTORY"] = configuredDirectory;
      vi.resetModules();
      const { Environment: isolatedEnvironment } = await import(
        "../src/core/environment"
      );

      expect(isolatedEnvironment.loadConfig().dataDirectory).toBe(
        resolve(configuredDirectory),
      );
    },
  );

  it("does not expose credential values in validation failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    process.env["DISCORD_BOT_TOKEN"] = "synthetic-secret-token";
    delete process.env["DISCORD_APPLICATION_ID"];
    vi.resetModules();

    const { Environment: isolatedEnvironment } = await import(
      "../src/core/environment"
    );

    let validationError: unknown;
    try {
      isolatedEnvironment.loadConfig();
    } catch (error) {
      validationError = error;
    }
    expect(validationError).toBeInstanceOf(Error);
    expect((validationError as Error).message).toContain(
      'Configuration value "DISCORD_APPLICATION_ID" is required',
    );
    expect(consoleError).not.toHaveBeenCalled();
    expect((validationError as Error).message).not.toContain(
      "synthetic-secret-token",
    );
  });
});

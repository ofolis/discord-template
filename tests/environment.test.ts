import { beforeAll, describe, expect, it, vi } from "vitest";
import { Environment } from "../src/core";

beforeAll(() => {
  process.env["DEV_MODE"] = "FALSE";
  process.env["DISCORD_APPLICATION_ID"] = "test-application-id";
  process.env["DISCORD_BOT_TOKEN"] = "test-bot-token";
});

describe("environment configuration", () => {
  it("reads present required and optional values", () => {
    expect(Environment.config).toStrictEqual({
      devMode: false,
      discordApplicationId: "test-application-id",
      discordBotToken: "test-bot-token",
    });
  });

  it("throws when a required value is missing without printing fixture data", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    delete process.env["DISCORD_BOT_TOKEN"];
    vi.resetModules();

    const { Environment: isolatedEnvironment } = await import(
      "../src/core/environment"
    );

    expect(() => isolatedEnvironment.config).toThrow(
      "Cannot get environment variable. Requested key was not defined.",
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
    process.env["DISCORD_BOT_TOKEN"] = "test-bot-token";
  });
});

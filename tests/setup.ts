import { afterAll } from "vitest";

const originalEnvironment: Record<string, string | undefined> = {
  DEV_MODE: process.env["DEV_MODE"],
  DATA_DIRECTORY: process.env["DATA_DIRECTORY"],
  DISCORD_APPLICATION_ID: process.env["DISCORD_APPLICATION_ID"],
  DISCORD_BOT_TOKEN: process.env["DISCORD_BOT_TOKEN"],
};

process.env["DEV_MODE"] = "FALSE";
process.env["DISCORD_APPLICATION_ID"] = "test-application-id";
process.env["DISCORD_BOT_TOKEN"] = "test-bot-token";

afterAll(() => {
  Object.entries(originalEnvironment).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
});

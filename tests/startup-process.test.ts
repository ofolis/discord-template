import { execFileSync, spawn } from "child_process";
import { join } from "path";
import { describe, expect, it } from "vitest";

type ProcessResult = {
  code: number;
  output: string;
};

function runCompiledApplication(): Promise<ProcessResult> {
  const child = spawn(
    process.execPath,
    [join(process.cwd(), "dist/index.js")],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATA_DIRECTORY: "   ",
        DISCORD_APPLICATION_ID: "synthetic-application-id",
        DISCORD_BOT_TOKEN: "synthetic-secret-token",
      },
    },
  );
  const output: string[] = [];
  child.stdout.on("data", chunk => output.push(String(chunk)));
  child.stderr.on("data", chunk => output.push(String(chunk)));
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => {
      resolve({ code: code ?? -1, output: output.join("") });
    });
  });
}

describe("compiled startup failure", () => {
  it("reports safely and exits nonzero without contacting Discord", async () => {
    execFileSync("npm", ["run", "build"], {
      cwd: process.cwd(),
      stdio: "ignore",
    });

    const result: ProcessResult = await runCompiledApplication();

    expect(result.code).toBe(1);
    expect(result.output).toContain("Failed to initialize application.");
    expect(result.output).not.toContain("synthetic-secret-token");
    expect(result.output).not.toContain("UnhandledPromiseRejection");
  });
});

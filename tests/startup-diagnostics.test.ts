import { afterEach, describe, expect, it, vi } from "vitest";
import { reportStartupFailure } from "../src/core";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startup diagnostics", () => {
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

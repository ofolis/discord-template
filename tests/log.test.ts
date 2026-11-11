import { describe, expect, it, vi } from "vitest";
import { Log } from "../src/core";

describe("logging", () => {
  it("logs a context and additional data", () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    Log.info("A test event.", { id: "fixture" });

    expect(consoleLog).toHaveBeenCalledTimes(2);
    consoleLog.mockRestore();
  });

  it("throws an Error for string contexts", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => Log.throw("Expected failure.", "_NOT_SET_")).toThrow(
      "Expected failure.",
    );
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { Log } from "../src/core";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logging", () => {
  it("logs severity and additional data", () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    Log.info("An informational event.", { id: "fixture" });
    Log.success("A successful event.");
    Log.error("An error event.", new Error("fixture failure"));

    expect(consoleLog).toHaveBeenCalledTimes(3);
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(String(consoleLog.mock.calls[0]?.[0])).toMatch(
      /\[\d{4}-\d{2}-\d{2}T[^\]]+Z\] \[INFO\]/,
    );
    expect(String(consoleLog.mock.calls[2]?.[0])).toContain("[SUCCESS]");
    expect(String(consoleError.mock.calls[0]?.[0])).toContain("[ERROR]");
  });

  it("does not mutate caller data while logging throw diagnostics", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const diagnostics = [{ id: "first" }, { id: "second" }];

    expect(() => Log.throw("Expected failure.", ...diagnostics)).toThrow(
      "Expected failure.",
    );

    expect(diagnostics).toEqual([{ id: "first" }, { id: "second" }]);
    expect(consoleError.mock.calls).toHaveLength(2);
    expect(consoleError.mock.calls[0]?.[1]).toContain("second");
    expect(consoleError.mock.calls[1]?.[1]).toContain("first");
  });

  it("preserves ordinary Error instances when throwing", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const expected = new Error("Expected failure.");
    let actual: unknown;

    try {
      Log.throw(expected, "_NOT_SET_");
    } catch (reason: unknown) {
      actual = reason;
    }

    expect(actual).toBe(expected);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("handles unknown diagnostic values without throwing during logging", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const unknownReason: unknown = { reason: "fixture" };

    expect(() => {
      Log.error("Operation failed.", unknownReason);
    }).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError.mock.calls[1]?.[1]).toContain("fixture");
  });

  it("omits the sentinel diagnostic value", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => Log.throw("Expected failure.", "_NOT_SET_")).toThrow(
      "Expected failure.",
    );
    expect(consoleError).not.toHaveBeenCalled();
  });
});

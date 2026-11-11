import { Log } from "./log";

export function reportStartupFailure(reason: unknown): void {
  console.error(
    "Failed to initialize application.",
    Log.summarizeError(reason),
  );
}

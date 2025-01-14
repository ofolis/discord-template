import { Log } from "../core";

export class Utils {
  public static emptyArray(array: unknown[]): void {
    array.length = 0;
  }

  public static emptyObject(object: Record<string, unknown>): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- This is a valid use case for dynamic delete.
    Object.keys(object).forEach((key) => delete object[key]);
  }

  public static linesToString(lines: (string | null)[]): string {
    return lines.filter((line) => line !== null).join("\n");
  }

  public static removeTopArrayItem<T>(array: T[]): T {
    const topItem: T | undefined = array.shift();
    if (topItem === undefined) {
      Log.throw("Cannot remove an item from an empty array.");
    }
    return topItem;
  }
}

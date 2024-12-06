export class Utils {
  public static catchToError(response: unknown): Error {
    if (response instanceof Error) {
      return response;
    }
    if (typeof response === "string") {
      return new Error(response);
    }
    return new Error("Unspecified caught error.");
  }
}

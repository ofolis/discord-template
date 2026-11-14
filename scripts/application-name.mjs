export const MAX_APPLICATION_NAME_LENGTH = 100;

export function isValidApplicationName(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_APPLICATION_NAME_LENGTH &&
    !/\p{Cc}/u.test(value)
  );
}

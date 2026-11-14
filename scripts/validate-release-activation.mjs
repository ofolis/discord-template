import { readFile } from "node:fs/promises";
import { isValidApplicationName } from "./application-name.mjs";

const markerPath =
  process.env.RELEASE_INITIALIZATION_MARKER ?? ".release/initialization.json";

function isValidMarker(marker) {
  return (
    marker !== null &&
    typeof marker === "object" &&
    marker.schemaVersion === 1 &&
    isValidApplicationName(marker.applicationName)
  );
}

async function validateActivation() {
  if (process.env.RELEASE_ENABLED !== "true") {
    return { allowed: false, reason: "RELEASE_ENABLED is not true" };
  }

  let marker;
  try {
    marker = JSON.parse(await readFile(markerPath, "utf8"));
  } catch {
    throw new Error(
      `Release initialization marker is missing or unreadable: ${markerPath}`,
    );
  }

  if (!isValidMarker(marker)) {
    throw new Error(
      `Release initialization marker is invalid: ${markerPath} (expected schemaVersion 1 and a valid applicationName)`,
    );
  }

  return {
    allowed: true,
    applicationName: marker.applicationName.trim(),
  };
}

try {
  const result = await validateActivation();
  console.log(`RELEASE_ALLOWED=${result.allowed}`);
  if (result.applicationName) {
    console.log(`APPLICATION_NAME=${result.applicationName}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.log("RELEASE_ALLOWED=false");
  process.exitCode = 1;
}

export { isValidMarker, validateActivation };

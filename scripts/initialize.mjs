import { execFile } from "node:child_process";
/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, custom-rules/only-protected-bracket-access, complexity */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  isValidApplicationName,
  MAX_APPLICATION_NAME_LENGTH,
} from "./application-name.mjs";

const execFileAsync = promisify(execFile);
const TEMPLATE_PACKAGE_NAME = "discord-template";
const DEFAULT_DESCRIPTION = "A Discord bot application.";
const MAX_PACKAGE_NAME_LENGTH = 214;
const MAX_DESCRIPTION_LENGTH = 500;
const TEMPLATE_HASHES = {
  "package.json":
    "fcc571c0d65706f2c07d235cfd3d36d71a21426b977a73ed2c261315b5d27fcb",
  "package-lock.json":
    "965e37ea4abd17b9eb5e67327b38a9e81088a3ca624c6ca4f0d10c5924d5133b",
  "README.md":
    "98e6064a0c690f4a9621d7a41f90ade4622c5ab47f7a539c2f461222b5801149",
};

function fail(message) {
  throw new Error(message);
}

function validateText(value, label, maxLength, required = true) {
  if (typeof value !== "string") {
    fail(`${label} is required`);
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    fail(`${label} must not be empty`);
  }
  if (trimmed.length > maxLength) {
    fail(`${label} must be ${maxLength} characters or fewer`);
  }
  if (/\p{Cc}/u.test(value)) {
    fail(`${label} must not contain control characters`);
  }
  return trimmed;
}

function validateApplicationName(value) {
  if (typeof value !== "string") {
    fail("Application name is required");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    fail("Application name must not be empty");
  }
  if (trimmed.length > MAX_APPLICATION_NAME_LENGTH) {
    fail(
      `Application name must be ${MAX_APPLICATION_NAME_LENGTH} characters or fewer`,
    );
  }
  if (!isValidApplicationName(value)) {
    fail("Application name must not contain control characters");
  }
  return trimmed;
}

function validatePackageName(value) {
  const name = validateText(value, "Package name", MAX_PACKAGE_NAME_LENGTH);
  if (name === TEMPLATE_PACKAGE_NAME) {
    fail(`Package name must differ from ${TEMPLATE_PACKAGE_NAME}`);
  }
  if (
    !/^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/.test(
      name,
    )
  ) {
    fail("Package name is not a valid npm package name");
  }
  return name;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      !["--package-name", "--application-name", "--description"].includes(
        argument,
      )
    ) {
      fail(`Unknown argument: ${argument}`);
    }
    if (values.has(argument) || argv[index + 1]?.startsWith("--")) {
      fail(`${argument} requires one value`);
    }
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  if (!values.has("--package-name") || !values.has("--application-name")) {
    fail(
      "Usage: npm run init -- --package-name <npm-name> --application-name <name> [--description <description>]",
    );
  }
  return {
    packageName: validatePackageName(values.get("--package-name")),
    applicationName: validateApplicationName(values.get("--application-name")),
    description: values.has("--description")
      ? validateText(
          values.get("--description"),
          "Description",
          MAX_DESCRIPTION_LENGTH,
        )
      : DEFAULT_DESCRIPTION,
  };
}

async function gitStatus(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd,
    });
    return stdout;
  } catch {
    fail("Initialization requires a Git repository");
  }
}

function hash(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function transformReadme(readme, applicationName, description) {
  const setupHeading = "## Setup";
  const setupIndex = readme.indexOf(setupHeading);
  if (setupIndex < 0) {
    fail("Template README does not have the expected structure");
  }
  const setup = readme.slice(setupIndex);
  const intro = `# ${applicationName}\n\n${description}\n\nThis application originated from the reusable discord-template foundation. It is a TypeScript Node.js Discord bot project that can be run using Node and released using GitHub Actions.\n\n`;
  return `${intro}${setup.trimEnd()}\n`;
}

async function readProjectFiles(cwd) {
  const paths = {
    package: join(cwd, "package.json"),
    lockfile: join(cwd, "package-lock.json"),
    readme: join(cwd, "README.md"),
    marker: join(cwd, ".release", "initialization.json"),
  };
  const [packageContents, lockContents, readmeContents] = await Promise.all([
    readFile(paths.package, "utf8"),
    readFile(paths.lockfile, "utf8"),
    readFile(paths.readme, "utf8"),
  ]);
  let marker = null;
  try {
    marker = JSON.parse(await readFile(paths.marker, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      fail("Initialization marker is malformed and requires manual review");
    }
  }
  return { paths, packageContents, lockContents, readmeContents, marker };
}

function validateMarker(marker) {
  if (
    marker === null ||
    typeof marker !== "object" ||
    marker.schemaVersion !== 1 ||
    typeof marker.applicationName !== "string" ||
    marker.applicationName.trim().length === 0 ||
    /\p{Cc}/u.test(marker.applicationName)
  ) {
    fail("Initialization marker is malformed and requires manual review");
  }
}

function prepareContents(files, input) {
  let packageJson;
  let lockJson;
  try {
    packageJson = JSON.parse(files.packageContents);
    lockJson = JSON.parse(files.lockContents);
  } catch {
    fail("The package manifest or lockfile is not valid JSON");
  }
  if (packageJson.version !== undefined || lockJson.version !== undefined) {
    fail("Initialization would introduce or alter a package version");
  }
  packageJson.name = input.packageName;
  packageJson.description = input.description;
  if (!lockJson.packages?.[""]) {
    fail("The package lockfile has no root package entry");
  }
  lockJson.name = input.packageName;
  lockJson.packages[""].name = input.packageName;
  return {
    packageContents: `${JSON.stringify(packageJson, null, 2)}\n`,
    lockContents: `${JSON.stringify(lockJson, null, 2)}\n`,
    readmeContents: transformReadme(
      files.readmeContents,
      input.applicationName,
      input.description,
    ),
    markerContents: `${JSON.stringify({ schemaVersion: 1, applicationName: input.applicationName }, null, 2)}\n`,
  };
}

async function replaceFile(
  path,
  contents,
  operations = { writeFile, rename, remove: rm },
) {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await operations.writeFile(temporaryPath, contents, "utf8");
    await operations.rename(temporaryPath, path);
  } catch (error) {
    try {
      await operations.remove(temporaryPath, { force: true });
    } catch (cleanupError) {
      throw new Error(
        `File replacement failed: ${error.message}; temporary-file cleanup failed: ${cleanupError.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

async function initializeRepository({
  cwd = process.cwd(),
  argv = process.argv.slice(2),
  replace = replaceFile,
  remove = rm,
} = {}) {
  const input = parseArguments(argv);
  if ((await gitStatus(cwd)).trim() !== "") {
    fail("Initialization requires a clean working tree");
  }
  const files = await readProjectFiles(cwd);
  if (files.marker !== null) {
    validateMarker(files.marker);
    const packageJson = JSON.parse(files.packageContents);
    const lockJson = JSON.parse(files.lockContents);
    if (
      packageJson.name === TEMPLATE_PACKAGE_NAME ||
      packageJson.name !== input.packageName ||
      packageJson.description !== input.description ||
      lockJson.name !== input.packageName ||
      lockJson.packages?.[""]?.name !== input.packageName ||
      !files.readmeContents.startsWith(`# ${files.marker.applicationName}\n`) ||
      !files.readmeContents.includes(`\n\n${packageJson.description}\n\n`) ||
      files.marker.applicationName !== input.applicationName
    ) {
      fail(
        "Initialization marker and project identity do not match the requested inputs",
      );
    }
    return { changed: false };
  }
  for (const [filename, expectedHash] of Object.entries(TEMPLATE_HASHES)) {
    const contents =
      filename === "package.json"
        ? files.packageContents
        : filename === "package-lock.json"
          ? files.lockContents
          : files.readmeContents;
    if (hash(contents) !== expectedHash) {
      fail(
        "Repository is not an untouched discord-template; refusing to overwrite files",
      );
    }
  }
  const next = prepareContents(files, input);
  const originals = new Map([
    [files.paths.package, files.packageContents],
    [files.paths.lockfile, files.lockContents],
    [files.paths.readme, files.readmeContents],
  ]);
  const written = [];
  try {
    await mkdir(dirname(files.paths.marker), { recursive: true });
    for (const [path, contents] of [
      [files.paths.package, next.packageContents],
      [files.paths.lockfile, next.lockContents],
      [files.paths.readme, next.readmeContents],
      [files.paths.marker, next.markerContents],
    ]) {
      await replace(path, contents);
      written.push(path);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const path of written.reverse()) {
      try {
        if (originals.has(path)) await replace(path, originals.get(path));
        else await remove(path, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(
          `${path}: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}`,
        );
      }
    }
    try {
      await remove(files.paths.marker, { force: true });
    } catch (cleanupError) {
      rollbackErrors.push(
        `${files.paths.marker}: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`,
      );
    }
    const originalMessage =
      error instanceof Error ? error.message : String(error);
    const rollbackMessage =
      rollbackErrors.length > 0
        ? `; rollback failures: ${rollbackErrors.join(" | ")}`
        : "";
    throw new Error(
      `Initialization failed while writing files: ${originalMessage}${rollbackMessage}`,
      { cause: error },
    );
  }
  return { changed: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await initializeRepository();
    console.log(
      result.changed
        ? "Initialization complete"
        : "Initialization already matches the requested identity",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

export {
  DEFAULT_DESCRIPTION,
  initializeRepository,
  parseArguments,
  replaceFile,
  transformReadme,
};

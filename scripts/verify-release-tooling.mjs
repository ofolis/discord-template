import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const toolingDirectory = process.env.RELEASE_TOOLING_DIR ?? process.argv[2];

if (!toolingDirectory) {
  throw new Error(
    "RELEASE_TOOLING_DIR or a tooling directory argument is required",
  );
}

const repositoryDirectory = resolve(process.cwd());
const toolingPackage = join(resolve(toolingDirectory), "package.json");
const toolingRequire = createRequire(toolingPackage);
const releaseConfig = JSON.parse(
  readFileSync(join(repositoryDirectory, ".releaserc.json"), "utf8"),
);
/** @type {{ plugins: Array<string | [string, ...unknown[]]> }} */
const configuredRelease = releaseConfig;

function runGit(directory, ...args) {
  return execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** @param {string} specifier */
function loadPlugin(specifier) {
  const modulePath = specifier.startsWith(".")
    ? resolve(repositoryDirectory, specifier)
    : toolingRequire.resolve(specifier);
  return import(modulePath);
}

const plugins = [];
for (const configuredPlugin of configuredRelease.plugins) {
  const specifier = Array.isArray(configuredPlugin)
    ? configuredPlugin[0]
    : configuredPlugin;
  const plugin = await loadPlugin(specifier);
  plugins.push({ plugin, specifier });
}

const analyzer = plugins.find(
  ({ specifier }) => specifier === "@semantic-release/commit-analyzer",
).plugin;
const notesGenerator = plugins.find(
  ({ specifier }) => specifier === "@semantic-release/release-notes-generator",
).plugin;

if (typeof analyzer.analyzeCommits !== "function") {
  throw new Error("commit-analyzer did not expose analyzeCommits");
}
if (typeof notesGenerator.generateNotes !== "function") {
  throw new Error("release-notes-generator did not expose generateNotes");
}

const preset = await import(
  toolingRequire.resolve("conventional-changelog-conventionalcommits")
);
const presetConfig = await (preset.default ?? preset)();
if (!presetConfig.parserOpts || !presetConfig.writerOpts) {
  throw new Error("conventionalcommits preset did not resolve correctly");
}
const { FIRST_RELEASE: firstRelease } = await import(
  join(
    resolve(toolingDirectory),
    "node_modules/semantic-release/lib/definitions/constants.js",
  )
);

const fixtureDirectory = mkdtempSync(join(tmpdir(), "semantic-release-"));
try {
  runGit(fixtureDirectory, "init", "--quiet");
  runGit(fixtureDirectory, "config", "user.name", "Release verification");
  runGit(
    fixtureDirectory,
    "config",
    "user.email",
    "release-verification@example.invalid",
  );

  const commits = [];
  for (const message of [
    "fix: patch behavior",
    "feat: add behavior",
    "feat: remove behavior\n\nBREAKING CHANGE: behavior removed",
    "docs: explain behavior",
  ]) {
    writeFileSync(join(fixtureDirectory, "fixture.txt"), `${message}\n`);
    runGit(fixtureDirectory, "add", "fixture.txt");
    runGit(fixtureDirectory, "commit", "--quiet", "-m", message);
    commits.push({
      hash: runGit(fixtureDirectory, "rev-parse", "HEAD"),
      message,
    });
  }

  const contextFor = message => ({
    commits: [{ message, hash: commits[0].hash }],
    logger: { log() {} },
  });
  const classifications = new Map();
  for (const [message, expected] of [
    ["fix: patch behavior", "patch"],
    ["feat: add behavior", "minor"],
    ["feat: remove behavior\n\nBREAKING CHANGE: behavior removed", "major"],
    ["docs: explain behavior", null],
  ]) {
    const result = await analyzer.analyzeCommits(
      { preset: "conventionalcommits" },
      contextFor(message),
    );
    classifications.set(message, result);
    if (result !== expected) {
      throw new Error(
        `Unexpected release classification for ${message}: ${result}`,
      );
    }
  }

  const notes = await notesGenerator.generateNotes(
    { preset: "conventionalcommits" },
    {
      commits,
      lastRelease: { gitTag: "", version: "" },
      nextRelease: { gitTag: "v1.0.0", version: "1.0.0" },
      options: { repositoryUrl: "https://github.com/example/release-check" },
      logger: { log() {} },
    },
  );
  if (!notes.includes("## 1.0.0") || !notes.includes("feat: add behavior")) {
    throw new Error("Release-note generation did not produce expected notes");
  }

  /** @type {string} */
  const initialRelease = firstRelease;
  if (!/^1\.0\.0$/.test(initialRelease)) {
    throw new Error(`Unexpected initial release version: ${initialRelease}`);
  }

  console.log(`Loaded ${plugins.length} configured release plugins.`);
  console.log("Resolved conventionalcommits preset.");
  console.log(
    `Commit analysis: fix=${classifications.get("fix: patch behavior")}, ` +
      `feat=${classifications.get("feat: add behavior")}, ` +
      `breaking=${classifications.get("feat: remove behavior\n\nBREAKING CHANGE: behavior removed")}, ` +
      `docs=${classifications.get("docs: explain behavior")}.`,
  );
  console.log("Release-note generation: generated 1.0.0 notes.");
  console.log("Initial release classification: 1.0.0.");
  console.log("No publication APIs were invoked.");
} finally {
  rmSync(fixtureDirectory, { recursive: true, force: true });
}

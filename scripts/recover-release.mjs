/* global fetch */
/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import { execFileSync } from "node:child_process";
import {
  buildImage,
  inspectRemoteImage,
  publishImage,
  verifyImage,
} from "./semantic-release-docker.mjs";

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function repository() {
  const value = process.env.GITHUB_REPOSITORY;
  if (!value || !/^[^/\s]+\/[^/\s]+$/.test(value)) {
    throw new Error("GITHUB_REPOSITORY must be an owner/name pair");
  }
  return value;
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is required for release recovery");
  }
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`GitHub API request failed with HTTP ${response.status}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("GitHub API returned malformed JSON");
  }
}

function verifyTaggedCommit(tag, mainRef) {
  run("git", ["fetch", "--no-tags", "origin", "main"]);
  run("git", ["fetch", "--tags", "origin"]);
  const tagCommit = run("git", ["rev-list", "-n", "1", `refs/tags/${tag}`]);
  const mainCommit = run("git", ["rev-parse", mainRef]);
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", tagCommit, mainCommit]);
  } catch {
    throw new Error(`${tag} does not reference a commit reachable from main`);
  }
  run("git", ["checkout", "--detach", tagCommit]);
  const checkedOut = run("git", ["rev-parse", "HEAD"]);
  if (checkedOut !== tagCommit) {
    throw new Error(
      "Recovery checkout does not match the existing release tag",
    );
  }
  return tagCommit;
}

async function reconcileRelease(tag, commitSha) {
  const repo = repository();
  const existing = await githubRequest(
    `/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
  );
  if (existing && existing.tag_name !== tag) {
    throw new Error(
      `GitHub Release returned unexpected tag ${existing.tag_name}`,
    );
  }
  if (!existing) {
    const created = await githubRequest(`/repos/${repo}/releases`, {
      method: "POST",
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        generate_release_notes: true,
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (!created || created.tag_name !== tag) {
      throw new Error("GitHub Release creation returned an unexpected tag");
    }
    return "created";
  }
  if (
    existing.target_commitish &&
    /^[0-9a-f]{40}$/i.test(existing.target_commitish)
  ) {
    if (existing.target_commitish.toLowerCase() !== commitSha.toLowerCase()) {
      throw new Error(
        "Existing GitHub Release references an unexpected commit",
      );
    }
  }
  return "existing";
}

async function recover() {
  const version = process.env.RECOVERY_VERSION?.trim();
  if (!version || !versionPattern.test(version)) {
    throw new Error("RECOVERY_VERSION must be a valid semantic version");
  }
  const tag = `v${version}`;
  const commitSha = verifyTaggedCommit(tag, "origin/main");
  const image = await inspectRemoteImage(version);
  if (image.exists) {
    verifyImage(version, commitSha, image.digest);
    console.log(`Verified existing image ${image.reference} (${image.digest})`);
  } else {
    buildImage(version, commitSha);
    await publishImage(version, commitSha);
    console.log(`Published missing image for ${tag}`);
  }
  const releaseState = await reconcileRelease(tag, commitSha);
  console.log(`Recovery complete for ${tag} at ${commitSha}: ${releaseState}`);
}

try {
  await recover();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

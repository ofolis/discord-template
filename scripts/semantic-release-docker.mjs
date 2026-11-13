/* global Buffer, fetch */
/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-argument */

import { execFileSync } from "node:child_process";

const registry = "ghcr.io";

/** @typedef {{ Config?: { Labels?: Record<string, string> | null, Env?: string[] } }} DockerMetadata */

/** @param {string} command @param {readonly string[]} args */
function runCapture(command, args) {
  return execFileSync(command, args, { encoding: "utf8" });
}

/** @param {string} command @param {readonly string[]} args */
function runInherit(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function imageReference(version) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || repository.includes(" ")) {
    throw new Error("GITHUB_REPOSITORY is required for Docker publication");
  }
  return `${registry}/${repository.toLowerCase()}:${version}`;
}

function imageParts(version) {
  const reference = imageReference(version);
  const match = /^ghcr\.io\/(.+):([^:]+)$/.exec(reference);
  if (!match) {
    throw new Error("Unable to parse GHCR image reference");
  }
  return { reference, repository: match[1], tag: match[2] };
}

function inspectLocal(image) {
  const raw = runCapture("docker", [
    "image",
    "inspect",
    image,
    "--format",
    "{{json .}}",
  ]);
  /** @type {DockerMetadata} */
  const metadata = JSON.parse(raw);
  const labels = metadata.Config?.Labels ?? {};
  const environment = Object.fromEntries(
    (metadata.Config?.Env ?? []).map(environmentEntry),
  );
  return {
    labels,
    environment,
    architecture: metadata.Architecture,
    operatingSystem: metadata.Os,
    repoDigests: metadata.RepoDigests ?? [],
  };
}

/** @param {string} entry @returns {[string, string]} */
function environmentEntry(entry) {
  const separator = entry.indexOf("=");
  return [entry.slice(0, separator), entry.slice(separator + 1)];
}

export function verifyImage(version, commitSha, expectedDigest) {
  const image = imageReference(version);
  const { labels, environment, architecture, operatingSystem, repoDigests } =
    inspectLocal(image);
  const expected = {
    version: version,
    revision: commitSha,
  };
  const {
    "org.opencontainers.image.version": imageVersion,
    "org.opencontainers.image.revision": imageRevision,
  } = labels;
  if (
    imageVersion !== expected.version ||
    imageRevision !== expected.revision ||
    environment.APP_VERSION !== expected.version ||
    environment.APP_COMMIT_SHA !== expected.revision ||
    architecture !== "amd64" ||
    operatingSystem !== "linux"
  ) {
    throw new Error(
      `Docker metadata mismatch for ${image}; expected version ${version} and commit ${commitSha}`,
    );
  }
  const repository = image.slice(0, image.lastIndexOf(":"));
  if (
    expectedDigest &&
    !repoDigests.includes(`${repository}@${expectedDigest}`)
  ) {
    throw new Error(`Docker digest mismatch for ${image}`);
  }
}

async function registryManifestRequest(repository, tag, headers = {}) {
  const url = `https://${registry}/v2/${repository}/manifests/${encodeURIComponent(tag)}`;
  const response = await fetch(url, { headers, redirect: "error" });
  if (response.status !== 401) {
    return response;
  }

  const challenge = response.headers.get("www-authenticate");
  const parameters = parseBearerChallenge(challenge);
  if (!parameters) {
    throw new Error("GHCR returned an unsupported authentication challenge");
  }

  const realm = new URL(parameters.realm);
  if (
    realm.href !== "https://ghcr.io/token" ||
    realm.protocol !== "https:" ||
    realm.hostname !== "ghcr.io" ||
    realm.port !== "" ||
    realm.username !== "" ||
    realm.password !== ""
  ) {
    throw new Error("GHCR returned an untrusted authentication realm");
  }

  const token = process.env.GITHUB_TOKEN;
  const actor = process.env.GITHUB_ACTOR;
  if (!token || !actor) {
    throw new Error(
      "GITHUB_TOKEN and GITHUB_ACTOR are required for GHCR inspection",
    );
  }
  const tokenUrl = new URL(realm);
  tokenUrl.searchParams.set("service", parameters.service);
  tokenUrl.searchParams.set("scope", parameters.scope);
  const tokenResponse = await fetch(tokenUrl, {
    redirect: "error",
    headers: {
      Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString("base64")}`,
    },
  });
  if (!tokenResponse.ok) {
    throw new Error(
      `GHCR authentication failed with HTTP ${tokenResponse.status}`,
    );
  }
  const tokenBody = await tokenResponse.text();
  let tokenPayload;
  try {
    tokenPayload = JSON.parse(tokenBody);
  } catch {
    throw new Error("GHCR authentication returned malformed JSON");
  }
  if (
    typeof tokenPayload.token !== "string" ||
    tokenPayload.token.length === 0
  ) {
    throw new Error("GHCR authentication returned no registry token");
  }
  return fetch(url, {
    redirect: "error",
    headers: { ...headers, Authorization: `Bearer ${tokenPayload.token}` },
  });
}

function parseBearerChallenge(challenge) {
  const prefix = /^Bearer\s+/.exec(challenge ?? "");
  if (!prefix) {
    return null;
  }

  const parameters = {};
  let remaining = challenge.slice(prefix[0].length).trim();
  while (remaining.length > 0) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*"([^"\\]*)"/.exec(remaining);
    if (!match || parameters[match[1]]) {
      return null;
    }
    parameters[match[1]] = match[2];
    remaining = remaining.slice(match[0].length).trim();
    if (remaining.length > 0) {
      if (!remaining.startsWith(",")) {
        return null;
      }
      remaining = remaining.slice(1).trim();
    }
  }

  if (!parameters.realm || !parameters.service || !parameters.scope) {
    return null;
  }
  return parameters;
}

export async function inspectRemoteImage(version) {
  const { reference, repository, tag } = imageParts(version);
  const token = process.env.GITHUB_TOKEN;
  const actor = process.env.GITHUB_ACTOR;
  if (!token || !actor) {
    throw new Error(
      "GITHUB_TOKEN and GITHUB_ACTOR are required for GHCR inspection",
    );
  }
  const response = await registryManifestRequest(repository, tag, {
    Accept:
      "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
  });
  const body = await response.text();
  if (response.status === 404) {
    return { exists: false, reference };
  }
  if (!response.ok) {
    throw new Error(
      `GHCR manifest inspection failed with HTTP ${response.status}`,
    );
  }
  try {
    JSON.parse(body);
  } catch {
    throw new Error("GHCR manifest inspection returned malformed JSON");
  }
  const digest = response.headers.get("docker-content-digest");
  if (!digest) {
    throw new Error("GHCR manifest inspection returned no digest");
  }
  return { exists: true, reference, digest };
}

export function buildImage(version, commitSha) {
  if (!version || !commitSha) {
    throw new Error(
      "semantic-release did not provide a release version and commit",
    );
  }

  const image = imageReference(version);
  runInherit("docker", [
    "buildx",
    "build",
    "--platform",
    "linux/amd64",
    "--load",
    "--tag",
    image,
    "--build-arg",
    `APP_VERSION=${version}`,
    "--build-arg",
    `APP_COMMIT_SHA=${commitSha}`,
    "--label",
    `org.opencontainers.image.version=${version}`,
    "--label",
    `org.opencontainers.image.revision=${commitSha}`,
    ".",
  ]);
  verifyImage(version, commitSha);
}

export async function publishImage(version, commitSha, logger = console) {
  const image = imageReference(version);
  const remote = await inspectRemoteImage(version);

  if (remote.exists) {
    runInherit("docker", ["pull", image]);
    verifyImage(version, commitSha, remote.digest);
    logger.log(`Verified existing GHCR image ${image}; no overwrite performed`);
    return remote;
  }

  runInherit("docker", ["push", image]);
  const published = await inspectRemoteImage(version);
  if (!published.exists) {
    throw new Error(`GHCR image was not found after pushing ${image}`);
  }
  runInherit("docker", ["pull", image]);
  verifyImage(version, commitSha, published.digest);
  return published;
}

export function prepare(pluginConfig, context) {
  const version = context.nextRelease?.version;
  const commitSha = context.nextRelease?.gitHead;
  if (!version || !commitSha) {
    throw new Error(
      "semantic-release did not provide a release version and commit",
    );
  }
  buildImage(version, commitSha);
}

export async function publish(pluginConfig, context) {
  const version = context.nextRelease?.version;
  const commitSha = context.nextRelease?.gitHead;
  if (!version || !commitSha) {
    throw new Error(
      "semantic-release did not provide a release version and commit",
    );
  }
  const published = await publishImage(version, commitSha, context.logger);
  return { name: published.reference, url: `https://${published.reference}` };
}

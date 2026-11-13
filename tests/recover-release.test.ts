/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, require-await */

import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recover } from "../scripts/recover-release.mjs";
import {
  buildImage,
  inspectRemoteImage,
  publishImage,
  pullAndVerifyImage,
} from "../scripts/semantic-release-docker.mjs";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("../scripts/semantic-release-docker.mjs", () => ({
  buildImage: vi.fn(),
  inspectRemoteImage: vi.fn(),
  pullAndVerifyImage: vi.fn(),
  publishImage: vi.fn(),
}));

const tagCommit = "a".repeat(40);
const mainCommit = "b".repeat(40);
const digest = "sha256:existing";

function configureGitMock(): void {
  vi.mocked(execFileSync).mockImplementation((_command, args) => {
    const gitArgs = args as string[];
    if (gitArgs[0] === "rev-list") {
      return `${tagCommit}\n`;
    }
    if (gitArgs[0] === "rev-parse" && gitArgs[1] === "origin/main") {
      return `${mainCommit}\n`;
    }
    if (gitArgs[0] === "rev-parse" && gitArgs[1] === "HEAD") {
      return `${tagCommit}\n`;
    }
    return "";
  });
}

function configureRecoveryEnvironment(): void {
  vi.stubEnv("RECOVERY_VERSION", "1.0.1");
  vi.stubEnv("GITHUB_REPOSITORY", "example/repository");
  vi.stubEnv("GITHUB_TOKEN", "test-token");
}

function githubReleaseResponse(): Response {
  return new Response(
    JSON.stringify({ tag_name: "v1.0.1", target_commitish: tagCommit }),
    { status: 200 },
  );
}

describe("release recovery orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureGitMock();
    configureRecoveryEnvironment();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(githubReleaseResponse());
  });

  it("pulls and verifies an existing image before preserving its release", async () => {
    const events: string[] = [];
    vi.mocked(inspectRemoteImage).mockImplementation(async () => {
      events.push("inspect");
      return {
        exists: true,
        reference: "ghcr.io/example/repository:1.0.1",
        digest,
      };
    });
    vi.mocked(pullAndVerifyImage).mockImplementation(() => {
      events.push("pull-and-verify");
    });

    await recover();

    expect(events).toEqual(["inspect", "pull-and-verify"]);
    expect(pullAndVerifyImage).toHaveBeenCalledWith("1.0.1", tagCommit, digest);
    expect(buildImage).not.toHaveBeenCalled();
    expect(publishImage).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops before release reconciliation when existing image verification fails", async () => {
    vi.mocked(inspectRemoteImage).mockResolvedValue({
      exists: true,
      reference: "ghcr.io/example/repository:1.0.1",
      digest,
    });
    vi.mocked(pullAndVerifyImage).mockImplementation(() => {
      throw new Error("Docker metadata mismatch");
    });

    await expect(recover()).rejects.toThrow("Docker metadata mismatch");

    expect(buildImage).not.toHaveBeenCalled();
    expect(publishImage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rebuilds and publishes a missing image from the tagged checkout", async () => {
    const events: string[] = [];
    vi.mocked(inspectRemoteImage).mockImplementation(async () => {
      events.push("inspect");
      return {
        exists: false,
        reference: "ghcr.io/example/repository:1.0.1",
      };
    });
    vi.mocked(buildImage).mockImplementation((version, commit) => {
      events.push("build");
      expect(version).toBe("1.0.1");
      expect(commit).toBe(tagCommit);
    });
    vi.mocked(publishImage).mockImplementation(async (version, commit) => {
      events.push("publish");
      expect(version).toBe("1.0.1");
      expect(commit).toBe(tagCommit);
      return {
        exists: true,
        reference: "ghcr.io/example/repository:1.0.1",
        digest,
      };
    });

    await recover();

    expect(events).toEqual(["inspect", "build", "publish"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("creates a missing GitHub Release and preserves an existing one", async () => {
    vi.mocked(inspectRemoteImage).mockResolvedValue({
      exists: false,
      reference: "ghcr.io/example/repository:1.0.1",
    });
    vi.mocked(buildImage).mockImplementation(() => undefined);
    vi.mocked(publishImage).mockResolvedValue({
      exists: true,
      reference: "ghcr.io/example/repository:1.0.1",
      digest,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tag_name: "v1.0.1" }), { status: 201 }),
      );

    await recover();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://api.github.com/repos/example/repository/releases",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects invalid recovery versions before checking Git or the registry", async () => {
    vi.stubEnv("RECOVERY_VERSION", "1.0");

    await expect(recover()).rejects.toThrow(
      "RECOVERY_VERSION must be a valid semantic version",
    );

    expect(execFileSync).not.toHaveBeenCalled();
    expect(inspectRemoteImage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid or unreachable release tag before image work", async () => {
    vi.mocked(execFileSync).mockImplementation((_command, args) => {
      const gitArgs = args as string[];
      if (gitArgs[0] === "rev-list") {
        throw new Error("unknown tag");
      }
      return "";
    });

    await expect(recover()).rejects.toThrow("unknown tag");
    expect(inspectRemoteImage).not.toHaveBeenCalled();

    configureGitMock();
    vi.mocked(execFileSync).mockImplementation((_command, args) => {
      const gitArgs = args as string[];
      if (gitArgs[0] === "merge-base") {
        throw new Error("not reachable");
      }
      return configureGitMockOutput(gitArgs);
    });

    await expect(recover()).rejects.toThrow(
      "does not reference a commit reachable from main",
    );
    expect(inspectRemoteImage).not.toHaveBeenCalled();
  });
});

function configureGitMockOutput(args: string[]): string {
  if (args[0] === "rev-list") {
    return `${tagCommit}\n`;
  }
  if (args[0] === "rev-parse" && args[1] === "origin/main") {
    return `${mainCommit}\n`;
  }
  if (args[0] === "rev-parse" && args[1] === "HEAD") {
    return `${tagCommit}\n`;
  }
  return "";
}

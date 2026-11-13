# Release Contract

This repository is a source-code template. It has no application semantic
version and does not publish GitHub Releases or container images.

## Semantic release

Implementing repositories use semantic-release as the only version authority.
The shared configuration:

- analyzes Conventional Commits;
- releases from `main`;
- creates tags in the form `v${version}`;
- generates GitHub Release notes; and
- does not publish npm packages, modify package versions, or commit changelogs.

With no prior semantic-release tag in an implementing repository, the first
release is `1.0.0`. The template repository must not receive a release tag.

Release tooling is installed only for an authorized release operation. It is
not part of the application dependency graph. The release workflow runs the
exact-pinned CI installation below with Node 24.10 or newer. Installation is
performed in the runner temporary directory with lifecycle scripts disabled and
without `GITHUB_TOKEN`; the token is scoped only to the execution step:

```sh
npm install --prefix "$RUNNER_TEMP/semantic-release" --no-save \
  --ignore-scripts --no-audit --no-fund \
  semantic-release@25.0.9 \
  @semantic-release/commit-analyzer@13.0.1 \
  @semantic-release/release-notes-generator@14.1.1 \
  @semantic-release/github@12.0.11
```

The installed binary resolves `.releaserc.json` from the repository checkout
and loads all four configured packages without permanently installing them
locally. Running that binary with `--dry-run --no-ci` is the non-publishing
fixture invocation.
The exact top-level pins make the release toolchain auditable and repeatable;
future toolchain updates must reassess the complete transient dependency graph.

The local `scripts/semantic-release-docker.mjs` plugin is loaded by
semantic-release from the checkout. It uses `nextRelease.version` and
`nextRelease.gitHead`; it does not calculate a version independently. The
plugin builds the `linux/amd64` image with those values and checks its OCI
labels and runtime environment before the image can be pushed.

## Activation

The release workflow may publish only when both conditions are true:

1. The repository variable `RELEASE_ENABLED` is exactly `true`.
2. `.release/initialization.json` exists and contains a valid W6 marker:

   ```json
   {
     "schemaVersion": 1,
     "applicationName": "example-bot"
   }
   ```

The marker is intentionally absent from this template. A variable alone must
not activate release publication. W6 creates the marker as part of initializing
an implementing repository and supplies the real application identity.

Validation CI remains active regardless of the activation state. The current
validator can be exercised with:

```sh
npm run validate:release-activation
```

The optional `RELEASE_INITIALIZATION_MARKER` environment variable is provided
for isolated tests and future workflow fixtures; the default path is
`.release/initialization.json`.

`main-commit.yaml` remains the validation workflow for pull requests and
direct pushes to `main`. It is also callable by `release.yaml`, so a release
cannot rely on the result of a separately triggered workflow run. A disabled
release is a successful no-op after validation. A missing or malformed marker
fails the activation job, including for manual dispatch. Both push and manual
dispatch release jobs require `github.ref == refs/heads/main`; dispatching from
another branch skips validation, activation, and publication.

## Artifact metadata contract

The future publication workflow derives the image destination from its own
GitHub repository identity. It must not hardcode this template's repository.

For a release such as `1.2.3`:

| Artifact                | Value               |
| ----------------------- | ------------------- |
| Git tag                 | `v1.2.3`            |
| GHCR image tag          | `1.2.3`             |
| Docker `APP_VERSION`    | `1.2.3`             |
| Docker `APP_COMMIT_SHA` | released commit SHA |

The Dockerfile maps these build arguments to OCI labels and runtime metadata.
The release workflow derives the image name as
`ghcr.io/${github.repository}` in lowercase. It publishes only the exact
semantic-version tag, never `latest` or moving major/minor aliases. The
Docker build never receives `GITHUB_TOKEN`.

## Release sequencing and recovery

The release job first runs the complete validation workflow, then checks
activation, logs in to GHCR, and invokes semantic-release. Semantic-release
is the sole version authority. Its local Docker plugin uses the calculated
release context to build and verify the image, then publishes the image before
the GitHub Release plugin creates the GitHub Release. Git tags are managed by
semantic-release; the workflow does not claim that the tag, image, and GitHub
Release form one atomic transaction.

Because semantic-release creates its tag before later lifecycle hooks, a
Docker build or push failure can leave a tag without an image, and a GitHub
Release failure can leave a tag and image without a release. These failures
are intentionally visible and stop the job. A normal semantic-release retry
is not a recovery mechanism: once the tag exists, semantic-release may decide
that there is no new release and skip publication hooks.

Recovery is an explicit manual dispatch with `recovery_version`, for example
`1.2.3`. The recovery path:

1. Requires the same activation marker and `RELEASE_ENABLED=true` checks.
2. Requires the workflow ref to be `main` and verifies `v1.2.3` exists.
3. Fetches `main`, verifies the tag commit is reachable from `origin/main`, and
   checks out the exact tagged commit detached.
4. Uses that tag's commit as `APP_COMMIT_SHA`; it never calculates a version or
   creates a tag.
5. Inspects the GHCR manifest. A missing image is rebuilt and pushed; an
   existing image is pulled and checked for version, commit, platform, and
   digest identity. Mismatches fail without overwrite.
6. Checks the GitHub Release for the exact tag. A missing release is created
   with GitHub's `generate_release_notes` mechanism; an existing matching
   release is reused, and conflicting state fails.

Recovery is idempotent when all artifacts agree. It is serialized by the
`release-main` concurrency group. The registry check is fail-closed for
authentication, network, service, and malformed-response errors. GHCR still
does not provide a transactional check-and-push guarantee here, so registry
tag immutability remains an operational policy limitation.

## Local non-publishing verification

The template intentionally has no initialization marker and cannot publish.
Run the validation suite and activation tests locally. For a disposable
initialized fixture, set `RELEASE_INITIALIZATION_MARKER` to a temporary valid
marker and run the validator; this only checks eligibility and does not grant
GitHub credentials. Semantic-release can be exercised with its dry-run mode:

```sh
npx --yes \
  --package semantic-release@25.0.9 \
  --package @semantic-release/commit-analyzer@13.0.1 \
  --package @semantic-release/release-notes-generator@14.1.1 \
  --package @semantic-release/github@12.0.11 \
  semantic-release --dry-run --no-ci
```

Use disposable local Docker tags to inspect the Dockerfile metadata. Do not
run the release workflow against this template, push to GHCR, create a GitHub
Release, or add the W6 initialization marker here. Recovery behavior has been
verified with local fixtures and mocked boundaries only; live GitHub and GHCR
execution remains an implementing-repository acceptance test.

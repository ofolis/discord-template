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
not part of the application dependency graph. W5.5b must run the exact-pinned
CI installation below with Node 24.10 or newer:

```sh
npx --yes \
  --package semantic-release@25.0.9 \
  --package @semantic-release/commit-analyzer@13.0.1 \
  --package @semantic-release/release-notes-generator@14.1.1 \
  --package @semantic-release/github@12.0.11 \
  semantic-release
```

The command resolves `.releaserc.json` from the repository checkout and loads
all four configured packages without permanently installing them locally. The
same command with `--dry-run --no-ci` is the non-publishing fixture invocation.
The exact top-level pins make the release toolchain auditable and repeatable;
W5.5b owns future updates and must reassess the complete transient dependency
graph when changing them.

## Activation

The future release workflow may publish only when both conditions are true:

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
W5.5b will coordinate validation, activation, semantic-release, and initial
`linux/amd64` image publication. It will use exact semantic-version tags and
will not publish a moving `latest` tag initially. W5.5b also owns release-job
credential handling, image publication ordering, and repair of partial
publication. This document does not activate or implement that workflow.

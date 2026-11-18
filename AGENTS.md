# Repository guidance

## Repository identity and scope

This repository is a reusable, generic TypeScript Discord.js bot template. The upstream template must remain uninitialized: keep the `discord-template` package identity, omit `.release/initialization.json`, and do not publish releases or images from this repository. Application-specific integrations belong in repositories created from the template. Video City-specific scheduling, media, Notion, Plex, playback, or broadcast architecture does not belong here.

The main implementation is organized as follows:

- `src/application-lifecycle.ts` coordinates initialization, Discord login, readiness, command deployment, interaction handling, and graceful shutdown.
- `src/core/discord.ts` owns the Discord client, command serialization/deployment, and Discord API-facing helpers.
- `src/commands` contains command implementations; `src/core/entities` and `src/core/types` define shared command, message, and persistence contracts.
- `src/controllers` and `src/saveables` connect application behavior to persisted state.
- `src/core/json-store.ts` provides JSON persistence; `src/core/log.ts` provides the logging abstraction.
- `scripts` contains guarded initialization, release validation/recovery, and Docker release tooling.

## Engineering conventions

Use Node.js 24 and TypeScript with the existing strict CommonJS compiler configuration. Follow the existing `src` organization, naming conventions, explicit types, Prettier formatting, ESLint rules, and simple readable implementation style. Existing repository conventions take precedence over speculative patterns or new abstractions.

Use the package scripts for validation:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run validate:release-activation
```

Run focused tests while iterating, then run the full suite and review `git diff --check` before handoff.

## Discord architecture

Commands are converted to Discord slash-command builders and partitioned by registration type. Deployment uses bulk replacement: the submitted command set replaces the existing global or guild command set, which intentionally removes obsolete commands. Do not change this removal semantics or introduce duplicate command deployment.

Command options must use the existing `CommandOptionType` contracts and validated bounds. Interaction handling in `src/core/interaction-handler.ts` must acknowledge supported interactions exactly once and must not log interaction payloads or options. The client becomes ready through Discord.js `clientReady`; startup waits for readiness and initial deployment before entering `running`. Shutdown stops accepting work, waits for tracked handlers and registrations, drains persistence, destroys the client, and removes listeners.

Use safe, sanitized error summaries and preserve original errors when propagating failures. Deployment diagnostics belong to the Discord deployment layer; lifecycle code should make lifecycle decisions and prevent unhandled rejections without duplicating deployment diagnostics.

## Persistence

`JsonStore` stores one JSON object per validated key. Updates for the same key are serialized through a per-key queue. An update reads the current value, runs one transactional transformation, and writes the replacement before resolving; re-entry into the active key is rejected. Writes serialize JSON to a temporary file and atomically replace the destination with `rename`, cleaning up temporary files on failure. `drain()` waits for currently pending operations, and failures propagate to the caller while queues remain usable for later work.

These guarantees apply per key. Operations involving different keys are not one globally atomic transaction.

## Diagnostics and secrets

Use `Log.debug`, `Log.info`, `Log.success`, and `Log.error` with the existing severity conventions. Include actionable identifiers, counts, and sanitized error metadata where useful. Never log tokens, credentials, environment objects, raw Discord API responses, request or response bodies, interaction payloads or options, message content, or persisted user data. Do not add persistent file logging as a requirement.

## Initialization and releases

`npm run init -- --package-name <name> --application-name <name> [--description <text>]` is guarded: it requires a clean repository and validates the canonical fingerprints before changing identity. It updates only the package identity, lockfile root identity, README identity, and `.release/initialization.json`. Replacement is rollback-safe, and repeated initialization is validated for idempotent identity rather than silently overwriting customized files.

The initializer fingerprints the canonical `package.json`, `package-lock.json`, and `README.md`; the pristine fixture under `tests/fixtures/pristine-template` is the authoritative test input. Changes to README or package metadata must update the corresponding fingerprint and pristine fixture when appropriate. Do not weaken fingerprint checks or add these instruction files to the manifest without an approved initialization change.

Release eligibility requires both `RELEASE_ENABLED=true` and a valid `.release/initialization.json` marker. Semantic-release is the version authority for initialized implementing repositories, creating Git tags and GitHub Releases while the gated workflow publishes exact semantic-version images to GHCR. The Docker contract uses the pinned Node 24 image, non-root runtime, `APP_VERSION`, `APP_COMMIT_SHA`, OCI metadata, and no `latest` tag. Preserve the release workflows, semantic-release configuration, activation gates, recovery behavior, and Docker contracts unless explicitly authorized.

## Git workflow

Use Conventional Commits; Commitizen is available to help create them. The repository convention is merge commits with squash merging disabled, rebase merging disabled, and linear-history enforcement disabled. `main` is protected with required `Main CI` checks and resolved review conversations before merge. Preserve individual Conventional Commit messages so semantic-release can analyze their release impact; PR titles are not the release authority.

For Codex-assisted work, investigate the relevant implementation and tests before changing code, keep increments small and scoped, run appropriate validation, review the complete diff, and stage changes for owner review. Commit, push, create pull requests, or deploy only when explicitly authorized. These instructions do not require contributors to use Codex.

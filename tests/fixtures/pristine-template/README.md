# discord-template

`discord-template` is a reusable TypeScript Discord.js bot foundation. It provides a Node 24 application runtime, Discord application infrastructure, JSON persistence, Docker Compose operation, validation CI, safe implementing-repository initialization, and gated semantic-release/GHCR automation.

This repository is the template itself. It is not a deployable bot and it must not publish GitHub Releases or container images.

## Create an implementing repository

1. Create a new GitHub repository with **Use this template**.
2. Clone the new repository and confirm the checkout is clean.
3. Use Node 24 and install dependencies:

   ```sh
   nvm use
   npm ci
   ```

4. Initialize the application identity:

   ```sh
   npm run init -- --package-name <npm-package-name> --application-name <application-name> [--description <description>]
   ```

   The package name and application name are required. The description defaults to `A Discord bot application.`. Initialization changes only the package identity, lockfile root identity, README, and release initialization marker. It does not request credentials, enable releases, or overwrite a customized repository.

5. Commit the initialized repository before continuing with application setup.

## Setup

### Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. In **General Information**, save the Application ID.
3. In **Installation**, keep **Guild Install** as the only context method and disable the install link.
4. In **OAuth2**, disable **Public Client**. Create a guild-install URL with the `bot` and `applications.commands` scopes and only the permissions the application needs. The shared channel-message helper may need **View Channel** and **Send Messages**.
5. In **Bot**, reset and save the token. Keep privileged gateway intents disabled; the template requests only the non-privileged `Guilds` intent.
6. Install the bot in a test server using the generated URL.

Gateway intents, OAuth2 scopes, and bot permissions are separate controls. Enable additional intents or permissions only when application code requires them.

### Environment

Copy `.env.example` to an untracked `.env` file and set:

```dotenv
DISCORD_APPLICATION_ID=<Discord Application ID>
DISCORD_BOT_TOKEN=<Discord Bot Token>
```

`DEV_MODE` defaults to `false`; `DATA_DIRECTORY` defaults to `./data` relative to the process working directory. `APP_VERSION` and `APP_COMMIT_SHA` are optional local metadata values supplied by release automation for deployed images. Keep tokens and `.env` files out of Git and rotate a token immediately if it is exposed.

### Local development

```sh
npm run dev
```

The development command watches `src/index.ts` and restarts the bot after changes. The production build is written to `dist/` and can be started with `npm start`.

### Testing and validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The GitHub Actions validation workflow runs these checks plus production and all-dependency npm audits. The audits report findings without failing solely because of an existing advisory; review high and critical production findings promptly.

### Docker Compose

After configuring the Discord variables in `.env` or the shell environment:

```sh
docker compose up --build
```

Compose stores JSON data in the named `app-data` volume mounted at `/app/data`. The image runs as the non-root `node` user and does not publish a port. If you replace the named volume with a bind mount, its host directory must be writable by the container's non-root UID/GID; Docker cannot repair arbitrary bind-mount ownership at startup. Compose requests a 15-second stop grace period so the application can shut down cleanly.

Local builds use `development` and `unknown` metadata fallbacks. Release automation supplies `APP_VERSION` and `APP_COMMIT_SHA` as Docker build arguments; they become OCI labels and runtime environment variables. The template does not derive metadata from Git or publish images.

## Release activation and recovery

The initializer creates the application identity marker but does not enable releases. Keep `RELEASE_ENABLED` unset until release setup is complete; validation still runs while release activation remains disabled.

Release automation is intended only for an initialized implementing repository. It requires the valid `.release/initialization.json` marker and the repository variable `RELEASE_ENABLED=true`. The release workflow derives the GHCR image as `ghcr.io/<owner>/<repository>` in lowercase and publishes exact semantic-version tags only; it never publishes `latest`.

If publication is interrupted, use the release workflow's explicit `recovery_version` manual dispatch from `main`. Ordinary semantic-release retries are not recovery. See the [release contract](docs/release-contract.md) for activation, permissions, image metadata, sequencing, and recovery requirements.

## Persistence and operational notes

JSON persistence uses `DATA_DIRECTORY`. Storage keys may contain only ASCII letters, numbers, underscores, and hyphens, and each key maps to one `<key>.json` file. A `JsonStore.update()` callback must not re-enter `read()`, `write()`, or `update()` for the same key.

Keep diagnostic logging limited to identifiers and operational metadata. Do not log tokens, environment objects, Discord payloads, interaction options, message content, or persisted user data.

## Projects Using This

- [discord-sabacc](https://github.com/ofolis/discord-sabacc)
- [discord-mariokart](https://github.com/ofolis/discord-mariokart)

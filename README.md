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
3. In **Installation**, keep **Guild Install** enabled and leave **User Install** disabled. Guild Install adds the bot to a server; User Install adds an app to an individual user's account and is limited to commands rather than adding a bot member to a server.
4. In **Installation**, select **Discord Provided Link** under **Install Link**. In **Default Install Settings** for **Guild Install**, select the `bot` and `applications.commands` scopes. The `bot` scope installs the bot user in the selected server; `applications.commands` enables the app's slash and other application commands (it is included by default with `bot`). When the bot scope reveals **Permissions**, select only what the application needs. The shared channel-message helper may need **View Channel** and **Send Messages**.
5. In **Bot**, reset and save the token. Keep privileged gateway intents disabled; the template requests only the non-privileged `Guilds` intent.
6. Copy the **Default Install Link** generated on the **Installation** page, open it in a browser, choose **Add to server**, select a test server where you can manage the server, and complete the authorization prompt. This installation link adds the bot; it is not a user OAuth login or authentication flow, so this template does not need OAuth redirect URLs or user-token exchanges.

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

### Persistent application logging

The application keeps ordinary console logging available and also writes best-effort JSONL logs when persistent logging is initialized. Development logs are written under `./logs`; production logs are written under `<DATA_DIRECTORY>/logs`.

Records contain a UTC timestamp, severity, message, and optional fields. Daily files are named `application-logs-YYYY-MM-DD.jsonl`, rotate into numbered segments at the 10 MiB default size, and are retained for 7 days in development or 14 days in production.

Persistent logging is best effort; filesystem failures are reported through the console without failing application startup or removing console diagnostics.

Trusted `Log.event()` calls use stable uppercase snake-case identifiers for durable lifecycle and operational records. Callers must use nonsensitive event identifiers and diagnostic fields; tokens, credentials, payloads, message content, and exception details must not be supplied.

Startup failures use the generic classifications `CONFIG_INVALID`, `DISCORD_INITIALIZATION_FAILED`, or `STARTUP_UNEXPECTED`, with only safe operational metadata reported.

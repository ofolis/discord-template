# discord-template

This is my command-oriented Discord bot template. It is a deeply opinionated TypeScript Node.js project that can be run using Node and released using GitHub actions.

Because I am using this template for my own Discord bot projects, it will be updated as those projects mature and are refined.

## Setup

### 1. Create The Discord Bot

1. Open your [Discord developer portal](https://discord.com/developers/applications).
2. Create a new application.
3. In the **General Information** section:
   1. Set **Name** to whatever name you want the bot to have in your server.
   2. Optionally, upload an **App Icon**.
   3. **Save the application ID value for later.**
4. In the **Installation** section:
   1. Ensure that **Guild Install** is the only context method.
   2. Disable the install link.
5. In the **OAuth2** section:
   1. Disable **Public Client**.
6. In the **Bot** section:
   1. Set any desired aesthetic items.
   2. Reset the token and **save the value for later**.
   3. Leave privileged gateway intents disabled; the template does not use them.
7. Back in the **OAuth2** section:
   1. Create a guild install OAuth2 URL with the `bot` and `applications.commands` scopes.
   2. Start with only the minimum bot permissions needed by the application. The template's shared channel-message helper may need **View Channel** and **Send Messages**; review channel overrides as well.
8. Open the generated URL and install the bot in your Discord server.

Gateway intents, OAuth2 scopes, and bot permissions are separate controls. This template only requests the non-privileged `Guilds` gateway intent. OAuth2 scopes control installation capabilities, while bot permissions control what the installed bot can do in a guild. Enable additional intents or permissions only when application code actually requires them; do not enable member, voice, presence, or message-content intents by default.

### 2. Set Up GitHub Actions

1. Create a new repository using this as the template.
2. Enable the actions and reusable workflows trusted by your organization.
3. Keep workflow permissions at the minimum required level. The validation workflow uses a read-only `contents` token and does not require repository secrets.

### 3. Set Up The Application

1. Clone your new repository to your machine.
2. Install the project's version of Node.js.
   1. [Install Node Version Manager.](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)
   2. Run `nvm use`.
3. Run `npm ci` (or `npm install` when intentionally changing dependencies).
4. Make a copy of `.env.example` named `.env`.
5. Modify the `.env` file.
   1. Set `DISCORD_APPLICATION_ID` to the value noted earlier.
   2. Set `DISCORD_BOT_TOKEN` to the value noted earlier.
   3. Leave `DEV_MODE=false` unless verbose development logging is desired.
   4. Optionally set `DATA_DIRECTORY` to the application data directory. It defaults to `./data` relative to the process working directory and is resolved to an absolute path at startup.
   5. Treat `.env` and the Discord token as sensitive. Keep local environment files out of Git, never paste tokens into issues or logs, and rotate a token immediately if it is exposed.
6. Set up VSCode (if applicable).
   1. Install required plugins:
      - **ESLint**
      - **Prettier**
   2. Install optional plugins:
      - **commitlint**
      - **Markdown All in One**
      - **npm Intellisense**
      - **Sort JSON objects**

## Usage

1. Run `npm run dev`.
2. The bot will now run and refresh as you make code changes.
3. Make code updates and commit your changes using [the Conventional Commits format](https://www.conventionalcommits.org/en/v1.0.0/).

### Docker

Build and run the template locally with Docker Compose after setting the Discord configuration in an untracked `.env` file or the shell environment:

```sh
docker compose up --build
```

The Compose example stores JSON data in the named `app-data` volume mounted at `/app/data`. The container runs as the official Node `node` user and does not publish a port. A bind mount may be used instead, but its host directory must be writable by the container's non-root UID/GID; Docker cannot repair arbitrary bind-mount ownership at startup.

Release automation can supply `APP_VERSION` and `APP_COMMIT_SHA` as Docker build arguments. They become OCI image labels and runtime environment variables. Local builds use `development` and `unknown` fallbacks. The template does not derive metadata from Git or publish images.

> [!NOTE]
> Any commits on `main` that you push to GitHub will trigger the validation action. Pull requests are validated with the same checks.

## Security and dependency maintenance

- Keep `DISCORD_BOT_TOKEN` and other credentials only in local `.env` files or the deployment environment. `.env.example` contains names and placeholders only and is safe to track.
- JSON persistence uses the configured `DATA_DIRECTORY`; storage keys may contain only ASCII letters, numbers, underscores, and hyphens, and each key maps to one `<key>.json` file.
- A `JsonStore.update()` callback must not call `read()`, `write()`, or `update()` for the same key; same-key reentry is rejected, while cross-key operations remain allowed. Generic TypeScript return types do not validate stored domain schemas; domain consumers perform that validation.
- Keep diagnostic logging limited to identifiers and operational metadata. Do not log tokens, environment objects, Discord payloads, interaction options, message content, or persisted user data.
- The CI workflow reports separate production and all-dependency `npm audit` results without failing solely on an existing advisory. Review high and critical production findings promptly, confirm whether vulnerable code is reachable, and update dependencies deliberately with the lockfile and tests.
- Additional OAuth2 scopes, bot permissions, or gateway intents should be enabled only when an application feature requires them.

## Projects Using This

- [discord-sabacc](https://github.com/ofolis/discord-sabacc)
- [discord-mariokart](https://github.com/ofolis/discord-mariokart)

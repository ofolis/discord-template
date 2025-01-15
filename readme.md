# discord-template

This is my command-oriented Discord bot template. It is a deeply opinionated TypeScript Node.js project that can be run using Node or built into a binary distribution (bundled and released using GitHub actions).

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
   3. Enable privileged gateway intents:
      - **Presence Intent**
      - **Server Memebers Intent**
      - **Message Content Intent**
7. Back in the **OAuth2** section:
   1. Create a guild install OAuth2 URL with only the `bot` scope.
8. Open the generated URL and install the bot in your Discord server.

### 2. Set Up GitHub

1. Create a new repository using this as the template.
2. In your GitHub account settings, open **Developer settings**.
3. Under **Personal access tokens** generate a new "fine-grained token".
   1. Give it access to your new repository.
   2. Give it the following repository permissions:
      - **Actions:** Read and write
      - **Contents:** Read and write
      - **Issues:** Read and write
      - **Metadata:** Read-only (set by default)
      - **Pull requests:** Read and write
4. In your new repository's settings, open **General** under **Actions**.
5. Ensure **Allow all actions and reusable workflows** is selected.
6. Select **Read and write permissions** under **Workflow permissions**.
7. After saving, open **Actions** under **Secrets and variables**.
8. Create a new repository secret named `CI_ACCESS_TOKEN` using your generated token as the value.

### 3. Set Up The Application

1. Clone your new repository to your machine.
2. Install the project's version of Node.js.
   1. [Install Node Version Manager.](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)
   2. Run `nvm use`.
3. Run `npm install`.
4. Make a copy of `.env.example` named `.env`.
5. Modify the `.env` file.
   1. Replace the `?` after `DISCORD_APPLICATION_ID=` with the value noted earlier.
   2. Replace the `?` after `DISCORD_BOT_TOKEN=` with the value noted earlier.
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

> [!NOTE]
> Any commits on `main` that you push to GitHub will trigger the build action. That CI process evaluates any new commits and creates a new release [if the type of change requires it](https://github.com/semantic-release/semantic-release?tab=readme-ov-file#commit-message-format).

## Projects Using This

- [discord-sabacc](https://github.com/ofolis/discord-sabacc)
- [discord-mariokart](https://github.com/ofolis/discord-mariokart)

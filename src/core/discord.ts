import {
  ActionRowBuilder,
  ActionRowData,
  APIActionRowComponent,
  APIMessageActionRowComponent,
  ButtonBuilder,
  ButtonInteraction,
  Channel,
  ChannelType,
  Client,
  CollectorFilter,
  CommandInteraction,
  ComponentType,
  InteractionResponse,
  JSONEncodable,
  Message,
  MessageActionRowComponentBuilder,
  MessageActionRowComponentData,
  MessageComponentInteraction,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { Environment, Log } from ".";
import { Command } from "../core";

export {
  ButtonBuilder as DiscordButtonBuilder,
  ButtonInteraction as DiscordButtonInteraction,
  ButtonStyle as DiscordButtonStyle,
  CommandInteraction as DiscordCommandInteraction,
  InteractionResponse as DiscordInteractionResponse,
  Message as DiscordMessage,
  MessageComponentInteraction as DiscordMessageComponentInteraction,
  User as DiscordUser,
} from "discord.js";

export class Discord {
  private static _client: Client | null = null;

  public static get client(): Client {
    if (this._client === null) {
      Log.debug("Creating Discord client...");
      this._client = new Client({
        intents: ["DirectMessages", "Guilds", "GuildMessages"],
      });
      Log.debug("Discord client created successfully.", {
        client: this._client,
      });
    }
    return this._client;
  }

  private static buttonMapToActionRow(
    buttonMap: Record<string, ButtonBuilder>,
  ): ActionRowBuilder<ButtonBuilder> {
    if (Object.keys(buttonMap).length === 0) {
      Log.throw(
        "Cannot create Discord action row. Button map contained no entries.",
      );
    }
    const buttonRow: ActionRowBuilder<ButtonBuilder> =
      new ActionRowBuilder<ButtonBuilder>();
    Object.entries(buttonMap).forEach(([customId, button]) => {
      button.setCustomId(customId);
      buttonRow.addComponents(button);
    });
    return buttonRow;
  }

  private static createComponentsValue(
    buttonMap?: Record<string, ButtonBuilder>,
  ):
    | (
        | JSONEncodable<APIActionRowComponent<APIMessageActionRowComponent>>
        | ActionRowData<
            MessageActionRowComponentData | MessageActionRowComponentBuilder
          >
        | APIActionRowComponent<APIMessageActionRowComponent>
      )[]
    | undefined {
    if (buttonMap === undefined) {
      return undefined;
    }
    return Object.keys(buttonMap).length > 0
      ? [this.buttonMapToActionRow(buttonMap)]
      : [];
  }

  private static async deployGlobalCommands(
    rest: REST,
    commandMap: Record<
      string,
      {
        builder: SlashCommandBuilder;
        command: Command;
      }
    >,
  ): Promise<void> {
    Log.debug("Deploying Discord global commands...", { commandMap });
    const commandBuilders: SlashCommandBuilder[] = Object.values(commandMap)
      .filter((value) => value.command.isGlobal)
      .map((value) => value.builder);
    await rest.put(
      Routes.applicationCommands(Environment.config.discordApplicationId),
      {
        body: commandBuilders,
      },
    );
    Log.debug("Discord global commands deployed successfully.");
  }

  private static async deployGuildCommands(
    rest: REST,
    commandMap: Record<
      string,
      {
        builder: SlashCommandBuilder;
        command: Command;
      }
    >,
    guildIds: string[],
  ): Promise<void> {
    Log.debug("Deploying Discord guild commands...", { commandMap, guildIds });
    const commandBuilders: SlashCommandBuilder[] = Object.values(commandMap)
      .filter((value) => value.command.isGuild)
      .map((value) => value.builder);
    await Promise.all(
      guildIds.map((guildId) =>
        rest.put(
          Routes.applicationGuildCommands(
            Environment.config.discordApplicationId,
            guildId,
          ),
          {
            body: commandBuilders,
          },
        ),
      ),
    );
    Log.debug("Discord guild commands deployed successfully.");
  }

  private static getChannel(channelId: string): TextChannel {
    Log.debug("Retrieving Discord channel...", { channelId });
    const channel: Channel | undefined =
      this.client.channels.cache.get(channelId);
    if (channel === undefined) {
      Log.throw(
        "Cannot get Discord channel. ID was not found in the channel cache.",
        channelId,
      );
    }
    if (channel.type !== ChannelType.GuildText) {
      Log.throw(
        "Cannot get Discord channel. Channel at ID was not a guild text channel.",
        channel,
      );
    }
    Log.debug("Discord channel retrieved successfully.", channel);
    return channel;
  }

  public static async deleteSentItem(
    sentItem: Message | InteractionResponse,
  ): Promise<void> {
    Log.debug("Deleting Discord sent item...", { sentItem });
    await sentItem.delete();
    Log.debug("Discord sent item deleted successfully.");
  }

  public static async deployCommands(
    commandList: Command[],
    guildIds?: string[],
  ): Promise<void> {
    Log.debug("Deploying Discord commands...", { commandList, guildIds });
    const rest: REST = new REST({
      version: "10",
    }).setToken(Environment.config.discordBotToken);
    const commandMap: Record<
      string,
      {
        builder: SlashCommandBuilder;
        command: Command;
      }
    > = {};
    commandList.forEach((command) => {
      if (command.name in commandMap) {
        Log.throw(
          "Cannot deploy commands. Command names are not unique.",
          commandMap,
        );
      }
      commandMap[command.name] = {
        builder: new SlashCommandBuilder()
          .setName(command.name)
          .setDescription(command.description),
        command,
      };
    });
    guildIds = guildIds ?? Array.from(this.client.guilds.cache.keys());
    await this.deployGlobalCommands(rest, commandMap);
    await this.deployGuildCommands(rest, commandMap, guildIds);
    Log.debug("Discord commands deployed successfully.");
  }

  public static async getButtonInteraction(
    context: InteractionResponse | Message,
    filter: CollectorFilter<[MessageComponentInteraction]> | null = null,
    timeout = 60000,
  ): Promise<ButtonInteraction | null> {
    Log.debug("Retrieving Discord button interaction...", {
      context,
      filter,
      timeout,
    });
    try {
      const buttonInteraction: ButtonInteraction =
        await context.awaitMessageComponent<ComponentType.Button>({
          componentType: ComponentType.Button,
          filter: filter ?? undefined,
          time: timeout,
        });
      Log.debug(
        "Discord button interaction retrieved successfully.",
        buttonInteraction,
      );
      return buttonInteraction;
    } catch (result: unknown) {
      if (result instanceof Error && result.message.endsWith("reason: time")) {
        return null;
      }
      throw result;
    }
  }

  public static async sendInteractionResponse(
    interaction: CommandInteraction | MessageComponentInteraction,
    content: string,
    isPrivate = false,
    buttonMap?: Record<string, ButtonBuilder>,
  ): Promise<InteractionResponse> {
    Log.debug("Sending Discord interaction response...", {
      interaction,
      content,
      isPrivate,
      buttonMap,
    });
    const interactionResponse: InteractionResponse = await interaction.reply({
      components: this.createComponentsValue(buttonMap),
      content,
      ephemeral: isPrivate,
    });
    Log.debug(
      "Discord interaction response sent successfully.",
      interactionResponse,
    );
    return interactionResponse;
  }

  public static async sendMessage(
    channelId: string,
    content: string,
    buttonMap?: Record<string, ButtonBuilder>,
    attachments?: {
      attachment: string;
      name: string;
    }[],
  ): Promise<Message> {
    Log.debug("Sending Discord message...", {
      channelId,
      content,
      buttonMap,
      attachments,
    });
    const channel: TextChannel = this.getChannel(channelId);
    const message: Message = await channel.send({
      components: this.createComponentsValue(buttonMap),
      content,
      files: attachments,
    });
    Log.debug("Discord message sent successfully.", message);
    return message;
  }

  public static async sendPersistentInteractionResponse(
    interaction: CommandInteraction | MessageComponentInteraction,
    content: string,
    isPrivate = false,
    buttonMap?: Record<string, ButtonBuilder>,
  ): Promise<InteractionResponse> {
    Log.debug("Sending Discord persistent interaction response...");
    let interactionResponse: InteractionResponse;
    if (interaction instanceof MessageComponentInteraction) {
      Log.debug(
        "Handling persistent interaction response as a MessageComponentInteraction.",
      );
      interactionResponse = await this.updateInteractionSourceItem(
        interaction,
        content,
        buttonMap,
      );
    } else {
      Log.debug(
        "Handling persistent interaction response as a CommandInteraction.",
      );
      interactionResponse = await this.sendInteractionResponse(
        interaction,
        content,
        isPrivate,
        buttonMap,
      );
    }
    Log.debug("Discord persistent interaction response sent successfully.");
    return interactionResponse;
  }

  public static async updateInteractionSourceItem(
    interaction: MessageComponentInteraction,
    content: string,
    buttonMap?: Record<string, ButtonBuilder>,
  ): Promise<InteractionResponse> {
    Log.debug("Updating Discord interaction source item...", {
      interaction,
      content,
      buttonMap,
    });
    const interactionResponse: InteractionResponse = await interaction.update({
      components: this.createComponentsValue(buttonMap),
      content,
    });
    Log.debug(
      "Discord interaction source item updated successfully.",
      interactionResponse,
    );
    return interactionResponse;
  }

  public static async updateSentItem(
    sentItem: Message | InteractionResponse,
    content: string,
    buttonMap?: Record<string, ButtonBuilder>,
  ): Promise<void> {
    Log.debug("Updating Discord sent item...", {
      sentItem,
      content,
      buttonMap,
    });
    const message: Message = await sentItem.edit({
      components: this.createComponentsValue(buttonMap),
      content,
    });
    Log.debug("Discord sent item updated successfully.", message);
  }
}

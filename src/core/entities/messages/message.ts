import * as discordJs from "discord.js";
import { Log } from "../..";
import { sanitizeBaseMessageOptions } from "../../message-options";

export abstract class Message {
  protected _buttonInteractionFilter:
    | discordJs.CollectorFilter<
        [
          discordJs.ButtonInteraction,
          discordJs.Collection<string, discordJs.ButtonInteraction>,
        ]
      >
    | undefined;

  protected _currentEntity:
    | discordJs.CommandInteraction
    | discordJs.InteractionResponse
    | discordJs.Message
    | discordJs.MessageComponentInteraction;

  private __interactionResponseFinalizationAttempted: boolean = false;

  private __interactionResponseFinalized: boolean = false;

  public constructor(
    currentEntity: discordJs.Message | discordJs.InteractionResponse,
  ) {
    this._currentEntity = currentEntity;
    Log.debug("Message constructed.");
  }

  public get canFinalizeInteractionResponse(): boolean {
    return (
      this._currentEntity instanceof discordJs.InteractionResponse &&
      !this.__interactionResponseFinalizationAttempted &&
      !this.__interactionResponseFinalized
    );
  }

  public async awaitButtonInteraction(
    timeout: number = 60000,
  ): Promise<discordJs.ButtonInteraction | null> {
    if (
      !(this._currentEntity instanceof discordJs.InteractionResponse) &&
      !(this._currentEntity instanceof discordJs.Message)
    ) {
      Log.throw(
        "Cannot await button interaction. Current entity is not an interaction response or message.",
      );
    }
    Log.debug("Awaiting Discord button interaction...", { timeout });
    try {
      const buttonInteraction: discordJs.ButtonInteraction =
        await this._currentEntity.awaitMessageComponent<discordJs.ComponentType.Button>(
          {
            componentType: discordJs.ComponentType.Button,
            filter: this._buttonInteractionFilter,
            time: timeout,
          },
        );
      Log.debug("Discord button interaction retrieved successfully.");
      this._currentEntity = buttonInteraction;
      return buttonInteraction;
    } catch (result: unknown) {
      // This method is the best way I found to determine when we time out versus an actual error
      if (result instanceof Error && result.message.endsWith("reason: time")) {
        return null;
      }
      throw result;
    }
  }

  public async update(options: discordJs.BaseMessageOptions): Promise<void> {
    const safeOptions: discordJs.BaseMessageOptions =
      sanitizeBaseMessageOptions(options);
    Log.debug("Updating Discord message...");
    if (
      this._currentEntity instanceof discordJs.InteractionResponse ||
      this._currentEntity instanceof discordJs.Message
    ) {
      if (this._currentEntity instanceof discordJs.InteractionResponse) {
        this.__interactionResponseFinalizationAttempted = true;
      }
      await this._currentEntity.edit(safeOptions);
      if (this._currentEntity instanceof discordJs.InteractionResponse) {
        this.__interactionResponseFinalized = true;
      }
    } else if (
      this._currentEntity instanceof discordJs.MessageComponentInteraction
    ) {
      this._currentEntity = await this._currentEntity.update(safeOptions);
    } else {
      Log.throw(
        "Cannot update message. Current entity is not an interaction response, message, or message component interaction.",
      );
    }
    Log.debug("Discord message updated successfully.");
  }
}

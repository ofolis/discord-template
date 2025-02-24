import * as discordJs from "discord.js";
import { Log } from "../..";

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

  public constructor(
    currentEntity: discordJs.Message | discordJs.InteractionResponse,
  ) {
    this._currentEntity = currentEntity;
    Log.debug("Message constructed.");
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
        { currentEntity: this._currentEntity },
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
      Log.debug("Discord button interaction retrieved successfully.", {
        buttonInteraction,
      });
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
    Log.debug("Updating Discord message...", { options });
    if (
      this._currentEntity instanceof discordJs.InteractionResponse ||
      this._currentEntity instanceof discordJs.Message
    ) {
      await this._currentEntity.edit(options);
    } else if (
      this._currentEntity instanceof discordJs.MessageComponentInteraction
    ) {
      this._currentEntity = await this._currentEntity.update(options);
    } else {
      Log.throw(
        "Cannot update message. Current entity is not an interaction response, message, or message component interaction.",
        { currentEntity: this._currentEntity },
      );
    }
    Log.debug("Discord message updated successfully.");
  }
}

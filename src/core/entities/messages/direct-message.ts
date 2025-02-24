import * as discordJs from "discord.js";
import { Message } from ".";
import { Log } from "../..";

export class DirectMessage extends Message {
  private __user: discordJs.User;

  public constructor(
    currentEntity: discordJs.Message | discordJs.InteractionResponse,
    user: discordJs.User,
  ) {
    super(currentEntity);
    this.__user = user;
    this._buttonInteractionFilter = (i): boolean =>
      i.user.id === this.__user.id;
    Log.debug("Direct message context added.");
  }

  public get user(): discordJs.User {
    return this.__user;
  }
}

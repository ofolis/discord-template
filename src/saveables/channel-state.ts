import * as discordJs from "discord.js";
import { UserState } from ".";
import { ChannelCommandMessage, Json, Log, Saveable, Utils } from "../core";
import { ChannelStateJson, UserStateJson } from "../types";

export class ChannelState implements Saveable {
  public readonly channelId: string;

  private __userStates: Record<string, UserState> = {};

  public constructor(messageOrJson: ChannelCommandMessage | Json) {
    if (messageOrJson instanceof ChannelCommandMessage) {
      const message: ChannelCommandMessage = messageOrJson;
      this.channelId = message.channelId;
      // Create initial user state
      this.__createUserState(message.user);
    } else {
      const json: Json = messageOrJson;
      this.__userStates = Object.fromEntries(
        Object.entries(
          Utils.getJsonEntry(json, "userStates") as Record<
            string,
            UserStateJson
          >,
        ).map(([userStateId, userStateJson]) => [
          userStateId,
          new UserState(userStateJson),
        ]),
      );
      this.channelId = Utils.getJsonEntry(json, "channelId") as string;
    }
  }

  public getUserNickname(userId: string): string | null {
    Log.debug("Getting user nickname.", { userId });
    if (!(userId in this.__userStates)) {
      return null;
    }
    return this.__userStates[userId].nickname;
  }

  public setUserNickname(userId: string, nickname: string | null): void {
    Log.debug("Setting user nickname.", { userId, nickname });
    if (userId in this.__userStates) {
      this.__userStates[userId].nickname = nickname;
    }
  }

  public toJson(): ChannelStateJson {
    return {
      channelId: this.channelId,
      userStates: Object.fromEntries(
        Object.entries(this.__userStates).map(([userStateId, userState]) => [
          userStateId,
          userState.toJson(),
        ]),
      ),
    };
  }

  private __createUserState(userOrPlayer: discordJs.User): void {
    this.__userStates[userOrPlayer.id] = new UserState(userOrPlayer);
  }
}

import { UserState } from ".";
import {
  ChannelCommandMessage,
  InvalidDomainStateError,
  Json,
  Log,
  Saveable,
} from "../core";
import { ChannelStateJson } from "../types";

export class ChannelState implements Saveable {
  public readonly channelId: string;

  private __userStates: Record<string, UserState> = {};

  private constructor(
    channelId: string,
    userStates: Record<string, UserState>,
  ) {
    this.channelId = channelId;
    this.__userStates = userStates;
  }

  public static fromJson(json: Json): ChannelState {
    if (!ChannelState.__isRecord(json)) {
      throw new InvalidDomainStateError();
    }
    const channelId: unknown = json.channelId;
    const userStates: unknown = json.userStates;
    if (
      typeof channelId !== "string" ||
      channelId.length === 0 ||
      !ChannelState.__isRecord(userStates)
    ) {
      throw new InvalidDomainStateError();
    }
    const userStateById: Record<string, UserState> = {};
    Object.entries(userStates).forEach(([userStateId, userStateJson]) => {
      if (!ChannelState.__isRecord(userStateJson)) {
        throw new InvalidDomainStateError();
      }
      const id: unknown = userStateJson.id;
      const nickname: unknown = userStateJson.nickname;
      if (
        userStateId !== id ||
        typeof id !== "string" ||
        id.length === 0 ||
        (nickname !== null && typeof nickname !== "string")
      ) {
        throw new InvalidDomainStateError();
      }
      userStateById[userStateId] = new UserState({
        id,
        nickname,
      });
    });
    return new ChannelState(channelId, userStateById);
  }

  public static fromMessage(message: ChannelCommandMessage): ChannelState {
    const userStates: Record<string, UserState> = {};
    userStates[message.user.id] = new UserState(message.user);
    return new ChannelState(message.channelId, userStates);
  }

  private static __isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  public getUserNickname(userId: string): string | null {
    Log.debug("Getting user nickname.", { userId });
    if (!(userId in this.__userStates)) {
      return null;
    }
    return this.__userStates[userId].nickname;
  }

  public setUserNickname(userId: string, nickname: string | null): void {
    Log.debug("Setting user nickname.", { userId });
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
}

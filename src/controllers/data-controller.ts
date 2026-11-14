import type { ChannelCommandMessage } from "../core";
import { InvalidDomainStateError, JsonStore, Log } from "../core";
import { ChannelState } from "../saveables";
import type { ChannelStateJson } from "../types";

export class DataController {
  public constructor(private readonly __store: JsonStore) {}

  public async updateChannelState(
    message: ChannelCommandMessage,
    afterPersistence: () => Promise<void>,
  ): Promise<void> {
    Log.debug("Updating channel state.");
    await this.__store.update<ChannelStateJson>(
      message.channelId,
      channelStateJson => {
        const channelState: ChannelState =
          channelStateJson === null
            ? ChannelState.fromMessage(message)
            : ChannelState.fromJson(channelStateJson);
        if (channelState.channelId !== message.channelId) {
          throw new InvalidDomainStateError();
        }
        channelState.setUserNickname(message.user.id, message.member.nickname);
        return channelState.toJson();
      },
    );
    await afterPersistence();
  }
}

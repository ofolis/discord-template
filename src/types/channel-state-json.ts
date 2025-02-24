import { UserStateJson } from ".";

export type ChannelStateJson = {
  readonly channelId: string;
  readonly userStates: Record<string, UserStateJson>;
};

import { IO, Json, Log } from "../core";
import { ChannelState } from "../saveables";

export class DataController {
  public static loadChannelState(channelId: string): ChannelState | null {
    Log.debug("Loading channel state.");
    const channelStateJson: Json | null = IO.loadData(channelId);
    if (channelStateJson === null) {
      return null;
    }
    return new ChannelState(channelStateJson);
  }

  public static saveChannelState(channelState: ChannelState): void {
    Log.debug("Saving channel state.");
    IO.saveData(channelState.channelId, channelState.toJson());
  }
}

import { ICONS, PONG_RESPONSE } from "../constants";
import { DataController } from "../controllers";
import { ChannelCommandMessage, Command, CommandOption } from "../core";
import { IconName } from "../enums";
import { ChannelState } from "../saveables";

export class Ping implements Command {
  public readonly description: string = `Responds with "${PONG_RESPONSE}".`;

  public readonly isGlobal: boolean = false;

  public readonly isGuild: boolean = true;

  public readonly isPrivate: boolean = true;

  public readonly name: string = "ping";

  public readonly options: CommandOption[] = [];

  public async execute(message: ChannelCommandMessage): Promise<void> {
    // Load or create channel state
    let channelState: ChannelState | null = DataController.loadChannelState(
      message.channelId,
    );
    if (channelState === null) {
      channelState = new ChannelState(message);
    }
    // Set user nickname (example of using channel state)
    channelState.setUserNickname(message.user.id, message.member.nickname);
    // Execute command
    await message.update({
      content: `${PONG_RESPONSE} ${ICONS[IconName.WAVE]}`,
    });
    // Save channel state
    DataController.saveChannelState(channelState);
  }
}

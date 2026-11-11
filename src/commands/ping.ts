import { ICONS, PONG_RESPONSE } from "../constants";
import { DataController } from "../controllers";
import {
  ChannelCommandMessage,
  Command,
  CommandOption,
  CommandRegistrationType,
} from "../core";
import { IconName } from "../enums";

export class Ping implements Command {
  public readonly description: string = `Responds with "${PONG_RESPONSE}".`;

  public readonly isPrivate: boolean = true;

  public readonly name: string = "ping";

  public readonly options: CommandOption[] = [];

  public readonly registrationType: CommandRegistrationType =
    CommandRegistrationType.GUILD;

  public constructor(private readonly __dataController: DataController) {}

  public async execute(message: ChannelCommandMessage): Promise<void> {
    await this.__dataController.updateChannelState(message, async () => {
      await message.update({
        content: `${PONG_RESPONSE} ${ICONS[IconName.WAVE]}`,
      });
    });
  }
}

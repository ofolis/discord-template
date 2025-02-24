import { CommandOptionType } from "..";

export type CommandOption =
  | {
      readonly description: string;
      readonly isRequired: boolean;
      readonly name: string;
      readonly type: CommandOptionType.BOOLEAN;
    }
  | {
      readonly description: string;
      readonly isRequired: boolean;
      readonly maxValue: number;
      readonly minValue: number;
      readonly name: string;
      readonly type: CommandOptionType.INTEGER | CommandOptionType.NUMBER;
    }
  | {
      readonly description: string;
      readonly isRequired: boolean;
      readonly maxLength: number;
      readonly minLength: number;
      readonly name: string;
      readonly type: CommandOptionType.STRING;
    };

export type CommandOptionTypeMap = {
  readonly [CommandOptionType.BOOLEAN]: boolean;
  readonly [CommandOptionType.INTEGER]: number;
  readonly [CommandOptionType.NUMBER]: number;
  readonly [CommandOptionType.STRING]: string;
};

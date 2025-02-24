export type Json = {
  [key: string]:
    | boolean
    | boolean[]
    | number
    | number[]
    | string
    | string[]
    | Json
    | Json[]
    | Json[][]
    | null
    | undefined;
};

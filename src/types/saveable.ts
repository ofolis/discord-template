export type Saveable = {
  [key: string]: boolean | boolean[] | number | number[] | string | string[] | Saveable | Saveable[];
};

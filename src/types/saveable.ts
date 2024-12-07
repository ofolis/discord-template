export type Saveable = {
  [key: string]: boolean | number | string | Saveable;
};

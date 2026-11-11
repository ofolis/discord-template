export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | Json | JsonValue[];

export type Json = {
  [key: string]: JsonValue;
};

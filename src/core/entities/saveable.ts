import { Json } from "../types";

export abstract class Saveable {
  abstract toJson(): Json;
}

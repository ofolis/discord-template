import * as fs from "fs";
import { Environment } from "./environment";
import { Log } from "./log";
import { Json } from "./types";

export class IO {
  public static loadData(id: string): Json | null {
    Log.debug("Loading data at ID...", { id });
    const filePath: string = this.__getDataFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const jsonString: string = fs.readFileSync(filePath, "utf8");
    const json: Json = JSON.parse(jsonString) as Json;
    Log.debug("Data loaded successfully.", { id, json });
    return json;
  }

  public static saveData(id: string, json: Json): void {
    Log.debug("Saving data at ID...", { id, json });
    if (!fs.existsSync(Environment.dataPath)) {
      fs.mkdirSync(Environment.dataPath);
    }
    const jsonString: string = JSON.stringify(json);
    fs.writeFileSync(this.__getDataFilePath(id), jsonString, {
      encoding: "utf8",
    });
    Log.debug("Data saved successfully.");
  }

  private static __getDataFilePath(id: string): string {
    return `${Environment.dataPath}/${id}.json`;
  }
}

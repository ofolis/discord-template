import * as fs from "fs";
import { Saveable } from "../types";
import { Environment } from "./environment";
import { Log } from "./log";

export class IO {
  private static getDataFilePath(id: string): string {
    return `${Environment.dataPath}/${id}.json`;
  }

  public static loadData(id: string): Saveable | null {
    Log.debug("Loading data at ID...", { id });
    const filePath: string = this.getDataFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const jsonString: string = fs.readFileSync(filePath, "utf8");
    const saveable: Saveable = JSON.parse(jsonString) as Saveable;
    Log.debug("Data loaded successfully.", { saveable });
    return saveable;
  }

  public static saveData(id: string, data: Saveable): void {
    Log.debug("Saving data at ID...", { id, data });
    if (!fs.existsSync(Environment.dataPath)) {
      fs.mkdirSync(Environment.dataPath);
    }
    const jsonString: string = JSON.stringify(data);
    fs.writeFileSync(this.getDataFilePath(id), jsonString, {
      encoding: "utf8",
    });
    Log.debug("Data saved successfully.");
  }
}

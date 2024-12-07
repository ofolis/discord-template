import * as fs from "fs";
import {
  Constants,
} from "./constants";
import {
  Saveable,
} from "./types";

export class Utils {
  public static loadData<DataType extends Saveable>(id: string): DataType {
    const emptyStringLength: number = 0;
    if (id.length === emptyStringLength) {
      throw new Error("JSON load file ID cannot be blank.");
    }
    const jsonFilePath: string = `${Constants.dataPath}/${id}.json`;
    const jsonString: string = fs.readFileSync(
      jsonFilePath,
      "utf8",
    );
    const data: DataType = JSON.parse(jsonString) as DataType;
    return data;
  }

  public static saveData(id: string, data: Saveable): void {
    const emptyStringLength: number = 0;
    if (id.length === emptyStringLength) {
      throw new Error("JSON save file ID cannot be blank.");
    }
    if (!fs.existsSync(Constants.dataPath)) {
      fs.mkdirSync(Constants.dataPath);
    }
    const jsonString: string = JSON.stringify(data);
    const jsonFilePath: string = `${Constants.dataPath}/${id}.json`;
    fs.writeFileSync(
      jsonFilePath,
      jsonString,
      {
        "encoding": "utf8",
      },
    );
  }
}

import fs from "fs";
import path from "path";
import { app } from "electron";

jest.mock("electron");

describe("каталог данных после переименования приложения", () => {
  it("закрепляет userData в старом каталоге внутри appData", () => {
    const appData = path.join(process.cwd(), "mock-app-data");
    const getPath = jest.mocked(app.getPath);
    getPath.mockReturnValue(appData);

    try {
      const { LEGACY_DATA_DIR_NAME } = require("../dataDir");

      expect(LEGACY_DATA_DIR_NAME).toBe("trademanager-open-source");
      expect(getPath).toHaveBeenCalledWith("appData");
      expect(app.setPath).toHaveBeenCalledTimes(1);
      expect(app.setPath).toHaveBeenCalledWith(
        "userData",
        path.join(appData, "trademanager-open-source")
      );
    } finally {
      getPath.mockImplementation(() => process.cwd());
    }
  });

  it("isDataDirPinned отличает закреплённую папку от любой другой", () => {
    const { isDataDirPinned } = require("../dataDir");
    expect(isDataDirPinned(path.join("/Users/x/Library/Application Support", "trademanager-open-source"))).toBe(true);
    expect(isDataDirPinned(path.join("/Users/x/Library/Application Support", "BHORC SDA"))).toBe(false);
    expect(isDataDirPinned(path.join("C:\\Users\\x\\AppData\\Roaming", "bhorc-sda"))).toBe(false);
  });

  it("areDataPathsPinned ловит хранилища, созданные до закрепления", () => {
    const { areDataPathsPinned } = require("../dataDir");
    const legacy = path.join("/Users/x/Library/Application Support", "trademanager-open-source");
    const renamed = path.join("/Users/x/Library/Application Support", "BHORC SDA");
    expect(areDataPathsPinned(legacy, [path.join(legacy, "config.json")])).toBe(true);
    expect(areDataPathsPinned(legacy, [path.join(renamed, "config.json"), path.join(legacy, "config.json")])).toBe(false);
    expect(areDataPathsPinned(renamed, [])).toBe(false);
  });

  it("application на старте проверяет папку данных и держит один экземпляр", () => {
    const appSource = fs.readFileSync(path.join(__dirname, "..", "components", "application", "application.ts"), "utf8");
    expect(appSource).toMatch(/if \(!areDataPathsPinned\(app\.getPath\("userData"\), getCreatedStorePaths\(\)\)\)/);
    expect(appSource).toMatch(/ensureSingleInstance\(app,/);
  });

  it("импортирует настройку каталога первой, до загрузки application и Store", () => {
    const main = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");

    expect(main).toMatch(/^import ["']\.\/dataDir["'];/);
  });
});

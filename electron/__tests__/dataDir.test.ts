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

  it("импортирует настройку каталога первой, до загрузки application и Store", () => {
    const main = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");

    expect(main).toMatch(/^import ["']\.\/dataDir["'];/);
  });
});

import { app } from "electron";
import path from "path";

export const LEGACY_DATA_DIR_NAME = "trademanager-open-source";

// Закрепляем старый каталог до импорта хранилищ: они создают Store при загрузке модулей.
app.setPath("userData", path.join(app.getPath("appData"), LEGACY_DATA_DIR_NAME));

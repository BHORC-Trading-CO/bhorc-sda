import { app } from "electron";
import path from "path";

export const LEGACY_DATA_DIR_NAME = "trademanager-open-source";

// Закрепляем старый каталог до импорта хранилищ: они создают Store при загрузке модулей.
app.setPath("userData", path.join(app.getPath("appData"), LEGACY_DATA_DIR_NAME));

// Если порядок импортов когда-нибудь сломают (sideEffects, другая точка входа), приложение
// откроется с пустой папкой и начнёт писать туда. Проверяем на старте и лучше не запускаемся.
export function isDataDirPinned(userDataPath: string = app.getPath("userData")): boolean {
    return path.basename(userDataPath) === LEGACY_DATA_DIR_NAME;
}

// Проверка по факту: и текущий userData, и папки всех уже созданных хранилищ.
// Только userData мало: если закрепление сработает поздно, userData уже будет верным,
// а хранилища, созданные при импорте, — смотреть в папку с новым именем.
export function areDataPathsPinned(userDataPath: string, storePaths: string[]): boolean {
    return isDataDirPinned(userDataPath) && storePaths.every((storePath) => isDataDirPinned(path.dirname(storePath)));
}

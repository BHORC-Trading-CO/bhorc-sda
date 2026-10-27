import fs from "fs";
import Store from "electron-store";

// В config.json лежат пароли, maFile и прокси. conf по умолчанию пишет его с правами 0o666,
// то есть файл может прочитать и переписать любой процесс. Все хранилища создаём только тут.
export const CONFIG_FILE_MODE = 0o600;

export default function createStore() {
    return new Store({ configFileMode: CONFIG_FILE_MODE });
}

// conf выставляет права только при записи, поэтому уже существующий config.json
// со старыми правами поправляем один раз на старте. На Windows chmod ничего не делает.
export function restrictConfigFileMode(store: { path: string }) {
    try {
        if (fs.existsSync(store.path)) fs.chmodSync(store.path, CONFIG_FILE_MODE);
    } catch (err) {
        console.log(`Не удалось ограничить права на ${store.path}: ${err}`);
    }
}

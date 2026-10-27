import fs from "fs";
import path from "path";
import Store from "electron-store";

// В config.json лежат пароли, maFile и прокси. conf по умолчанию пишет его с правами 0o666,
// то есть файл может прочитать и переписать любой другой пользователь системы.
// Все хранилища создаём только тут.
export const CONFIG_FILE_MODE = 0o600;
export const PRIVATE_DIR_MODE = 0o700;

export default function createStore() {
    return new Store({ configFileMode: CONFIG_FILE_MODE });
}

function chmodQuietly(target: string, mode: number) {
    try {
        fs.chmodSync(target, mode);
    } catch (err) {
        console.log(`Не удалось ограничить права на ${target}: ${err}`);
    }
}

// conf выставляет права только при записи, а старые версии оставили файлы с секретами
// открытыми, поэтому один раз на старте:
// - config.json -> 0o600;
// - недописанные копии config.json.tmp-* (остаются после краша, внутри те же секреты) удаляем;
// - pending_authenticators/ -> 0o700, файлы в ней -> 0o600.
// На Windows chmod почти ничего не делает, ошибки только логируем.
export function restrictSecretFiles(store: { path: string }) {
    const configPath = store.path;
    const dir = path.dirname(configPath);
    if (fs.existsSync(configPath)) chmodQuietly(configPath, CONFIG_FILE_MODE);
    try {
        const base = path.basename(configPath);
        for (const name of fs.readdirSync(dir)) {
            if (name.startsWith(`${base}.tmp-`)) fs.rmSync(path.join(dir, name), { force: true });
        }
    } catch (err) {
        console.log(`Не удалось убрать временные копии ${configPath}: ${err}`);
    }
    const pending = path.join(dir, "pending_authenticators");
    if (fs.existsSync(pending)) {
        chmodQuietly(pending, PRIVATE_DIR_MODE);
        try {
            for (const name of fs.readdirSync(pending)) chmodQuietly(path.join(pending, name), CONFIG_FILE_MODE);
        } catch (err) {
            console.log(`Не удалось ограничить права в ${pending}: ${err}`);
        }
    }
}

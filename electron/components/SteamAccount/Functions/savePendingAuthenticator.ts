import fs from "fs";
import path from "path";
import { app } from "electron";
import TwoFactorResponseInterface from "../../../interfaces/SteamAccount/TwoFactorResponseInterface";

/**
 * Сохраняет ответ AddAuthenticator на диск СРАЗУ, до запроса кода подтверждения.
 *
 * Зачем: shared_secret, identity_secret и revocation_code Steam отдаёт РОВНО ОДИН РАЗ.
 * Раньше они жили только в памяти процесса и в console.log: если подключение обрывалось
 * на вводе кода (закрыли окно, неверный код, перезапуск приложения), секреты пропадали,
 * а на аккаунте оставался незавершённый аутентификатор, который без revocation_code
 * уже не снять. Файл пишется до того, как у пользователя спросят код, поэтому пережить
 * потерю секретов может только отказ самой файловой системы.
 *
 * Файл НЕ удаляется после успешного подключения: это резервная копия maFile,
 * а не временный артефакт.
 */
export default function savePendingAuthenticator(
    accountName: string,
    rawMaFile: TwoFactorResponseInterface,
    steamID64: string
): string | null {
    try {
        const dir = path.join(app.getPath("userData"), "pending_authenticators");
        fs.mkdirSync(dir, { recursive: true });

        // Имя с меткой времени: повторные попытки не затирают предыдущие секреты.
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = path.join(dir, `${accountName}-${stamp}.json`);

        fs.writeFileSync(
            file,
            JSON.stringify({ accountName, steamID64, savedAt: new Date().toISOString(), response: rawMaFile }, null, 2),
            "utf8"
        );

        return file;
    } catch (err) {
        // Не роняем подключение из-за проблем с диском, но кричим в лог: дальше
        // секреты будут жить только в памяти.
        console.log(`${accountName} - НЕ УДАЛОСЬ сохранить секреты аутентификатора на диск: ${err}`);
        return null;
    }
}

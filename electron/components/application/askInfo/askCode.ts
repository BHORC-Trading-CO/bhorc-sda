import { v4 as uuidv4 } from "uuid";
import application from "../application";
import InfoType from "./InfoType";
import { t } from "../../../i18n";

/**
 * Окно ввода кода (SDA-63). Id запроса свой у каждого окна: раньше окна одного аккаунта делили id,
 * и один код уходил в оба входа. Отмена процесса (signal) закрывает окно. Закрытое окно — ошибка
 * с причиной: askSomething отклоняет её без значения, и обработчик, читавший err.message, падал.
 */
export default function askCode(accountName: string, infoType: InfoType, signal?: AbortSignal): Promise<any> {
    return new Promise((resolve, reject) => {
        const aborted = () => new Error(t(`errors.askAborted.${infoType}`));
        if (signal?.aborted) return reject(aborted());
        const id = uuidv4();
        const close = () => application.windowsManager.askWindows[id]?.close();
        signal?.addEventListener("abort", close);
        application.windowsManager.askSomething(id, accountName, infoType)
            .finally(() => signal?.removeEventListener("abort", close))
            .then(resolve, (err) => reject(err ?? aborted()));
    });
}

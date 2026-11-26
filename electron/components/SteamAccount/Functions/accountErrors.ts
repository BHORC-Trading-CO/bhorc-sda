import { t } from "../../../i18n";

/** Сессия мертва (токен просрочен или отозван): поможет только вход по паролю (SDA-59). */
export class SessionExpiredError extends Error {
    readonly code = "SESSION_EXPIRED";
    constructor(message: string = t("errors.sessionExpired")) {
        super(message);
        this.name = "SessionExpiredError";
    }
}

/**
 * Результат больше не нужен: пока шёл запрос, у аккаунта сменился прокси, его убрали в архив или
 * удалили (SDA-56). Такой результат нельзя ни сохранять, ни показывать как свежий.
 */
export class StaleOperationError extends Error {
    readonly code = "STALE_OPERATION";
    constructor() {
        super(t("errors.staleOperation"));
        this.name = "StaleOperationError";
    }
}

export const isStaleOperation = (err: unknown): boolean =>
    (err as { code?: unknown } | null)?.code === "STALE_OPERATION";

/** Текст ошибки для человека: без префикса «Error:», который String(err) добавляет к каждому. */
export const errorText = (err: unknown): string =>
    err instanceof Error && err.message ? err.message : String(err);

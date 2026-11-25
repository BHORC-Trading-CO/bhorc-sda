/**
 * Запросы подключения Guard (AddAuthenticator, FinalizeAddAuthenticator) Steam мог выполнить, даже если
 * ответ потерян. Такой исход — не «ошибка подключения»: он неизвестен, и об этом говорим прямо (SDA-63).
 */
const UNKNOWN = "GUARD_OUTCOME_UNKNOWN";

export function unknownOutcome(cause: unknown): Error {
    return Object.assign(new Error((cause as Error | undefined)?.message ?? String(cause)), { code: UNKNOWN });
}

export function isUnknownOutcome(err: unknown): boolean {
    return (err as { code?: unknown } | null | undefined)?.code === UNKNOWN;
}

/** Ответ потерян? Нет — только если запрос точно не дошёл до Steam или Steam явно отказал. */
export function isLostResponse(err: any): boolean {
    // Steam ответил кодом результата
    if (typeof err?.eresult === "number") return false;
    // HTTP-отказ; 5xx — не отказ
    if (typeof err?.code === "number") return err.code >= 500;
    if (err?.message === "Not Logged In" || err?.message === "Family View Restricted") return false;
    // Соединение или туннель прокси не построены: запрос не отправлялся
    const notSent = err?.connect === true || err?.syscall === "connect" || err?.syscall === "getaddrinfo"
        || /^tunneling socket could not be established/.test(err?.message ?? "");
    return !notSent;
}

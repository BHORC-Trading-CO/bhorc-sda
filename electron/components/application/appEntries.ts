declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const AUTH_WINDOW_WEBPACK_ENTRY: string;
declare const CONFIRMATIONS_WINDOW_WEBPACK_ENTRY: string;
declare const ASK_FAMILY_PIN_WINDOW_WEBPACK_ENTRY: string;
declare const ERROR_WINDOW_WEBPACK_ENTRY: string;

export function getAppEntries(): string[] {
    // Forge подставляет только настроенные entry; AUTH сейчас отсутствует в конфиге.
    return [
        typeof MAIN_WINDOW_WEBPACK_ENTRY === 'string' ? MAIN_WINDOW_WEBPACK_ENTRY : '',
        typeof AUTH_WINDOW_WEBPACK_ENTRY === 'string' ? AUTH_WINDOW_WEBPACK_ENTRY : '',
        typeof CONFIRMATIONS_WINDOW_WEBPACK_ENTRY === 'string' ? CONFIRMATIONS_WINDOW_WEBPACK_ENTRY : '',
        typeof ASK_FAMILY_PIN_WINDOW_WEBPACK_ENTRY === 'string' ? ASK_FAMILY_PIN_WINDOW_WEBPACK_ENTRY : '',
        typeof ERROR_WINDOW_WEBPACK_ENTRY === 'string' ? ERROR_WINDOW_WEBPACK_ENTRY : '',
    ].filter(Boolean);
}

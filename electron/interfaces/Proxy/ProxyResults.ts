import ProxySetupInterface from "./ProxySetupInterface";

/** Итог проверки прокси. statusCode: прокси работает, но Steam ответил не 200 (например, 429). */
export interface ProxyTestResult {
    ok: boolean;
    statusCode?: number;
    error?: string;
}

/** Ответ на TEST_PROXY и TEST_PROXY_BY_PARAMS: ровно один на запрос. */
export interface ProxyTestReply extends ProxyTestResult {
    requestId: string;
    /** Сохранённый прокси (для TEST_PROXY) */
    id?: string;
    /** Какие данные проверены: к строке с другими данными результат не относится */
    tested?: ProxySetupInterface;
}

/** Ответ на EDIT_PROXY с requestId: error — текст отказа, без него правка сохранена. */
export interface ProxyEditReply {
    requestId: string;
    error?: string;
}

/** Итог импорта списка: числа после сохранения, rejected — строки, которые не добавлены. */
export interface ProxyBulkResult {
    added: number;
    duplicates: number;
    rejected: string[];
}

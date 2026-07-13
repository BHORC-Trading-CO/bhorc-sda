// User-Agent мобильного приложения Steam. Со старыми (Chrome/67 — дефолт steamcommunity)
// или пустыми User-Agent Steam отвечает 429 на запросы мобильных подтверждений.
export const STEAM_MOBILE_USER_AGENT =
    'Mozilla/5.0 (Linux; U; Android 9; en-us; Valve Steam App Version/3) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/44.0.2403.133 Mobile Safari/537.36';

// Accept-Encoding актуального Chrome. Проверено (2026-07): WAF Steam отвечает 429 на
// /mobileconf/* при браузерном UA в паре с устаревшими наборами "gzip, deflate" (его шлёт
// gzip:true у библиотеки request) и "gzip, deflate, br"; полный хромовский набор проходит.
// Фактически Steam сжимает ответ gzip'ом даже при предложенных br/zstd, поэтому
// request (не умеющий brotli/zstd) корректно распаковывает через gzip:true — br и zstd
// в заголовке нужны только для правдоподобного браузерного отпечатка. Если Steam когда-то
// начнёт реально отвечать br/zstd — понадобится клиент с их поддержкой.
export const STEAM_ACCEPT_ENCODING = 'gzip, deflate, br, zstd';

// Готовые headers для request.defaults(...) во всех местах, откуда идут веб-запросы к Steam.
export const STEAM_WEB_HEADERS = { 'Accept-Encoding': STEAM_ACCEPT_ENCODING };

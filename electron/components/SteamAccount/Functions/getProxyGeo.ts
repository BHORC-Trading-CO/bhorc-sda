import request from "request";

export interface ProxyGeo {
  /** IANA-таймзона, напр. "Europe/Kiev" */
  timezone: string | null;
  /** ISO2 код страны, напр. "UA" */
  countryCode: string | null;
}

// country_code -> представительная локаль для --lang / Accept-Language браузера
const COUNTRY_LOCALE: { [cc: string]: string } = {
  UA: "uk-UA", RU: "ru-RU", BY: "ru-BY", KZ: "ru-KZ",
  US: "en-US", GB: "en-GB", CA: "en-CA", AU: "en-AU", IE: "en-IE", NZ: "en-NZ",
  DE: "de-DE", AT: "de-AT", CH: "de-CH", FR: "fr-FR", BE: "fr-BE",
  ES: "es-ES", MX: "es-MX", AR: "es-AR", IT: "it-IT", PT: "pt-PT", BR: "pt-BR",
  PL: "pl-PL", NL: "nl-NL", TR: "tr-TR", RO: "ro-RO", CZ: "cs-CZ",
  SE: "sv-SE", FI: "fi-FI", NO: "nb-NO", DK: "da-DK", GR: "el-GR",
  BG: "bg-BG", HU: "hu-HU", SK: "sk-SK", LT: "lt-LT", LV: "lv-LV", EE: "et-EE",
  JP: "ja-JP", KR: "ko-KR", CN: "zh-CN", TW: "zh-TW", IN: "en-IN",
};

/** Возвращает локаль для страны (по умолчанию en-US). */
export function localeForCountry(countryCode?: string | null): string {
  if (countryCode && COUNTRY_LOCALE[countryCode.toUpperCase()]) {
    return COUNTRY_LOCALE[countryCode.toUpperCase()];
  }
  return "en-US";
}

/** Строит заголовок Accept-Language из локали. */
export function acceptLanguageFor(locale: string): string {
  const lang = locale.split("-")[0];
  return `${locale},${lang};q=0.9,en;q=0.8`;
}

/**
 * Определяет гео прокси (таймзона + страна) ЧЕРЕЗ сам прокси.
 * Используется бесплатный HTTPS-сервис ipwho.is, чтобы запрос шёл зашифрованно.
 * При любой ошибке возвращает null-поля — вызывающий код оставляет системные значения.
 */
export default function getProxyGeo(proxyUrl?: string | null): Promise<ProxyGeo> {
  const req = proxyUrl ? request.defaults({ proxy: proxyUrl, timeout: 8000 }) : request;
  return new Promise((resolve) => {
    req.get(
      { url: "https://ipwho.is/", json: true },
      (err: any, _resp: any, body: any) => {
        try {
          if (err || !body || body.success === false) {
            return resolve({ timezone: null, countryCode: null });
          }
          const timezone =
            body.timezone && body.timezone.id ? body.timezone.id : null;
          const countryCode = body.country_code || null;
          resolve({ timezone, countryCode });
        } catch (e) {
          resolve({ timezone: null, countryCode: null });
        }
      }
    );
  });
}

import ProxySetupInterface from './ProxySetupInterface';

export default interface ProxyInterface extends ProxySetupInterface {
    id: string,
    number: number;
    deleted: boolean;
    /** Кешированная IANA-таймзона по гео прокси (напр. "Europe/Kiev") */
    timezone?: string;
    /** Кешированный ISO2 код страны прокси (напр. "UA") — для локали браузера */
    countryCode?: string;
}
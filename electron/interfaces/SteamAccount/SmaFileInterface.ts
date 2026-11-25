import SteamAccountSetupInterface from './SteamAccountSetupInterface';
import SecondaryInterface from './SecondaryInterface';
import ProxySetupInterface from '../Proxy/ProxySetupInterface';

interface SmaFileInterface extends SteamAccountSetupInterface {
    secondary: SecondaryInterface
    /** Опциональный портативный прокси: при импорте резолвится в локальный (существующий или новый) */
    proxy?: ProxySetupInterface
    /** Прокси аккаунта пропал: маршрута в файле нет, при импорте его выбирают явно (SDA-62) */
    proxyMissing?: boolean
}

export default SmaFileInterface;
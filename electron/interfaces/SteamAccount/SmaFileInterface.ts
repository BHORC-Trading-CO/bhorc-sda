import SteamAccountSetupInterface from './SteamAccountSetupInterface';
import SecondaryInterface from './SecondaryInterface';
import ProxySetupInterface from '../Proxy/ProxySetupInterface';

interface SmaFileInterface extends SteamAccountSetupInterface {
    secondary: SecondaryInterface
    /** Опциональный портативный прокси: при импорте резолвится в локальный (существующий или новый) */
    proxy?: ProxySetupInterface
}

export default SmaFileInterface;
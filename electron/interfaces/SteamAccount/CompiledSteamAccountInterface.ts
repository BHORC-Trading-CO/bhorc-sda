import ProxyInterface from '../Proxy/ProxyInterface';
import GroupInterface from '../Group/GroupInterface';
import SteamAccountInterface from './SteamAccountInterface';
import SmaFileInterface from './SmaFileInterface';

interface CompiledSteamAccountInterface extends SteamAccountInterface {
    proxy: ProxyInterface | null;
    group: GroupInterface | null;
    smaFile: SmaFileInterface;
}

export default CompiledSteamAccountInterface;
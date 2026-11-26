import { ProxyState } from "../Proxy/ProxyState";
import ProxyInterface from '../Proxy/ProxyInterface';
import GroupInterface from '../Group/GroupInterface';
import SteamAccountInterface from './SteamAccountInterface';
import SmaFileInterface from './SmaFileInterface';

interface CompiledSteamAccountInterface extends SteamAccountInterface {
    proxy: ProxyInterface | null;
    proxyState: ProxyState;
    proxyId: string | null;
    group: GroupInterface | null;
    smaFile: SmaFileInterface;
    /** Последний вход не удался (SDA-61); null — вошли или входа ещё не было */
    sessionError?: string | null;
}

export default CompiledSteamAccountInterface;
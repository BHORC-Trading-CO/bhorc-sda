import SmaFileInterface from './SmaFileInterface';
import ChangableSecondaryInterface from './ChangableSecondaryInterface';

// proxy исключаем: это поле — только портативное (для .smaFile), в записи аккаунта
// привязка к прокси хранится отдельно (LinksStorage), а в CompiledSteamAccountInterface
// proxy переопределяется как ProxyInterface | null.
export default interface SteamAccountInterface extends Omit<SmaFileInterface, 'proxy'> {
    id: string;
    number: number;
    deleted: boolean;
    changableSecondary: ChangableSecondaryInterface;
}
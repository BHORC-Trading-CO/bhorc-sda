import Store from 'electron-store';
import SteamAccountInterface from '../../interfaces/SteamAccount/SteamAccountInterface';
import cryptoUserData from './cryptoUserData';
import stripLegacyMarketData from '../Functions/stripLegacyMarketData';

const store = new Store();

class SteamAccountStorage {
    static GetAll() {
        const steamAccounts = store.get('steamAccounts');
        const decryptedSteamAccounts = cryptoUserData.decryptObject(steamAccounts) as { [id: string]: SteamAccountInterface } | undefined;
        if (!decryptedSteamAccounts) return {};
        const migrated: { [id: string]: SteamAccountInterface } = {};
        for (const id of Object.keys(decryptedSteamAccounts)) {
            const account = decryptedSteamAccounts[id];
            migrated[id] = stripLegacyMarketData(account);
            if (migrated[id] !== account) SteamAccountStorage.Save(id, migrated[id]);
        }
        return migrated;
    }
    static GetById(id: string) {
        const steamAccount = store.get(`steamAccounts.${id}`) as SteamAccountInterface;
        const decryptedSteamAccount = cryptoUserData.decryptObject(steamAccount);
        if (!decryptedSteamAccount) throw new Error(`SteamAccount ${id} is not exist`);
        const migrated = stripLegacyMarketData(decryptedSteamAccount);
        if (migrated !== decryptedSteamAccount) SteamAccountStorage.Save(id, migrated);
        return migrated;
    }
    static EditData(id: string, newObject: { [K in keyof SteamAccountInterface]?: SteamAccountInterface[K] }) {
        const steamAccount = SteamAccountStorage.GetById(id);
        if (steamAccount.id != id) throw new Error(`${id} doesnt match with ${steamAccount.id}`);
        SteamAccountStorage.Save(id, { ...steamAccount, ...newObject });
    }
    static Save(id: string, steamAccount: SteamAccountInterface) {
        const encryptedSteamAccount = cryptoUserData.encryptObject(stripLegacyMarketData(steamAccount));
        store.set(`steamAccounts.${id}`, encryptedSteamAccount);
    }
    static Delete(id: string) {
        store.delete(`steamAccounts.${id}`);
    }
}

export default SteamAccountStorage;

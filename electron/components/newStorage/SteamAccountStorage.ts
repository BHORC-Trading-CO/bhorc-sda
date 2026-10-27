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
        let changed = false;
        for (const id of Object.keys(decryptedSteamAccounts)) {
            const account = decryptedSteamAccounts[id];
            migrated[id] = stripLegacyMarketData(account);
            if (migrated[id] !== account) changed = true;
        }
        // Очищенные от TM аккаунты пишем одной записью: Save на каждый аккаунт переписывал
        // весь config.json N раз на старте (1000 аккаунтов ~ 21 с фриза окна). Сбой записи
        // не должен оставить приложение без аккаунтов: данные в памяти уже очищены,
        // а в config запишутся при следующем сохранении.
        if (changed) {
            try {
                const encrypted: { [id: string]: unknown } = {};
                for (const id of Object.keys(migrated)) encrypted[id] = cryptoUserData.encryptObject(migrated[id]);
                store.set('steamAccounts', encrypted);
            } catch (err) {
                console.log(`Не удалось сохранить аккаунты без полей TM: ${err}`);
            }
        }
        return migrated;
    }
    static GetById(id: string) {
        const steamAccount = store.get(`steamAccounts.${id}`) as SteamAccountInterface;
        const decryptedSteamAccount = cryptoUserData.decryptObject(steamAccount);
        if (!decryptedSteamAccount) throw new Error(`SteamAccount ${id} is not exist`);
        const migrated = stripLegacyMarketData(decryptedSteamAccount);
        if (migrated !== decryptedSteamAccount) {
            try {
                SteamAccountStorage.Save(id, migrated);
            } catch (err) {
                console.log(`${id} - не удалось сохранить аккаунт без полей TM: ${err}`);
            }
        }
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

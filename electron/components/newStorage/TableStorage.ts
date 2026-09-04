import Store from 'electron-store';
import TableOptions from '../../interfaces/TableOptions/TableOptions';
import Field from '../../interfaces/TableFields/Field';
import defaultSteamAccountTableFields from '../../interfaces/TableFields/defaults/steamAccountsTableFields';
import defaultProxyTableFields from '../../interfaces/TableFields/defaults/proxiesTableFields';

const defaultTableOptions = {
    pageSize: 10,
    activePage: 1
}

const store = new Store();

console.log(store.path);

type Table = 'steamAccounts' | 'proxies';

class TableStorage {
    static GetFields(type: Table) {
        const defaults = type === 'steamAccounts' ? defaultSteamAccountTableFields
            : type === 'proxies' ? defaultProxyTableFields
            : null;
        if (!defaults) throw new Error(`${type} - fields is undefined`);

        const fields = store.get(`${type}TableFields`) as Field[] | undefined;
        if (!fields) {
            store.set(`${type}TableFields`, defaults);
            return defaults;
        }
        // Бэкфилл новых колонок, добавленных в defaults после того как пользователь
        // уже сохранил свой набор полей (иначе новые колонки, напр. "Группа", не
        // появятся в настройках отображения у существующих пользователей).
        const existingTypes = new Set(fields.map(f => f.type));
        const merged = [...fields, ...defaults.filter(f => !existingTypes.has(f.type))];
        if (merged.length !== fields.length) {
            store.set(`${type}TableFields`, merged);
        }
        return merged;
    }
    static GetOptions(type: Table) {
        const options = store.get(`${type}TableOptions`);
        if (!options) {
            if (type === 'steamAccounts') {
                store.set(`${type}TableOptions`, defaultTableOptions);
                return defaultTableOptions;
            }
            if (type === 'proxies') {
                store.set(`${type}TableOptions`, defaultTableOptions);
                return defaultTableOptions;
            }
            throw new Error(`${type} - fields is undefined`);
        }
        return options as Field[];
    }
    static EditFields(type: Table, fields: Field[]) {
        store.set(`${type}TableFields`, fields);
    }
    static EditOptions(type: Table, options: TableOptions) {
        store.set(`${type}TableOptions`, options);
    }
}

export default TableStorage;
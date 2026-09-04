import Store from 'electron-store';
import LinksInterface from '../../interfaces/Links/LinksInterface';
const store = new Store();

class LinksStorage {
    static Get(): LinksInterface {
        const links = store.get('links') as Partial<LinksInterface> | undefined;
        if (!links) {
            return {
                steamAccounts: {},
                profiles: {},
                groups: {}
            };
        }
        // Бэкфилл для старых записей, сохранённых до появления групп
        if (!links.groups) links.groups = {};
        return links as LinksInterface;
    }
    static Save(links: LinksInterface) {
        store.set('links', links);
    }
}

export default LinksStorage;
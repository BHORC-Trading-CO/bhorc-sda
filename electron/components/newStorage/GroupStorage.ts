import Store from 'electron-store';
import GroupInterface from '../../interfaces/Group/GroupInterface';

const store = new Store();

// Хранилище групп по образцу ProxyStorage: карта { [id]: GroupInterface } под ключом 'groups'.
// Группы не секретны, поэтому cryptoUserData не используем (как и LinksStorage).
class GroupStorage {
    static GetAll() {
        const groups = store.get('groups');
        if (!groups) return {};
        return groups as { [id: string]: GroupInterface };
    }
    static GetById(id: string) {
        const group = store.get(`groups.${id}`) as GroupInterface;
        if (!group) throw new Error(`group ${id} is not exist`);
        return group;
    }
    static EditData(id: string, newObject: { [K in keyof GroupInterface]?: GroupInterface[K] }) {
        const group = GroupStorage.GetById(id);
        if (group.id != id) throw new Error(`${id} doesnt match with ${group.id}`);
        GroupStorage.Save(id, { ...group, ...newObject });
    }
    static Save(id: string, group: GroupInterface) {
        store.set(`groups.${id}`, group);
    }
    static Delete(id: string) {
        store.delete(`groups.${id}`);
    }
}

export default GroupStorage;

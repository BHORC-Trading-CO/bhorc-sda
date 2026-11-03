import createStore from "./createStore";
import assertStorageId from "./assertStorageId";
import GroupInterface from '../../interfaces/Group/GroupInterface';
import { t } from "../../i18n";

const store = createStore();

// Хранилище групп по образцу ProxyStorage: карта { [id]: GroupInterface } под ключом 'groups'.
// Группы не секретны, поэтому cryptoUserData не используем (как и LinksStorage).
class GroupStorage {
    static GetAll() {
        const groups = store.get('groups');
        if (!groups) return {};
        return groups as { [id: string]: GroupInterface };
    }
    static GetById(id: string) {
        assertStorageId(id);
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
        assertStorageId(id);
        assertStorageId(group.id);
        if (group.id !== id) throw new Error(t("errors.storage.idMismatch"));
        store.set(`groups.${id}`, group);
    }
    static Delete(id: string) {
        assertStorageId(id);
        store.delete(`groups.${id}`);
    }
}

export default GroupStorage;

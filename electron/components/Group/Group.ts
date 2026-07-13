import { v4 as uuidv4 } from 'uuid';
import GroupInterface from '../../interfaces/Group/GroupInterface';
import GroupSetupInterface from '../../interfaces/Group/GroupSetupInterface';
import GroupStorage from '../newStorage/GroupStorage';
import groupManager from './groupManager';

class Group {
    params: GroupInterface;

    constructor(group: GroupInterface) {
        this.params = group;
    }

    editParams(newParams: { [K in keyof GroupInterface]?: GroupInterface[K] }) {
        for (var i in this.params) {
            if (typeof (newParams[i]) !== 'undefined') {
                this.params[i] = newParams[i];
            }
        }
        GroupStorage.EditData(this.params.id, newParams);
    }

    static Generate(setup: GroupSetupInterface): GroupInterface {
        // Нумеруем относительно активных групп (удалённые не оставляют "дыр"),
        // как в Proxy.Generate / SteamAccount.Generate.
        const groupsArray = groupManager.objects
            .map(g => g.params)
            .filter(g => !g.deleted);
        groupsArray.sort((a, b) => a.number < b.number ? 1 : -1);

        return {
            id: uuidv4(),
            number: groupsArray.length === 0 ? 1 : groupsArray[0].number + 1,
            name: setup.name,
            deleted: false
        };
    }
}

export default Group;

import GroupInterface from '../../interfaces/Group/GroupInterface';
import CompiledGroupInterface from '../../interfaces/Group/CompiledGroupInterface';
import Group from './Group';
import GroupStorage from '../newStorage/GroupStorage';
import Manager from '../manager/manager';
import application from '../application/application';
import GroupChannels from '../../interfaces/IpcChannels/GroupChannels';

// Синглтон-менеджер групп в памяти (по образцу proxyManager).
export class GroupManager {
    objects: Group[];

    constructor() {
        this.objects = [];
    }

    addNew(group: Group) {
        this.objects = [...this.objects, group];
    }
    delete(id: string) {
        const index = this.objects.findIndex(obj => obj.params.id === id);
        if (index === -1) throw new Error(`#${id} - group is not exist`);
        this.objects.splice(index, 1);
        GroupStorage.Delete(id);
    }
    edit(id: string, newGroupData: { [K in keyof GroupInterface]?: GroupInterface[K] }) {
        const object = this.objects.find(o => o.params.id === id);
        if (!object) throw new Error(`#${id} - group is not exist`);
        object.editParams(newGroupData);
    }
    getById(id: string) {
        const objects = this.objects.filter(g => g.params.id === id);
        return objects.length === 0 ? null : objects[0];
    }
    load() {
        const objects = GroupStorage.GetAll();
        this.objects = [];
        for (var object of Object.values(objects)) {
            this.addNew(new Group(object));
        }
        this.sendGroupsToFront();
    }
    getCompiledObjects(): CompiledGroupInterface[] {
        return this.objects.map(g => GroupManager.CompileObject(g));
    }
    sendGroupsToFront() {
        application.sendToMain(GroupChannels.GET_GROUPS, this.getCompiledObjects());
    }
    static CompileObject(object: Group): CompiledGroupInterface {
        return {
            ...object.params,
            steamAccountIds: Manager.GetGroupSteamAccountIds(object.params.id)
        };
    }
}

export default new GroupManager();

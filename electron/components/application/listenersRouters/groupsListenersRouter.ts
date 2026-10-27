import { onTrusted } from '../trustedIpc';
import Group from '../../Group/Group';
import groupManager from '../../Group/groupManager';
import GroupStorage from '../../newStorage/GroupStorage';
import steamAccountManager from '../../SteamAccount/steamAccountManager';
import Manager from '../../manager/manager';
import GroupChannels from '../../../interfaces/IpcChannels/GroupChannels';
import GroupSetupInterface from '../../../interfaces/Group/GroupSetupInterface';

export default () => {
    onTrusted(GroupChannels.GET_GROUPS, (event) => {
        try {
            event.reply(GroupChannels.GET_GROUPS, groupManager.getCompiledObjects());
        } catch (err) {
            event.reply('ERROR', err);
        }
    });

    // Создать группу и (опционально) сразу привязать к ней выбранные аккаунты.
    onTrusted(GroupChannels.NEW_GROUP, (event, params: { setup: GroupSetupInterface, steamAccountIds?: string[] }) => {
        try {
            const groupData = Group.Generate(params.setup);
            groupManager.addNew(new Group(groupData));
            GroupStorage.Save(groupData.id, groupData);
            for (var steamAccountId of params.steamAccountIds || []) {
                Manager.LinkGroupToSteamAccount(steamAccountId, groupData.id);
            }
            groupManager.sendGroupsToFront();
            steamAccountManager.sendAccountsToFront();
        } catch (err) {
            event.reply('ERROR', err);
        }
    });

    // Привязать выбранные аккаунты к существующей группе (groupId=null — убрать из группы).
    onTrusted(GroupChannels.ASSIGN_GROUP, (event, params: { groupId: string | null, steamAccountIds: string[] }) => {
        try {
            for (var steamAccountId of params.steamAccountIds) {
                Manager.LinkGroupToSteamAccount(steamAccountId, params.groupId);
            }
            groupManager.sendGroupsToFront();
            steamAccountManager.sendAccountsToFront();
        } catch (err) {
            event.reply('ERROR', err);
        }
    });

    // Переименование группы (и прочие правки полей).
    onTrusted(GroupChannels.EDIT_GROUP, (event, params: { id: string, name: string }) => {
        try {
            groupManager.edit(params.id, { name: params.name });
            groupManager.sendGroupsToFront();
            steamAccountManager.sendAccountsToFront();
        } catch (err) {
            event.reply('ERROR', err);
        }
    });

    onTrusted(GroupChannels.DELETE_GROUP, (event, id: string) => {
        try {
            Manager.ResetGroup(id);
            groupManager.delete(id);
            groupManager.sendGroupsToFront();
            steamAccountManager.sendAccountsToFront();
        } catch (err) {
            event.reply('ERROR', err);
        }
    });
};

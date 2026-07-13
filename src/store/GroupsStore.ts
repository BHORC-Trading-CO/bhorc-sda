import { Store } from "./store";
import { makeAutoObservable, toJS } from "mobx";
import CompiledGroupInterface from "../../electron/interfaces/Group/CompiledGroupInterface";

// Стор групп аккаунтов. Держит список групп и активную группу-фильтр
// (activeGroupId=null — показывать все аккаунты).
class GroupsStore {
  root: Store;
  groups: CompiledGroupInterface[];
  activeGroupId: string | null;

  // Стейт popup'а назначения группы (кнопка "В группу" в футере таблицы)
  isAssignFormOpen: boolean;
  // Стейт popup'а редактирования группы (иконка карандаша в навигации)
  editingGroupId: string | null;

  constructor(root: Store) {
    this.root = root;
    this.groups = [];
    this.activeGroupId = null;
    this.isAssignFormOpen = false;
    this.editingGroupId = null;

    makeAutoObservable(this);

    window.Main.groups.get();
    window.Main.groups.onGet((event, groups) => {
      this.groups = groups;
      // Если активная группа была удалена — вернуться ко "всем аккаунтам"
      if (this.activeGroupId && !groups.some((g) => g.id === this.activeGroupId)) {
        this.setActiveGroup(null);
      }
    });
  }

  getGroups() {
    return toJS(this.groups).filter((g) => !g.deleted);
  }
  getActiveGroup() {
    return this.groups.find((g) => g.id === this.activeGroupId) || null;
  }

  setActiveGroup(groupId: string | null) {
    this.activeGroupId = groupId;
    // Сброс на первую страницу, чтобы не остаться на пустой странице после смены фильтра
    this.root.steamAccountsTable.setActivePage(1);
  }

  createGroup(name: string, steamAccountIds: string[] = []) {
    window.Main.groups.create(name, steamAccountIds);
  }
  assignToGroup(groupId: string | null, steamAccountIds: string[]) {
    window.Main.groups.assign(groupId, steamAccountIds);
  }
  renameGroup(id: string, name: string) {
    window.Main.groups.rename(id, name);
  }
  deleteGroup(id: string) {
    window.Main.groups.delete(id);
  }

  openAssignForm() {
    this.isAssignFormOpen = true;
  }
  closeAssignForm() {
    this.isAssignFormOpen = false;
  }
  openEditForm(groupId: string) {
    this.editingGroupId = groupId;
  }
  closeEditForm() {
    this.editingGroupId = null;
  }
}

export default GroupsStore;

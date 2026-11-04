import store, { Store } from "../store";
import { makeAutoObservable, runInAction, toJS } from "mobx";
import AvalibleTypes from "../../../electron/interfaces/TableFields/AvalibleFieldTypes";
import Field from "../../../electron/interfaces/TableFields/Field";
import TableSteamAccountInterface from "../../../electron/interfaces/SteamAccount/TableSteamAccountInterface";
import CompiledSteamAccountInterface from "../../../electron/interfaces/SteamAccount/CompiledSteamAccountInterface";
import SettingsFormStore from "./SettingsFormStore";
import CreationFormStore from "./CreationFormStore";
import EditingFormStore from "./EditingFormStore";
import ChangableSecondaryInterface from "../../../electron/interfaces/SteamAccount/ChangableSecondaryInterface";
import { matchesSteamAccountSearch } from "../../../electron/components/Functions/steamAccountSearch";
import i18n from "../../i18n/i18n";

class SteamAccountsTableStore {
  root: Store;
  fields: Field[];
  initialSteamAccounts: CompiledSteamAccountInterface[];
  steamAccounts: { [id: string]: TableSteamAccountInterface };
  isAllSelected: boolean;
  showDeleted: boolean;
  activeIds: string[]; //массив айдишников аккаунтов, у которых установлены все Listeners

  activePage: number;
  pageSize: number;

  settingsForm: SettingsFormStore;
  creationForm: CreationFormStore;
  editingForm: EditingFormStore;

  changableSecondaries: {
    [id: string]: {
      isLoad: boolean;
      content: ChangableSecondaryInterface;
    };
  };
  browserStatuses: {
    [id: string]: "load" | "working" | "notworking";
  };
  authCodes: { [id: string]: string };
  searchString: string;
  // Только для отображения: по какой колонке сейчас отсортированы строки (стрелка в заголовке)
  sortedField: AvalibleTypes | null;

  constructor(root: Store) {
    this.root = root;
    this.fields = [];
    this.isAllSelected = false;
    this.showDeleted = false;
    this.activeIds = [];
    this.initialSteamAccounts = [];
    this.steamAccounts = {};

    this.authCodes = {};
    this.changableSecondaries = {};
    this.browserStatuses = {};

    this.settingsForm = new SettingsFormStore(this);
    this.creationForm = new CreationFormStore(this);
    this.editingForm = new EditingFormStore(this);

    this.activePage = 1;
    this.pageSize = 10;

    this.searchString = "";
    this.sortedField = null;

    makeAutoObservable(this);

    window.Main.steamAccounts.getTableFields();
    window.Main.steamAccounts.get();
    window.Main.steamAccounts.getTableOptions();

    window.Main.steamAccounts.onGetSecondary((event, data) => {
      runInAction(() => {
        this.steamAccounts[data.id].getSecondaryError = null;
        this.steamAccounts[data.id].isLoadSecondary = false;
        this.steamAccounts[data.id].secondary = data.secondary;
      });
    });
    window.Main.steamAccounts.onGetSecondaryError((event, data) => {
      store.windows.openMiniNotification({
        type: "error",
        text: i18n.t("accounts.errors.loadData", { error: data.err }),
      });
      runInAction(() => {
        this.steamAccounts[data.id].isLoadSecondary = false;
      });
    });
    window.Main.steamAccounts.onGetBrowserStatus((event, data) => {
      console.log("get browser status", data);
      runInAction(() => {
        this.browserStatuses[data.id] = data.status;
      });
    });
    window.Main.steamAccounts.onGetChangableSecondary((event, data) => {
      this.editChanableSecondaries(data.id, data.changableSecondary);
    });
    window.Main.steamAccounts.onGetChangableSecondaryError((event, data) => {
      //this.writeChangableSecondariesError(data.id, String(data.err));
    });
    window.Main.steamAccounts.onGetTableFields((event, fields) => {
      this.setFields(fields);
    });
    window.Main.steamAccounts.onRefreshSession((event, id) => {
      console.log(`steam account #${id} session has been refreshed`);
      runInAction(() => {
        this.steamAccounts[id].isLogining = false;
      });
      this.loadSecondaries(id);
      this.loadChangableSecondaries(id);
    });
    window.Main.steamAccounts.onRefreshSessionError((event, data) => {
      runInAction(() => {
        this.steamAccounts[data.id].isLogining = false;
      });
      this.root.windows.openMiniNotification({
        text: i18n.t("accounts.errors.refreshSession", {
          number: this.steamAccounts[data.id].number,
          error: data.err,
        }),
        type: "error",
      });
    });
    window.Main.steamAccounts.onGet((event, steamAccounts) => {
      runInAction(() => {
        this.initialSteamAccounts = steamAccounts;
      });

      setTimeout(() => {
        for (var i of steamAccounts) {
          this.loadChangableSecondaries(i.id);
        }
      }, 3000);
      this.setSteamAccounts(steamAccounts);
      this.setActivePage(this.activePage);
    });
    window.Main.steamAccounts.onGetTableOptions((event, options) => {
      this.setPageSize(options.pageSize, false);
      this.setActivePage(options.activePage, false);
    });
    window.Main.steamAccounts.onEditProxy((event, { id, proxy, proxyState, proxyId }) => {
      this.editSteamAccount(id, { proxy, proxyState, proxyId });
    });
  }

  search(newSearchString: string) {
    // Фильтр живой (см. getSteamAccountsByPages): раньше тут один раз считался список
    // скрытых id по initialSteamAccounts и только по логину — ник туда не попадал
    // (secondary подгружается позже и в initialSteamAccounts не обновляется).
    this.searchString = newSearchString;
    this.setActivePage(1);
  }
  sortSteamAccounts(
    func: (
      a: TableSteamAccountInterface,
      b: TableSteamAccountInterface
    ) => 1 | -1
  ) {
    const steamAccountsArray = Object.values(toJS(this.steamAccounts));
    steamAccountsArray.sort(func);
    const result: { [id: string]: TableSteamAccountInterface } = {};
    for (var sa of steamAccountsArray) {
      result[sa.id] = sa;
    }
    this.steamAccounts = result;
    this.setActivePage(this.activePage);
  }
  refreshSession(id: string) {
    this.steamAccounts[id].isLogining = true;
    window.Main.steamAccounts.refreshSession(id);
  }
  refreshSessionSelected() {
    const selected = Object.values(this.steamAccounts).filter(
      (sa) => sa.isSelected && !sa.deleted
    );
    for (var sa of selected) {
      this.refreshSession(sa.id);
    }
  }
  loadChangableSecondaries(id: string) {
    if (this.steamAccounts[id].deleted) return;
    const fields = this.getFields();
    const usefulFields = fields.filter(
      (f) => f.type === AvalibleTypes.steamAccountBalance
    );
    if (usefulFields.filter((f) => !f.isVisible).length === 1) {
      return;
    }
    this.changableSecondaries[id].isLoad = false;
    window.Main.steamAccounts.getChangableSecondary(id);
  }
  loadSecondaries(id: string) {
    this.steamAccounts[id].isLoadSecondary = true;
    window.Main.steamAccounts.getSecondary(id);
  }
  editChanableSecondaries(
    id: string,
    chanableSecondaries: ChangableSecondaryInterface
  ) {
    this.changableSecondaries[id].content = chanableSecondaries;
    this.changableSecondaries[id].isLoad = true;
  }
  setSteamAccounts(steamAccounts: CompiledSteamAccountInterface[]) {
    try {
      this.steamAccounts = {};
      // Список пришёл заново в порядке хранилища: прежняя сортировка больше не действует
      this.sortedField = null;
      const tableSteamAccounts: TableSteamAccountInterface[] = [];
      const deletedTableSteamAccounts: TableSteamAccountInterface[] = [];

      for (var steamAccount of steamAccounts) {
        const tableSteamAccount: TableSteamAccountInterface = {
          ...steamAccount,
          isSelected: false,
          authCode: "not loaded",
          getChangableSecondaryError: null,
          getSecondaryError: null,
          isLoadChangableSecondary: false,
          isLoadSecondary: false,
          isLogining: false,
        };
        if (!steamAccount.deleted) {
          tableSteamAccounts.push(tableSteamAccount);
        } else {
          deletedTableSteamAccounts.push(tableSteamAccount);
        }
      }
      for (var i of tableSteamAccounts) {
        this.steamAccounts[i.id] = i;
      }
      for (let sa of tableSteamAccounts) {
        this.changableSecondaries[sa.id] = {
          isLoad: false,
          content: sa.changableSecondary,
        };
      }
      for (var i of deletedTableSteamAccounts) {
        this.steamAccounts[i.id] = i;
      }
      for (let sa of tableSteamAccounts) {
        this.updateAuthCode(sa.id);
        if (this.activeIds.includes(sa.id)) continue;
        this.activeIds.push(sa.id);
      }
      for (let sa of tableSteamAccounts) {
        this.getGuardAuthCodeInterval(sa);
      }
      for (let sa of tableSteamAccounts) {
        window.Main.steamAccounts.getBrowserStatus(sa.id);
      }
    } catch (err) {
      console.log(err);
    }
    /*
        for (let sa of tableSteamAccounts){
            this.loadChangableSecondaries(sa.id);
        }*/
  }
  getGuardAuthCodeInterval(steamAccount: TableSteamAccountInterface) {
    this.updateAuthCode(steamAccount.id);
    const timeToUpdate = 30 - ((Number(new Date()) / 1000) % 30);
    setTimeout(() => {
      setInterval(() => {
        this.updateAuthCode(steamAccount.id);
      }, 30000);
      this.updateAuthCode(steamAccount.id);
    }, Number((timeToUpdate * 1000).toFixed(0)));
  }
  changeFieldDirection(fieldType: AvalibleTypes, direction: "UP" | "DOWN") {
    this.sortedField = fieldType;
    for (var field of this.fields) {
      if (field.type === fieldType) {
        field.sortDirection = direction;
      }
    }
  }
  setFields(fields: Field[]) {
    this.fields = fields;
  }
  saveFields(fields: Field[]) {
    window.Main.steamAccounts.saveTableFields(toJS(fields));
  }
  getCustomizableFields() {
    return toJS(this.fields);
  }
  getFields() {
    return toJS([
      {
        type: AvalibleTypes.checkbox,
        isSortable: false,
        isVisible: true,
        title: "",
        showTtitleInTable: false,
      },
      ...this.fields,
      {
        type: AvalibleTypes.refreshButton,
        isSortable: false,
        isVisible: true,
        title: "",
        showTtitleInTable: false,
      },
      {
        type: AvalibleTypes.exportButton,
        isSortable: false,
        isVisible: true,
        title: "",
        showTtitleInTable: false,
      },
      {
        type: AvalibleTypes.editingButton,
        isSortable: false,
        isVisible: true,
        title: "",
        showTtitleInTable: false,
      },
      {
        type: AvalibleTypes.deleteButton,
        isSortable: false,
        isVisible: true,
        title: "",
        showTtitleInTable: false,
      },
    ]);
  }
  getSteamAccounts() {
    return toJS(this.steamAccounts);
  }
  getSteamAccountsInActualPage() {
    const steamAccountsByPages = this.getSteamAccountsByPages();
    for (var i = this.activePage; i > 0; i--) {
      if (steamAccountsByPages[i] && steamAccountsByPages[i].length > 0) {
        this.setActivePage(i);
        return steamAccountsByPages[i];
      }
    }
    this.setActivePage(0);
    return [];
  }
  getSteamAccountsByPages() {
    const sa: TableSteamAccountInterface[][] = [];
    let count = 0;
    let bufAccounts: TableSteamAccountInterface[] = [];
    const activeGroupId = this.root.groups.activeGroupId;
    for (var i of Object.values(this.getSteamAccounts()).filter(sa => matchesSteamAccountSearch(sa, this.searchString))) {
      if (i.deleted && !this.showDeleted) continue;
      // Фильтр по активной группе (в навигации выбран пункт группы)
      if (activeGroupId && (!i.group || i.group.id !== activeGroupId)) continue;

      if (count === this.pageSize) {
        sa.push(bufAccounts);
        bufAccounts = [];
        count = 0;
      }
      bufAccounts.push(toJS(i));
      count += 1;
    }
    if (bufAccounts.length > 0) {
      sa.push(toJS(bufAccounts));
    }
    return sa;
  }
  changeShowStatus(status?: boolean) {
    if (status) {
      this.showDeleted = status;
    } else {
      this.showDeleted = !this.showDeleted;
    }
  }
  selectSteamAccount(id: string, isSelected: boolean = true) {
    const steamAccount = this.steamAccounts[id];
    if (steamAccount) steamAccount.isSelected = isSelected;
    const steamAccountsInPage =
      this.getSteamAccountsByPages()[this.activePage - 1];
    if (
      steamAccountsInPage.filter((p) => p.isSelected).length ===
      steamAccountsInPage.filter((p) => !p.deleted).length &&
      steamAccountsInPage.filter((p) => !p.deleted).length !== 0
    ) {
      this.isAllSelected = true;
    } else {
      this.isAllSelected = false;
    }
  }
  selectAllSteamAccounts(isSelected: boolean = true) {
    this.isAllSelected = isSelected;
    const steamAccountsInPage =
      this.getSteamAccountsByPages()[this.activePage - 1];
    for (var steamAccount of steamAccountsInPage) {
      if (steamAccount.deleted) continue;
      this.editSteamAccount(steamAccount.id, { isSelected: isSelected });
    }
  }
  updateAuthCode(id: string) {
    const time1 = Number(new Date());
    for (var i in this.steamAccounts) {
      if (this.steamAccounts[i].id === id) {
        const code = String(
          window.Main.guardConnection.getAuthCode(
            this.steamAccounts[i].maFile.shared_secret
          )
        );
        //this.steamAccounts[i].authCode = code;
        this.authCodes[id] = code;
        const time2 = Number(new Date());
        return;
      }
    }
  }
  editSteamAccount(
    id: string,
    newSteamAccount: {
      [K in keyof TableSteamAccountInterface]?: TableSteamAccountInterface[K];
    }
  ) {
    for (var i in this.steamAccounts) {
      if (this.steamAccounts[i].id === id) {
        this.steamAccounts[i] = {
          ...this.steamAccounts[i],
          ...newSteamAccount,
        };
        return this.steamAccounts[i];
      }
    }
    throw new Error(i18n.t("accounts.errors.editNotFound", { id }));
  }
  setActivePage(n: number, save: boolean = false) {
    try {
      for (var i = n; i >= 1; i--) {
        const steamAccountsInThisPage = this.getSteamAccountsByPages()[i - 1];
        if (steamAccountsInThisPage) {
          n = i;
          break;
        }
      }
      // Страницы по старому activePage может уже не быть (напр. фильтр по группе
      // сократил число страниц) — иначе for-of по undefined кидает и activePage
      // не обновляется, а таблица показывает несуществующую пустую страницу.
      const steamAccountsInPage =
        this.getSteamAccountsByPages()[this.activePage - 1] || [];
      for (var sa of steamAccountsInPage) {
        this.selectSteamAccount(sa.id, false);
      }
      if (save) {
        window.Main.steamAccounts.setTableOptions({
          activePage: n,
          pageSize: this.pageSize,
        });
        console.log(`set new page size: ${this.pageSize}`);
      }

      const balanceTableField = this.fields.filter(
        (field) => field.type === AvalibleTypes.steamAccountBalance
      )[0];
      // Под поиском без совпадений страницы может не быть вовсе
      const steamAccountInThisPage = this.getSteamAccountsByPages()[n - 1] || [];

      if (balanceTableField && balanceTableField.isVisible)
        for (let sa of steamAccountInThisPage) {
          if (
            (!this.changableSecondaries[sa.id] ||
              !this.changableSecondaries[sa.id].isLoad) &&
            !sa.deleted
          ) {
            this.loadChangableSecondaries(sa.id);
          }
        }
      this.activePage = n;
    } catch (err) {
      console.log(`Ошибка при установке страницы ${n}`);
      console.log(err);
    }
  }
  setPageSize(n: number, save: boolean = false) {
    if (save)
      window.Main.steamAccounts.setTableOptions({
        activePage: 1,
        pageSize: n,
      });
    this.activePage = 1;
    this.pageSize = n;
  }
  // Увеличивает размер страницы так, чтобы totalCount элементов было видно без
  // пагинации (напр. после импорта). Только увеличивает, никогда не уменьшает.
  // Держать список в синхроне с options.avalible у TablePageSwitcher в футерах.
  ensurePageSizeFits(totalCount: number) {
    if (this.pageSize >= totalCount) return;
    const avaliblePageSizes = [5, 10, 15, 20, 40, 100];
    const fitted = avaliblePageSizes.find((size) => size >= totalCount) ||
      avaliblePageSizes[avaliblePageSizes.length - 1];
    this.setPageSize(fitted, true);
  }
}

export default SteamAccountsTableStore;

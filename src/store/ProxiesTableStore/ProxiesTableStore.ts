import store, { Store } from "../store";
import { makeAutoObservable, toJS, runInAction } from "mobx";
import AvalibleTypes from "../../../electron/interfaces/TableFields/AvalibleFieldTypes";
import Field from "../../../electron/interfaces/TableFields/Field";
import TableProxyInterface from "../../../electron/interfaces/Proxy/TableProxyInterface";
import defaultProxiesTableFields from "../../../electron/interfaces/TableFields/defaults/proxiesTableFields";
import ProxySetupInterface from "../../../electron/interfaces/Proxy/ProxySetupInterface";
import testingResultJsx from "./testingResultJsx";
import parseProxyString from "../../pages/Main/tabs/ProxiesTab/components/Funcs/parseProxyString";

class ProxiesTableStore {
  root: Store;
  fields: Field[];
  defaultFields: Field[];
  proxies: TableProxyInterface[];
  isAllSelected: boolean;
  showDeleted: boolean;
  isEditingFormOpen: boolean;
  editingFormContent: TableProxyInterface;
  isSettingsFormOpen: boolean;
  isCreationFormOpen: boolean;
  isBulkFormOpen: boolean;
  pageSize: number;
  activePage: number;
  isTestingEditingProxy: boolean;
  hidenProxyId: string[];
  searchString: string;

  constructor(root: Store) {
    this.root = root;
    this.fields = [];
    this.defaultFields = defaultProxiesTableFields;
    this.isAllSelected = false;
    this.showDeleted = false;
    this.isEditingFormOpen = false;
    this.editingFormContent = {} as TableProxyInterface;
    this.isSettingsFormOpen = false;
    this.isCreationFormOpen = false;
    this.isBulkFormOpen = false;
    this.proxies = [];
    this.hidenProxyId = [];
    this.searchString = "";

    this.isTestingEditingProxy = false;

    this.pageSize = 20;
    this.activePage = 1;

    makeAutoObservable(this);

    window.Main.proxies.getTableFields();
    window.Main.proxies.get();
    window.Main.proxies.getTableOptions();

    window.Main.proxies.onGetTableOptions((event, options) => {
      this.setPageSize(options.pageSize, false);
      this.setActivePage(options.activePage, false);
    });
    window.Main.proxies.onTest((event, data) => {
      if (data.id === "editing_proxy") {
        this.isTestingEditingProxy = false;
        store.windows.openMiniNotification({
          text: `Прокси ${data.testResult ? "работает" : "НЕ работает"}`,
          type: data.testResult ? "success" : "error",
        });
        return;
      }
      const proxy = this.proxies.filter((p) => p.id === data.id);
      if (!proxy[0]) throw new Error(`Прокси #${data.id} не существует`);
      proxy[0].isTesting = false;
      store.windows.openMiniNotification({
        type: data.testResult ? "success" : "error",
        text: `Прокси #${proxy[0].number} ${proxy[0].host}:${proxy[0].port} ${
          data.testResult ? "работает" : "НЕ работает"
        }`,
      });
      runInAction(() => {
        proxy[0].isWorking = data.testResult;
      });
    });
    window.Main.proxies.onGetTableFields((event, fields) => {
      this.setFields(fields);
    });
    window.Main.proxies.onGet((event, proxies) => {
      const tableProxies: TableProxyInterface[] = [];
      const deletedTableProxies: TableProxyInterface[] = [];

      for (var proxy of proxies) {
        if (!proxy.deleted) {
          tableProxies.push({ ...proxy, isSelected: false, isTesting: false });
        } else {
          deletedTableProxies.push({
            ...proxy,
            isSelected: false,
            isTesting: false,
          });
        }
      }
      this.proxies = [...tableProxies, ...deletedTableProxies];
    });
  }

  search(newSearchString: string) {
    this.searchString = newSearchString;
    this.hidenProxyId = this.proxies
      .filter((p) => !p.host.includes(newSearchString))
      .map((p) => p.id);
  }
  changeShowStatus(status?: boolean) {
    if (status) {
      this.showDeleted = status;
    } else {
      this.showDeleted = !this.showDeleted;
    }
  }
  createNew(
    proxy: ProxySetupInterface,
    links: { steamAccountIds: string[]; profileIds: string[] }
  ) {
    window.Main.proxies.new(proxy, links);
  }
  changeFieldDirection(fieldType: AvalibleTypes, direction: "UP" | "DOWN") {
    for (var field of this.fields) {
      if (field.type === fieldType) {
        field.sortDirection = direction;
      }
    }
  }
  testEditingProxy(proxy: ProxySetupInterface) {
    this.isTestingEditingProxy = true;
    window.Main.proxies.testByParams(proxy);
  }
  testProxy(id: string) {
    const proxy = this.proxies.filter((p) => p.id === id);
    if (!proxy[0]) throw new Error(`Прокси #${id} не существует`);
    proxy[0].isTesting = true;
    window.Main.proxies.test(id);
  }
  testSelected() {
    const selected = this.proxies.filter((p) => p.isSelected && !p.deleted);
    for (var proxy of selected) {
      this.testProxy(proxy.id);
    }
  }
  setFields(fields: Field[]) {
    this.fields = fields;
  }
  saveFields(fields: Field[]) {
    window.Main.proxies.saveTableFields(fields);
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
  getDefaultFields() {
    return toJS(this.defaultFields);
  }
  getProxies() {
    return toJS(this.proxies);
  }
  getProxiesByPages() {
    const proxies: TableProxyInterface[][] = [];

    let count = 0;
    let bufProxies: TableProxyInterface[] = [];
    for (var i of toJS(this.proxies).filter(
      (p) => !this.hidenProxyId.includes(p.id)
    )) {
      if (i.deleted && !this.showDeleted) continue;

      if (count === this.pageSize) {
        proxies.push(bufProxies);
        bufProxies = [];
        count = 0;
      }
      bufProxies.push(i);
      count += 1;
    }
    if (bufProxies.length > 0) {
      proxies.push(bufProxies);
    }
    return proxies;
  }
  selectProxy(id: string, isSelected: boolean = true) {
    const proxy = this.proxies.find((p) => p.id === id);
    if (proxy) proxy.isSelected = isSelected;
    if (
      this.proxies.filter((p) => p.isSelected).length ===
        this.proxies.filter((p) => !p.deleted).length &&
      this.proxies.length !== 0
    ) {
      this.isAllSelected = true;
    } else {
      this.isAllSelected = false;
    }
  }
  selectAllProxies(isSelected: boolean = true) {
    this.isAllSelected = isSelected;
    for (var proxy of this.proxies) {
      if (proxy.deleted) continue;
      proxy.isSelected = isSelected;
    }
  }
  editProxyInStorage(
    id: string,
    proxy: { [K in keyof TableProxyInterface]?: TableProxyInterface[K] },
    links: { steamAccountIds: string[] }
  ) {
    window.Main.proxies.edit(id, proxy, links);
  }
  deleteProxy(id: string) {
    const index = this.getProxies().findIndex((proxy) => proxy.id === id);
    if (index === -1)
      throw new Error(
        `Не получилось удалить прокси: #${id} - такого прокси не существует`
      );
    this.proxies.splice(index, 1);
    window.Main.proxies.delete(id);
  }

  openTableSettings() {
    this.isSettingsFormOpen = true;
  }
  closeTableSettings() {
    this.isSettingsFormOpen = false;
  }
  openEditingForm(proxy: TableProxyInterface) {
    this.isEditingFormOpen = true;
    this.editingFormContent = proxy;
  }
  getEditingFormContent() {
    return toJS(this.editingFormContent);
  }
  closeEditingForm() {
    this.isEditingFormOpen = false;
  }
  openCreationForm() {
    this.isCreationFormOpen = true;
  }
  closeCreationForm() {
    this.isCreationFormOpen = false;
  }
  openBulkForm() {
    this.isBulkFormOpen = true;
  }
  closeBulkForm() {
    this.isBulkFormOpen = false;
  }
  createBulk(rawText: string) {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Дедуп только против активных прокси: удалённые (архивные, deleted: true)
    // не должны блокировать повторное добавление.
    const existingKeys = new Set(
      this.proxies
        .filter((p) => !p.deleted)
        .map((p) => `${p.host}:${p.port}`.toLowerCase())
    );
    const batchKeys = new Set<string>();

    const validProxies: ProxySetupInterface[] = [];
    let invalidCount = 0;
    let duplicateCount = 0;

    for (var line of lines) {
      const proxy = parseProxyString(line);
      if (!proxy.host || !proxy.port || !proxy.username || !proxy.password) {
        invalidCount += 1;
        continue;
      }
      const key = `${proxy.host}:${proxy.port}`.toLowerCase();
      if (existingKeys.has(key) || batchKeys.has(key)) {
        duplicateCount += 1;
        continue;
      }
      batchKeys.add(key);
      validProxies.push(proxy);
    }

    if (validProxies.length > 0) {
      window.Main.proxies.bulkNew(validProxies);
      // Показываем все добавленные прокси сразу, не пряча их за пагинацией
      const activeProxiesCount = this.proxies.filter((p) => !p.deleted).length;
      this.ensurePageSizeFits(activeProxiesCount + validProxies.length);
    }

    this.root.windows.openMiniNotification({
      type: validProxies.length > 0 ? "success" : "error",
      text: `Добавлено: ${validProxies.length}, пропущено невалидных: ${invalidCount}, дубликатов: ${duplicateCount}`,
    });
  }
  setActivePage(n: number, save: boolean = false) {
    for (var i = n; i >= 1; i--) {
      const proxiesInPage = this.getProxiesByPages()[i - 1];
      if (proxiesInPage) {
        n = i;
        console.log("set " + i + " page");
        break;
      }
    }
    if (save)
      window.Main.proxies.setTableOptions({
        activePage: n,
        pageSize: this.pageSize,
      });
    this.activePage = n;
  }
  setPageSize(n: number, save: boolean = true) {
    if (save)
      window.Main.proxies.setTableOptions({
        activePage: 1,
        pageSize: n,
      });
    this.activePage = 1;
    this.pageSize = n;
  }
  // Увеличивает размер страницы так, чтобы totalCount элементов было видно без
  // пагинации (напр. после массового добавления). Только увеличивает.
  // Держать список в синхроне с options.avalible у TablePageSwitcher в футерах.
  ensurePageSizeFits(totalCount: number) {
    if (this.pageSize >= totalCount) return;
    const avaliblePageSizes = [5, 10, 15, 20, 40, 100];
    const fitted = avaliblePageSizes.find((size) => size >= totalCount) ||
      avaliblePageSizes[avaliblePageSizes.length - 1];
    this.setPageSize(fitted);
  }
}

export default ProxiesTableStore;

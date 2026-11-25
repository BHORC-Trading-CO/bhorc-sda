import { Store } from "../store";
import { makeAutoObservable, toJS } from "mobx";
import AvalibleTypes from "../../../electron/interfaces/TableFields/AvalibleFieldTypes";
import Field from "../../../electron/interfaces/TableFields/Field";
import TableProxyInterface from "../../../electron/interfaces/Proxy/TableProxyInterface";
import defaultProxiesTableFields from "../../../electron/interfaces/TableFields/defaults/proxiesTableFields";
import ProxySetupInterface from "../../../electron/interfaces/Proxy/ProxySetupInterface";
import testingResultJsx from "./testingResultJsx";
import { ProxyBulkResult, ProxyEditReply, ProxyTestReply, ProxyTestResult } from "../../../electron/interfaces/Proxy/ProxyResults";
import i18n from "../../i18n/i18n";

/** Массовая проверка: одно общее уведомление, когда придут ответы по всем прокси (SDA-64). */
interface TestBatch {
  left: number;
  working: number;
  failed: string[];
}

const setupOf = ({ host, port, username, password }: ProxySetupInterface): ProxySetupInterface => ({ host, port, username, password });
const isSameSetup = (a: ProxySetupInterface, b: ProxySetupInterface) =>
  a.host === b.host && String(a.port) === String(b.port) && a.username === b.username && a.password === b.password;

class ProxiesTableStore {
  root: Store;
  fields: Field[];
  defaultFields: Field[];
  proxies: TableProxyInterface[];
  showDeleted: boolean;
  isEditingFormOpen: boolean;
  editingFormContent: TableProxyInterface;
  isSavingEdit: boolean = false;
  editError: string | null = null;
  private editRequestId: string | null = null;
  isSettingsFormOpen: boolean;
  isCreationFormOpen: boolean;
  isBulkFormOpen: boolean;
  pageSize: number;
  activePage: number;
  isTestingEditingProxy: boolean;
  editingTestResult: boolean | undefined;
  editingTestFailure: ProxyTestResult | undefined;
  testedEditingProxy: ProxySetupInterface | undefined;
  private editingTestRequestId: string | null = null;
  searchString: string;
  private requestSeq: number = 0;
  private pendingTests = new Map<string, { id: string; setup: ProxySetupInterface; batch?: TestBatch }>();
  private pendingBulk = new Map<string, (result: ProxyBulkResult) => void>();

  constructor(root: Store) {
    this.root = root;
    this.fields = [];
    this.defaultFields = defaultProxiesTableFields;
    this.showDeleted = false;
    this.isEditingFormOpen = false;
    this.editingFormContent = {} as TableProxyInterface;
    this.isSettingsFormOpen = false;
    this.isCreationFormOpen = false;
    this.isBulkFormOpen = false;
    this.proxies = [];
    this.searchString = "";

    this.isTestingEditingProxy = false;
    this.editingTestResult = undefined;
    this.editingTestFailure = undefined;
    this.testedEditingProxy = undefined;

    this.pageSize = 20;
    this.activePage = 1;

    // Служебные очереди запросов: mobx копировал бы в них объекты, а batch у всех записей один.
    makeAutoObservable<this, "pendingTests" | "pendingBulk">(this, { pendingTests: false, pendingBulk: false });

    window.Main.proxies.getTableFields();
    window.Main.proxies.get();
    window.Main.proxies.getTableOptions();

    window.Main.proxies.onGetTableOptions((event, options) => {
      this.setPageSize(options.pageSize, false);
      this.setActivePage(options.activePage, false);
    });
    window.Main.proxies.onTest((event, data) => this.onTestReply(data));
    window.Main.proxies.onEditResult((event, data) => this.onEditResult(data));
    window.Main.proxies.onBulkResult((event, data) => this.onBulkResult(data));
    window.Main.proxies.onGetTableFields((event, fields) => {
      this.setFields(fields);
    });
    window.Main.proxies.onGet((event, proxies) => {
      const tableProxies: TableProxyInterface[] = [];
      const deletedTableProxies: TableProxyInterface[] = [];

      for (var proxy of proxies) {
        if (!proxy.deleted) {
          tableProxies.push({ ...proxy, isSelected: false, isTesting: this.isTestPending(proxy) });
        } else {
          deletedTableProxies.push({
            ...proxy,
            isSelected: false,
            isTesting: this.isTestPending(proxy),
          });
        }
      }
      this.proxies = [...tableProxies, ...deletedTableProxies];
    });
  }

  // Время в id: ответ на запрос, отправленный до перезагрузки окна, не совпадёт с новым.
  private nextRequestId(): string {
    this.requestSeq += 1;
    return `${Date.now()}-${this.requestSeq}`;
  }
  search(newSearchString: string) {
    this.searchString = newSearchString;
    this.activePage = 1;
  }
  // Строки таблицы: под текущим поиском, архив — если показан. Считаются по живым данным (SDA-64):
  // список скрытых id, снятый в момент поиска, устаревал после добавления и правки.
  getVisibleProxies(): TableProxyInterface[] {
    return this.proxies.filter(
      (p) => p.host.includes(this.searchString) && (this.showDeleted || !p.deleted)
    );
  }
  // Что выделяет галочка в шапке. То, что скрыто поиском, в массовые действия не попадает (SDA-64):
  // раньше при поиске одного хоста галочка выделяла — и отправляла в архив — все прокси.
  private getSelectableProxies(): TableProxyInterface[] {
    return this.getVisibleProxies().filter((p) => !p.deleted);
  }
  // Единственный список для счётчика, вопроса и самих массовых действий.
  getSelectedProxies(): TableProxyInterface[] {
    return this.getSelectableProxies().filter((p) => p.isSelected);
  }
  get isAllSelected(): boolean {
    const proxies = this.getSelectableProxies();
    return proxies.length !== 0 && proxies.every((p) => p.isSelected);
  }
  // Страница на экране. Строк могло стать меньше (поиск, архив, удаление): пустой страницы не бывает.
  get currentPage(): number {
    return Math.max(1, Math.min(this.activePage, Math.ceil(this.getVisibleProxies().length / this.pageSize)));
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
    // Предыдущая проверка, если ещё идёт, больше не нужна: её ответ придёт с другим id.
    this.editingTestRequestId = this.nextRequestId();
    this.isTestingEditingProxy = true;
    // Display-only snapshot: do not show a previous result for changed credentials.
    this.testedEditingProxy = setupOf(proxy);
    this.editingTestResult = undefined;
    this.editingTestFailure = undefined;
    window.Main.proxies.testByParams(setupOf(proxy), this.editingTestRequestId);
  }
  resetEditingTestDisplay() {
    this.editingTestRequestId = null;
    this.testedEditingProxy = undefined;
    this.editingTestResult = undefined;
    this.editingTestFailure = undefined;
    this.isTestingEditingProxy = false;
  }
  testProxy(id: string, batch?: TestBatch) {
    const proxy = this.proxies.find((p) => p.id === id);
    if (!proxy) throw new Error(i18n.t("proxies.errors.notFound", { id }));
    if (proxy.isTesting) return;
    const requestId = this.nextRequestId();
    this.pendingTests.set(requestId, { id, setup: setupOf(proxy), batch });
    if (batch) batch.left += 1;
    proxy.isTesting = true;
    window.Main.proxies.test(id, requestId);
  }
  testSelected() {
    const batch: TestBatch = { left: 0, working: 0, failed: [] };
    for (var proxy of this.getSelectedProxies()) {
      this.testProxy(proxy.id, batch);
    }
  }
  // Идёт ли проверка именно этих данных прокси: правка прокси её результат отменяет (SDA-64).
  private isTestPending(proxy: ProxySetupInterface & { id: string }): boolean {
    return Array.from(this.pendingTests.values()).some((test) => test.id === proxy.id && isSameSetup(test.setup, proxy));
  }
  private onTestReply(data: ProxyTestReply) {
    const failure = data.ok ? undefined : { ok: false, statusCode: data.statusCode, error: data.error };
    if (data.requestId === this.editingTestRequestId) {
      this.editingTestRequestId = null;
      this.isTestingEditingProxy = false;
      this.editingTestResult = data.ok;
      this.editingTestFailure = failure;
      this.root.windows.openMiniNotification({
        text: failure ? this.testFailureText(failure) : i18n.t("proxies.test.editingWorking"),
        type: data.ok ? "success" : "error",
      });
      return;
    }
    const test = this.pendingTests.get(data.requestId);
    if (!test) return;
    this.pendingTests.delete(data.requestId);
    // Прокси могли удалить или изменить: результат относится только к тем данным, которые проверены.
    const proxy = this.proxies.find((p) => p.id === test.id);
    if (proxy) proxy.isTesting = this.isTestPending(proxy);
    const applies = proxy !== undefined && isSameSetup(proxy, data.tested ?? test.setup);
    if (proxy && applies) {
      proxy.isWorking = data.ok;
      proxy.testFailure = failure;
    }
    if (test.batch) return this.onBatchReply(test.batch, applies ? proxy : undefined, data);
    if (!proxy || !applies) return;
    this.root.windows.openMiniNotification({
      type: data.ok ? "success" : "error",
      text: failure ? this.testFailureText(failure, proxy) : i18n.t("proxies.test.working", {
        number: proxy.number,
        host: proxy.host,
        port: proxy.port,
      }),
    });
  }
  private onBatchReply(batch: TestBatch, proxy: TableProxyInterface | undefined, data: ProxyTestReply) {
    batch.left -= 1;
    if (proxy && data.ok) batch.working += 1;
    if (proxy && !data.ok) batch.failed.push(`#${proxy.number}${data.statusCode ? ` (Steam ${data.statusCode})` : ""}`);
    if (batch.left > 0 || batch.working + batch.failed.length === 0) return;
    this.root.windows.openMiniNotification({
      type: batch.failed.length === 0 ? "success" : "error",
      text: i18n.t(batch.failed.length === 0 ? "proxies.test.summaryWorking" : "proxies.test.summaryFailed", {
        working: batch.working,
        failed: batch.failed.length,
        // Полный список — в строках таблицы; уведомление не должно закрывать её целиком.
        numbers: batch.failed.slice(0, 30).join(", ") + (batch.failed.length > 30 ? "…" : ""),
      }),
    });
  }
  // Steam ответил не 200 — прокси при этом работает: отдельный текст с кодом (SDA-64).
  private testFailureText(failure: ProxyTestResult, proxy?: TableProxyInterface): string {
    const values = { number: proxy?.number, host: proxy?.host, port: proxy?.port, code: failure.statusCode, error: failure.error };
    if (failure.statusCode) return i18n.t(proxy ? "proxies.test.steamStatus" : "proxies.test.editingSteamStatus", values);
    const text = i18n.t(proxy ? "proxies.test.notWorking" : "proxies.test.editingNotWorking", values);
    return failure.error ? `${text}: ${failure.error}` : text;
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
    for (var i of this.getVisibleProxies().map((p) => toJS(p))) {
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
  }
  selectAllProxies(isSelected: boolean = true) {
    for (var proxy of this.getSelectableProxies()) proxy.isSelected = isSelected;
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
      throw new Error(i18n.t("proxies.errors.deleteNotFound", { id }));
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
    this.resetEditingTestDisplay();
    this.resetEditSave();
    this.isEditingFormOpen = true;
    this.editingFormContent = proxy;
  }
  getEditingFormContent() {
    return toJS(this.editingFormContent);
  }
  // Сохранение из окна правки: окно закрывается после ответа main, отказ остаётся в форме (SDA-64).
  saveEditing(
    proxy: ProxySetupInterface,
    links: { steamAccountIds: string[]; originalSteamAccountIds?: string[] }
  ) {
    if (this.isSavingEdit) return;
    this.isSavingEdit = true;
    this.editError = null;
    this.editRequestId = this.nextRequestId();
    window.Main.proxies.edit(this.editingFormContent.id, proxy, links, this.editRequestId);
  }
  setEditError(error: string | null) {
    this.editError = error;
  }
  private onEditResult(data: ProxyEditReply) {
    if (data.requestId !== this.editRequestId) {
      // Окно уже закрыли или открыли заново: отказ показать больше негде
      if (data.error) this.root.windows.openMiniNotification({ type: "error", text: data.error });
      return;
    }
    if (!data.error) return this.closeEditingForm();
    this.resetEditSave();
    this.editError = data.error;
  }
  private resetEditSave() {
    this.editRequestId = null;
    this.isSavingEdit = false;
    this.editError = null;
  }
  closeEditingForm() {
    this.resetEditingTestDisplay();
    this.resetEditSave();
    this.isEditingFormOpen = false;
  }
  openCreationForm() {
    this.resetEditingTestDisplay();
    this.isCreationFormOpen = true;
  }
  closeCreationForm() {
    this.resetEditingTestDisplay();
    this.isCreationFormOpen = false;
  }
  openBulkForm() {
    this.isBulkFormOpen = true;
  }
  closeBulkForm() {
    this.isBulkFormOpen = false;
  }
  // Числа и отклонённые строки приходят из main после сохранения (SDA-64).
  createBulk(rawText: string): Promise<ProxyBulkResult> {
    const requestId = this.nextRequestId();
    return new Promise((resolve) => {
      this.pendingBulk.set(requestId, resolve);
      window.Main.proxies.bulkNew(rawText, requestId);
    });
  }
  private onBulkResult(data: ProxyBulkResult & { requestId: string }) {
    const resolve = this.pendingBulk.get(data.requestId);
    if (!resolve) return;
    this.pendingBulk.delete(data.requestId);
    const { added, duplicates, rejected } = data;
    if (added > 0) {
      // Показываем все добавленные прокси сразу, не пряча их за пагинацией
      this.ensurePageSizeFits(this.proxies.filter((p) => !p.deleted).length);
    }
    this.root.windows.openMiniNotification({
      type: added > 0 && rejected.length === 0 ? "success" : "error",
      text: i18n.t("proxies.bulk.result", { added, invalid: rejected.length, duplicates }),
    });
    resolve({ added, duplicates, rejected });
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

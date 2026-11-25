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

// Неудачная загрузка баланса: повтор по любому поводу — не раньше чем через минуту после ответа,
// а сам по таймеру — через 1, 5 и 15 минут (дальше только по поводу или кнопкой обновления).
const BALANCE_RETRY_FLOOR_MS = 60 * 1000;
const BALANCE_RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];
// После смены маршрута баланс грузим заново через несколько секунд, а не в ту же секунду: main шлёт
// смену прокси сразу после того, как пересоздал клиент и запустил вход (initSession) без ожидания,
// и мгновенный запрос почти наверняка увидел бы «не вошёл». Переход на страницу грузит и раньше.
const ROUTE_CHANGE_BALANCE_DELAY_MS = 10 * 1000;
// «Перезагрузить все данные» (SDA-59): обновление аккаунта — это четыре запроса к Steam, залпом
// по всем аккаунтам Steam быстро отвечает 429 (см. SDA-38). Поэтому очередь: не больше трёх
// аккаунтов одновременно, следующий — когда пришёл ответ (удачный или с ошибкой) по предыдущему.
export const FULL_REFRESH_CONCURRENCY = 3;

type BalanceLoad = { state: "loading" | "done" | "failed"; at: number; failures: number };

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
  // Баланс — это страница /market/ (~1 МБ, SDA-38). Удачный ответ (done) запоминаем до конца
  // запуска: новый список аккаунтов (смена вкладки, правка, импорт) несёт сохранённый в main баланс
  // и не перезапрашивает его. Ответ с ошибкой (failed) не запоминается как готовый: его повторяют,
  // см. BALANCE_RETRY_*. В том числе так восстанавливается старт, когда список приходит раньше,
  // чем main поставил cookie сессии, и первый запрос видит «не вошёл». Смена маршрута аккаунта
  // забывает запись, обновление сессии и кнопка строки грузят баланс заново (getSecondary).
  balanceLoads: { [id: string]: BalanceLoad };
  // Таймеры автоповтора; не observable
  balanceRetryTimers: { [id: string]: ReturnType<typeof setTimeout> };
  // Перезагрузка баланса после смены маршрута — отдельным таймером. Пока он заведён, новый запрос
  // ещё не отправлен: любой ответ по аккаунту относится к запросу старого маршрута и не принимается
  routeReloadTimers: { [id: string]: ReturnType<typeof setTimeout> };
  browserStatuses: {
    [id: string]: "load" | "working" | "notworking";
  };
  authCodes: { [id: string]: string };
  searchString: string;
  // Только для отображения: по какой колонке сейчас отсортированы строки (стрелка в заголовке)
  sortedField: AvalibleTypes | null;
  // Очередь «Перезагрузить все данные» (SDA-59); не observable — состояние строк и так
  // показывает isLoadSecondary
  fullRefreshPending: boolean;
  fullRefreshQueue: string[];
  fullRefreshInFlight: Set<string>;

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
    this.balanceLoads = {};
    this.balanceRetryTimers = {};
    this.routeReloadTimers = {};
    this.browserStatuses = {};

    this.settingsForm = new SettingsFormStore(this);
    this.creationForm = new CreationFormStore(this);
    this.editingForm = new EditingFormStore(this);

    this.activePage = 1;
    this.pageSize = 10;

    this.searchString = "";
    this.sortedField = null;
    this.fullRefreshPending = false;
    this.fullRefreshQueue = [];
    this.fullRefreshInFlight = new Set();

    makeAutoObservable(this, {
      balanceRetryTimers: false, routeReloadTimers: false,
      fullRefreshPending: false, fullRefreshQueue: false, fullRefreshInFlight: false,
    });

    window.Main.steamAccounts.getTableFields();
    window.Main.steamAccounts.get();
    window.Main.steamAccounts.getTableOptions();

    window.Main.steamAccounts.onGetSecondary((event, data) => {
      // Первым делом: если аккаунта уже нет в таблице, код ниже бросит, а очередь не должна встать
      this.finishFullRefreshItem(data.id);
      runInAction(() => {
        this.steamAccounts[data.id].getSecondaryError = null;
        this.steamAccounts[data.id].isLoadSecondary = false;
        this.steamAccounts[data.id].secondary = data.secondary;
      });
    });
    window.Main.steamAccounts.onGetSecondaryError((event, data) => {
      // Ошибка одного аккаунта не останавливает очередь остальных
      this.finishFullRefreshItem(data.id);
      store.windows.openMiniNotification({
        type: "error",
        text: i18n.t("accounts.errors.loadData", { error: data.err }),
      });
      runInAction(() => {
        this.steamAccounts[data.id].isLoadSecondary = false;
      });
      // Обновление не дошло до баланса: ответа с ним не будет, запись — на повтор
      if (this.balanceLoads[data.id]?.state === "loading") this.recordBalanceResult(data.id, true);
    });
    window.Main.steamAccounts.onGetBrowserStatus((event, data) => {
      console.log("get browser status", data);
      runInAction(() => {
        this.browserStatuses[data.id] = data.status;
      });
    });
    window.Main.steamAccounts.onBrowserRouteChanged((event, message) => {
      this.root.windows.openMiniNotification({ type: "info", text: message });
    });
    window.Main.steamAccounts.onGetChangableSecondary((event, data) => {
      this.editChanableSecondaries(data.id, data.changableSecondary);
    });
    window.Main.steamAccounts.onGetChangableSecondaryError((event, data) => {
      //this.writeChangableSecondariesError(data.id, String(data.err));
      // Ответа с балансом не будет: запись — на повтор
      this.recordBalanceResult(data.id, true);
    });
    window.Main.steamAccounts.onGetTableFields((event, fields) => {
      this.setFields(fields);
    });
    window.Main.steamAccounts.onRefreshSession((event, id) => {
      console.log(`steam account #${id} session has been refreshed`);
      runInAction(() => {
        this.steamAccounts[id].isLogining = false;
      });
      // Баланс приходит из того же обновления (одна загрузка /market/ на КТ, ТП и баланс, SDA-38):
      // отдельный loadChangableSecondaries скачал бы страницу второй раз.
      this.loadSecondaries(id);
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
      // Очередь — до setActivePage: тот сразу запрашивает баланс аккаунтов страницы, а при полном
      // обновлении баланс придёт с очередью
      if (this.fullRefreshPending) {
        this.fullRefreshPending = false;
        this.startFullRefresh();
      }
      this.setActivePage(this.activePage);
    });
    window.Main.steamAccounts.onGetTableOptions((event, options) => {
      this.setPageSize(options.pageSize, false);
      this.setActivePage(options.activePage, false);
    });
    // При импорте main привязывает прокси (и шлёт это событие) раньше, чем отправляет
    // новый список аккаунтов: аккаунта в сторе ещё нет. Это не ошибка для пользователя —
    // следующий список аккаунтов уже несёт прокси. Остальные поля события (напр. proxyState)
    // передаются как есть.
    window.Main.steamAccounts.onEditProxy((event, { id, ...changes }) => {
      if (!this.steamAccounts[id]) {
        console.log(`proxy update for steam account #${id} skipped: not in the table yet`);
        return;
      }
      // Маршрут сменился: прежняя запись о балансе (в том числе «не грузить») больше не действует,
      // баланс по новому маршруту грузим заново
      const routeChanged = routeOf(this.steamAccounts[id]) !== routeOf({ ...this.steamAccounts[id], ...changes });
      this.editSteamAccount(id, changes);
      if (routeChanged) this.reloadBalanceForNewRoute(id);
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
  // Кнопка «Перезагрузить все данные»: main перечитывает аккаунты и входит заново (архивные
  // пропускает), а когда придёт новый список — обновляем данные всех активных аккаунтов очередью.
  reloadAll() {
    this.fullRefreshPending = true;
    window.Main.steamAccounts.refresh();
  }
  // Сначала аккаунты текущей страницы, потом остальные активные. Архивные не обновляются.
  startFullRefresh() {
    const page = (this.getSteamAccountsByPages()[this.activePage - 1] || []).map((sa) => sa.id);
    const rest = Object.keys(this.steamAccounts).filter((id) => !page.includes(id));
    this.fullRefreshQueue = [...page, ...rest].filter((id) => this.steamAccounts[id] && !this.steamAccounts[id].deleted);
    // Баланс придёт с полным обновлением. Без пометки стартовый таймер onGet (через 3 с) запросил бы
    // /market/ всех ещё не загруженных аккаунтов разом, поверх очереди, и Steam отвечал 429.
    for (const id of this.fullRefreshQueue) this.startBalanceLoad(id);
    this.fullRefreshInFlight = new Set();
    this.pumpFullRefresh();
  }
  pumpFullRefresh() {
    while (this.fullRefreshInFlight.size < FULL_REFRESH_CONCURRENCY && this.fullRefreshQueue.length > 0) {
      const id = this.fullRefreshQueue.shift()!;
      const account = this.steamAccounts[id];
      if (!account || account.deleted) continue;
      this.fullRefreshInFlight.add(id);
      this.loadSecondaries(id);
    }
  }
  finishFullRefreshItem(id: string) {
    if (!this.fullRefreshInFlight.delete(id)) return;
    this.pumpFullRefresh();
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
    if (!this.steamAccounts[id] || this.steamAccounts[id].deleted) return;
    // Уже загружен в этом запуске или ещё грузится: стартовый таймер, setActivePage и
    // onGetTableOptions иначе запрашивали баланс аккаунтов первой страницы по два-три раза.
    // Неудачный — не раньше чем через минуту, чтобы не долбить сломанный прокси.
    const memo = this.balanceLoads[id];
    if (memo && (memo.state !== "failed" || Date.now() - memo.at < BALANCE_RETRY_FLOOR_MS)) return;
    const fields = this.getFields();
    const usefulFields = fields.filter(
      (f) => f.type === AvalibleTypes.steamAccountBalance
    );
    if (usefulFields.filter((f) => !f.isVisible).length === 1) {
      return;
    }
    this.startBalanceLoad(id);
    if (this.changableSecondaries[id]) this.changableSecondaries[id].isLoad = false;
    window.Main.steamAccounts.getChangableSecondary(id);
  }
  loadSecondaries(id: string) {
    this.steamAccounts[id].isLoadSecondary = true;
    // Полное обновление приносит и баланс (одна загрузка /market/): пока оно в пути, отдельный
    // запрос баланса не нужен
    this.startBalanceLoad(id);
    window.Main.steamAccounts.getSecondary(id);
  }
  startBalanceLoad(id: string) {
    this.clearBalanceRetry(id);
    this.clearRouteReload(id);
    this.balanceLoads[id] = { state: "loading", at: Date.now(), failures: this.balanceLoads[id]?.failures ?? 0 };
  }
  // Ответ с балансом: удачный запоминаем, неудачный ставим на повтор с паузой 1 → 5 → 15 мин
  recordBalanceResult(id: string, failed: boolean) {
    // Ответ запроса, отправленного до смены маршрута: ждём запрос по новому маршруту
    if (this.routeReloadTimers[id] !== undefined) return;
    this.clearBalanceRetry(id);
    if (!failed) {
      this.balanceLoads[id] = { state: "done", at: Date.now(), failures: 0 };
      return;
    }
    const failures = (this.balanceLoads[id]?.failures ?? 0) + 1;
    this.balanceLoads[id] = { state: "failed", at: Date.now(), failures };
    const delay = BALANCE_RETRY_DELAYS_MS[failures - 1];
    if (delay === undefined) return;
    this.balanceRetryTimers[id] = setTimeout(() => {
      delete this.balanceRetryTimers[id];
      this.loadChangableSecondaries(id);
    }, delay);
  }
  // Забыть запись и показанный ответ: без isLoad=false аккаунт с показанной ошибкой старого прокси
  // не подходил ни под переход на страницу, ни под повтор, и ошибка висела до ручного обновления
  forgetBalance(id: string) {
    this.clearBalanceRetry(id);
    delete this.balanceLoads[id];
    if (this.changableSecondaries[id]) this.changableSecondaries[id].isLoad = false;
  }
  reloadBalanceForNewRoute(id: string) {
    this.forgetBalance(id);
    this.clearRouteReload(id);
    this.routeReloadTimers[id] = setTimeout(() => {
      delete this.routeReloadTimers[id];
      this.loadChangableSecondaries(id);
    }, ROUTE_CHANGE_BALANCE_DELAY_MS);
  }
  clearRouteReload(id: string) {
    if (this.routeReloadTimers[id] === undefined) return;
    clearTimeout(this.routeReloadTimers[id]);
    delete this.routeReloadTimers[id];
  }
  clearBalanceRetry(id: string) {
    if (this.balanceRetryTimers[id] === undefined) return;
    clearTimeout(this.balanceRetryTimers[id]);
    delete this.balanceRetryTimers[id];
  }
  editChanableSecondaries(
    id: string,
    chanableSecondaries: ChangableSecondaryInterface
  ) {
    // Ответ запроса, отправленного до смены маршрута (см. routeReloadTimers): не показываем,
    // иначе он отменил бы загрузку по новому маршруту или вернул ошибку старого прокси
    if (this.routeReloadTimers[id] !== undefined) return;
    // Баланс теперь приходит и с обновлением профиля — в том числе для аккаунта, которого
    // в этом словаре ещё нет.
    this.changableSecondaries[id] = { content: chanableSecondaries, isLoad: true };
    // Ошибка приходит обычным ответом ({ steam: { error } }), а не каналом ошибки
    this.recordBalanceResult(id, Boolean(chanableSecondaries?.steam?.error));
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
          // Ответ на баланс в этом запуске уже был (удачный или с ошибкой): main сохранил его,
          // показываем без нового запроса. Повтор после ошибки — по правилам BALANCE_RETRY_*.
          isLoad: this.balanceLoads[sa.id]?.state === "done" || this.balanceLoads[sa.id]?.state === "failed",
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
    const balanceShown = (list: Field[]) =>
      list.some((f) => f.type === AvalibleTypes.steamAccountBalance && f.isVisible);
    const wasShown = balanceShown(this.fields);
    this.fields = fields;
    // Колонку баланса показали. Пока она скрыта, баланс не грузится (в том числе после смены
    // маршрута): без этой загрузки ячейки крутили бы спиннер до перехода на другую страницу.
    // На старте поля приходят раньше аккаунтов — тогда грузить ещё нечего.
    if (!wasShown && balanceShown(fields) && Object.keys(this.steamAccounts).length) {
      this.loadPageBalances(this.activePage);
    }
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
  // Балансы аккаунтов страницы: ещё не загруженные и неудачные
  loadPageBalances(n: number) {
    const balanceTableField = this.fields.filter(
      (field) => field.type === AvalibleTypes.steamAccountBalance
    )[0];
    if (!balanceTableField || !balanceTableField.isVisible) return;
    // Под поиском без совпадений страницы может не быть вовсе
    for (let sa of this.getSteamAccountsByPages()[n - 1] || []) {
      // Неудачный баланс показан ошибкой (isLoad), но переход на страницу — повод повторить;
      // паузу не меньше минуты держит loadChangableSecondaries
      if (
        (!this.changableSecondaries[sa.id] ||
          !this.changableSecondaries[sa.id].isLoad ||
          this.balanceLoads[sa.id]?.state === "failed") &&
        !sa.deleted
      ) {
        this.loadChangableSecondaries(sa.id);
      }
    }
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

      this.loadPageBalances(n);
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

// Маршрут аккаунта для сравнения: состояние прокси, его id и адрес с учётными данными
function routeOf(account: { proxyState?: string; proxyId?: string | null; proxy?: { host?: string; port?: string | number; username?: string; password?: string } | null }) {
  const proxy = account.proxy;
  return JSON.stringify([
    account.proxyState ?? null,
    account.proxyId ?? null,
    proxy ? [proxy.host ?? null, proxy.port ?? null, proxy.username ?? null, proxy.password ?? null] : null,
  ]);
}

export default SteamAccountsTableStore;

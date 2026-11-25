import store, { Store } from "../store";
import { makeAutoObservable, observable, reaction, runInAction, toJS } from "mobx";
import AvalibleTypes from "../../../electron/interfaces/TableFields/AvalibleFieldTypes";
import Field from "../../../electron/interfaces/TableFields/Field";
import TableSteamAccountInterface from "../../../electron/interfaces/SteamAccount/TableSteamAccountInterface";
import CompiledSteamAccountInterface from "../../../electron/interfaces/SteamAccount/CompiledSteamAccountInterface";
import SettingsFormStore from "./SettingsFormStore";
import CreationFormStore from "./CreationFormStore";
import EditingFormStore from "./EditingFormStore";
import ChangableSecondaryInterface from "../../../electron/interfaces/SteamAccount/ChangableSecondaryInterface";
import isGuardSecret from "../../../electron/components/Functions/guardSecret";
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
// Предохранитель: main отвечает на каждое обновление (все запросы ограничены по времени), но одно
// потерянное не должно навсегда занять место в очереди
const FULL_REFRESH_ITEM_TIMEOUT_MS = 10 * 60 * 1000;
// Ошибки разных аккаунтов, пришедшие подряд, показываем одним сообщением (SDA-61): раньше
// сообщения затирали друг друга, и из десятка упавших аккаунтов был виден последний.
export const ERROR_SUMMARY_DELAY_MS = 1500;
// Фоновые входы на старте падают пачками по мере очереди (тайм-аут прокси — 5 с): ждём, пока стихнет,
// но не дольше минуты. Сообщение одно на все.
export const BACKGROUND_SUMMARY_QUIET_MS = 8 * 1000;
export const BACKGROUND_SUMMARY_MAX_MS = 60 * 1000;
const ERROR_SUMMARY_NAMES = 5;
const AUTH_CODE_PERIOD_MS = 30 * 1000;

type AccountErrorKind = "data" | "session";

type BalanceLoad = { state: "loading" | "done" | "failed"; at: number; failures: number };

class SteamAccountsTableStore {
  root: Store;
  fields: Field[];
  initialSteamAccounts: CompiledSteamAccountInterface[];
  steamAccounts: { [id: string]: TableSteamAccountInterface };
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
  // Идёт ли оно сейчас: кнопка крутится, второе нажатие не начинает всё заново
  fullRefreshActive: boolean;
  fullRefreshId: number;
  // Номера последних запросов по аккаунтам (SDA-56): main возвращает номер в ответе, и поздний
  // ответ прежнего запроса не снимает индикатор и не подменяет данные нового
  requestSeq: number;
  fullRequests: { [id: string]: number };
  balanceRequests: { [id: string]: number };
  accountErrors: { kind: AccountErrorKind; id: string; err: string }[];
  accountErrorsTimer: ReturnType<typeof setTimeout> | null;
  accountErrorsSince: number;
  accountErrorsAt: number;
  // Восстановлены из архива, ждут нового списка: после него обновляем их данные
  restoredIds: Set<string>;
  // Порядок, выбранный щелчком по заголовку: переживает новый список (SDA-65)
  sortFunc: ((a: TableSteamAccountInterface, b: TableSteamAccountInterface) => number) | null;
  authCodeTimer: ReturnType<typeof setTimeout> | null;

  constructor(root: Store) {
    this.root = root;
    this.fields = [];
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
    this.fullRefreshActive = false;
    this.fullRefreshId = 0;
    this.requestSeq = 0;
    this.fullRequests = {};
    this.balanceRequests = {};
    this.accountErrors = [];
    this.accountErrorsTimer = null;
    this.accountErrorsSince = 0;
    this.accountErrorsAt = 0;
    this.restoredIds = new Set();
    this.sortFunc = null;
    this.authCodeTimer = null;

    makeAutoObservable(this, {
      initialSteamAccounts: observable.ref, sortFunc: false, authCodeTimer: false,
      balanceRetryTimers: false, routeReloadTimers: false,
      fullRefreshPending: false, fullRefreshQueue: false, fullRefreshInFlight: false,
      requestSeq: false, fullRefreshId: false, fullRequests: false, balanceRequests: false,
      accountErrors: false, accountErrorsTimer: false, accountErrorsSince: false, accountErrorsAt: false, restoredIds: false,
    });

    // Состав видимых строк меняется и сам: ответ сменил ник под поиском, группа, архив. Страница не должна
    // остаться пустой, а выбранное — вернуться выбранным, когда фильтр снимут (SDA-65).
    reaction(
      () => this.visibleAccounts.map((sa) => sa.id).join(),
      () => this.setActivePage(this.activePage)
    );
    // Таймеры окна в трее браузер придерживает: вернулись — коды на сейчас
    window.addEventListener?.("focus", () => this.updateAuthCodes());

    window.Main.steamAccounts.getTableFields();
    window.Main.steamAccounts.get();
    window.Main.steamAccounts.getTableOptions();

    window.Main.steamAccounts.onGetSecondary((event, data) => {
      if (!isLatest(this.fullRequests, data)) return;
      delete this.fullRequests[data.id];
      this.finishFullRefreshItem(data.id);
      const account = this.steamAccounts[data.id];
      // Аккаунт удалили, пока шло обновление
      if (!account) return;
      runInAction(() => {
        account.getSecondaryError = null;
        account.isLoadSecondary = false;
        account.secondary = data.secondary;
      });
    });
    window.Main.steamAccounts.onGetSecondaryError((event, data) => {
      if (!isLatest(this.fullRequests, data)) return;
      delete this.fullRequests[data.id];
      const account = this.steamAccounts[data.id];
      if (account) {
        runInAction(() => {
          account.isLoadSecondary = false;
          // Устаревший результат (сменился прокси) — не ошибка аккаунта
          if (!data.stale) account.getSecondaryError = data.err;
        });
        if (!data.stale && !account.deleted) this.reportAccountError("data", data.id, data.err);
      }
      // Обновление не дошло до баланса: ответа с ним не будет, запись — на повтор
      if (this.balanceLoads[data.id]?.state === "loading" && isLatest(this.balanceRequests, data)) {
        // Отдельный запрос баланса, который это обновление заменило, мог оставить в ячейке спиннер
        if (!data.stale) this.showBalanceError(data.id, data.err);
        this.recordBalanceResult(data.id, true);
      }
      // Ошибка одного аккаунта не останавливает очередь остальных
      this.finishFullRefreshItem(data.id);
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
      if (!isLatest(this.balanceRequests, data)) return;
      this.editChanableSecondaries(data.id, data.changableSecondary);
    });
    window.Main.steamAccounts.onGetChangableSecondaryError((event, data) => {
      if (!isLatest(this.balanceRequests, data)) return;
      // Причина (например, вход не удался) видна в ячейке; раньше она крутила спиннер
      if (!data.stale) this.showBalanceError(data.id, data.err);
      // Ответа с балансом не будет: запись — на повтор
      this.recordBalanceResult(data.id, true);
    });
    window.Main.steamAccounts.onSessionState((event, data) => {
      const account = this.steamAccounts[data.id];
      if (account) runInAction(() => { account.sessionError = data.sessionError; });
    });
    window.Main.steamAccounts.onGetTableFields((event, fields) => {
      this.setFields(fields);
    });
    window.Main.steamAccounts.onRefreshSession((event, id) => {
      console.log(`steam account #${id} session has been refreshed`);
      const account = this.steamAccounts[id];
      if (!account) return;
      runInAction(() => {
        account.isLogining = false;
        account.sessionError = null;
      });
      // Баланс приходит из того же обновления (одна загрузка /market/ на КТ, ТП и баланс, SDA-38):
      // отдельный loadChangableSecondaries скачал бы страницу второй раз.
      this.loadSecondaries(id);
    });
    window.Main.steamAccounts.onRefreshSessionError((event, data) => {
      const account = this.steamAccounts[data.id];
      // Аккаунт удалили или список ещё не пришёл: ошибку входа принесёт сам список (sessionError)
      if (!account) return;
      const background = !account.isLogining;
      runInAction(() => {
        account.isLogining = false;
      });
      // Вход отменён (сменился прокси): новый уже идёт, это не ошибка
      if (!account.deleted && !data.stale) this.reportAccountError("session", data.id, data.err, background);
    });
    // Приходит прямо перед списком, который main перечитал по «Перезагрузить все данные»: очередь
    // запускает именно он, а не случайный список (группа, правка, вкладка)
    window.Main.steamAccounts.onRefreshStorage((event, { requestId, err }) => {
      if (!this.fullRefreshActive || requestId !== this.fullRefreshId) return;
      if (err === undefined) {
        this.fullRefreshPending = true;
        return;
      }
      this.finishFullRefresh();
      this.root.windows.openMiniNotification({ type: "error", text: i18n.t("accounts.errors.reloadList", { error: err }) });
    });
    // Одним действием: реакция на состав строк (см. конструктор) должна увидеть уже запущенную очередь,
    // иначе она запросила бы балансы страницы отдельно
    window.Main.steamAccounts.onGet((event, steamAccounts) => runInAction(() => {
      this.initialSteamAccounts = steamAccounts;

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
      for (const id of Array.from(this.restoredIds)) {
        const account = this.steamAccounts[id];
        // Список, собранный ещё до восстановления: ждём следующий
        if (account?.deleted) continue;
        this.restoredIds.delete(id);
        if (account) this.loadSecondaries(id);
      }
      this.setActivePage(this.activePage);
      // Удалённых ждать нечего: место в очереди обновления свободно
      for (const id of Array.from(this.fullRefreshInFlight)) {
        if (this.steamAccounts[id]) continue;
        delete this.fullRequests[id];
        this.finishFullRefreshItem(id);
      }
    }));
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
    ) => number
  ) {
    // Равные строки — по номеру: сравнения колонок для равных значений возвращают не ноль, и строки
    // прыгали бы на каждом новом списке
    this.sortFunc = (a, b) => {
      const order = func(a, b);
      if (order === 0 || Math.sign(order) === Math.sign(func(b, a))) return a.number - b.number;
      return order;
    };
    this.applySort();
    this.setActivePage(this.activePage);
  }
  applySort() {
    if (!this.sortFunc) return;
    const result: { [id: string]: TableSteamAccountInterface } = {};
    for (const sa of Object.values(this.steamAccounts).sort(this.sortFunc)) result[sa.id] = sa;
    this.steamAccounts = result;
  }
  // Кнопка «Перезагрузить все данные»: main перечитывает аккаунты и входит заново (архивные
  // пропускает), а когда придёт новый список — обновляем данные всех активных аккаунтов очередью.
  reloadAll() {
    if (this.fullRefreshActive) return;
    this.fullRefreshActive = true;
    this.fullRefreshId = ++this.requestSeq;
    window.Main.steamAccounts.refresh(this.fullRefreshId);
  }
  // Сначала аккаунты текущей страницы, потом остальные активные. Архивные не обновляются.
  startFullRefresh() {
    const page = (this.getSteamAccountsByPages()[this.activePage - 1] || []).map((sa) => sa.id);
    const rest = Object.keys(this.steamAccounts).filter((id) => !page.includes(id));
    this.fullRefreshActive = true;
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
      if (!account || account.deleted) {
        // Архивирован или удалён, пока ждал очереди: запроса не будет, пометка «грузится» не нужна
        this.forgetBalance(id);
        continue;
      }
      this.fullRefreshInFlight.add(id);
      this.loadSecondaries(id);
      const run = this.fullRefreshId;
      setTimeout(() => {
        // Срок у места в очереди, а не у запроса: запрос строки мог быть заменён новым
        if (this.fullRefreshId !== run || !this.fullRefreshInFlight.has(id)) return;
        runInAction(() => {
          delete this.fullRequests[id];
          if (this.steamAccounts[id]) this.steamAccounts[id].isLoadSecondary = false;
          if (this.balanceLoads[id]?.state === "loading") this.recordBalanceResult(id, true);
          this.finishFullRefreshItem(id);
        });
      }, FULL_REFRESH_ITEM_TIMEOUT_MS);
    }
    if (this.fullRefreshInFlight.size === 0) this.finishFullRefresh();
  }
  finishFullRefreshItem(id: string) {
    if (!this.fullRefreshInFlight.delete(id)) return;
    this.pumpFullRefresh();
  }
  finishFullRefresh() {
    this.fullRefreshActive = false;
    this.fullRefreshPending = false;
    this.flushAccountErrors();
  }
  // Ошибка одного аккаунта — сразу текстом, нескольких подряд — одной сводкой. Во время полного
  // обновления сводка одна на всё обновление.
  reportAccountError(kind: AccountErrorKind, id: string, err: string, background: boolean = false) {
    const now = Date.now();
    if (!this.accountErrors.length) this.accountErrorsSince = now;
    this.accountErrors.push({ kind, id, err });
    if (this.fullRefreshActive) return;
    // Действие человека показываем сразу (вместе со всем накопленным), фоновое — когда стихнет
    const wait = background
      ? Math.max(0, Math.min(BACKGROUND_SUMMARY_QUIET_MS, this.accountErrorsSince + BACKGROUND_SUMMARY_MAX_MS - now))
      : ERROR_SUMMARY_DELAY_MS;
    if (this.accountErrorsTimer) {
      if (!background && this.accountErrorsAt <= now + wait) return;
      clearTimeout(this.accountErrorsTimer);
    }
    this.accountErrorsAt = now + wait;
    this.accountErrorsTimer = setTimeout(() => this.flushAccountErrors(), wait);
  }
  flushAccountErrors() {
    if (this.accountErrorsTimer) clearTimeout(this.accountErrorsTimer);
    this.accountErrorsTimer = null;
    // Полное обновление началось, пока ждали: всё войдёт в его сводку
    if (this.fullRefreshActive) return;
    // Вход не удался — данные тоже не загрузились: по каждому аккаунту называем одну причину
    const byAccount = new Map<string, { kind: AccountErrorKind; id: string; err: string }>();
    for (const item of this.accountErrors) {
      if (!byAccount.has(item.id) || item.kind === "session") byAccount.set(item.id, item);
    }
    this.accountErrors = [];
    const failed = Array.from(byAccount.values())
      .filter((item) => this.steamAccounts[item.id] && !this.steamAccounts[item.id].deleted);
    if (!failed.length) return;
    const name = (id: string) => `#${this.steamAccounts[id].number} ${this.steamAccounts[id].accountName}`;
    let text: string;
    if (failed.length === 1) {
      const [{ kind, id, err }] = failed;
      text = i18n.t(kind === "session" ? "accounts.errors.refreshSession" : "accounts.errors.loadData", { account: name(id), error: err });
    } else {
      const sessionsOnly = failed.every((item) => item.kind === "session");
      const names = failed.slice(0, ERROR_SUMMARY_NAMES).map((item) => name(item.id)).join(", ");
      const more = failed.length - ERROR_SUMMARY_NAMES;
      text = i18n.t(sessionsOnly ? "accounts.errors.refreshSessionMany" : "accounts.errors.loadDataMany", {
        total: failed.length,
        names: more > 0 ? `${names}, +${more}` : names,
      });
    }
    this.root.windows.openMiniNotification({ type: "error", text });
  }
  restoreAccount(id: string) {
    this.restoredIds.add(id);
    window.Main.steamAccounts.edit(id, { deleted: false });
    window.Main.steamAccounts.get();
  }
  refreshSession(id: string) {
    // Вход уже идёт: второе нажатие ничего не меняет
    if (this.steamAccounts[id].isLogining) return;
    this.steamAccounts[id].isLogining = true;
    window.Main.steamAccounts.refreshSession(id);
  }
  refreshSessionSelected() {
    for (const sa of this.selectedAccounts) {
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
    this.balanceRequests[id] = ++this.requestSeq;
    window.Main.steamAccounts.getChangableSecondary(id, this.balanceRequests[id]);
  }
  loadSecondaries(id: string) {
    this.steamAccounts[id].isLoadSecondary = true;
    // Полное обновление приносит и баланс (одна загрузка /market/): пока оно в пути, отдельный
    // запрос баланса не нужен
    this.startBalanceLoad(id);
    const requestId = ++this.requestSeq;
    this.fullRequests[id] = requestId;
    this.balanceRequests[id] = requestId;
    window.Main.steamAccounts.getSecondary(id, requestId);
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
  // Причина в ячейке баланса (прочерк, значок и подсказка)
  showBalanceError(id: string, err: string) {
    const shown = this.changableSecondaries[id];
    if (!shown || this.routeReloadTimers[id] !== undefined) return;
    this.changableSecondaries[id] = {
      isLoad: true,
      content: { ...shown.content, steam: { ...shown.content?.steam, error: err } },
    } as typeof shown;
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
      const previous = this.steamAccounts;
      this.steamAccounts = {};
      const tableSteamAccounts: TableSteamAccountInterface[] = [];
      const deletedTableSteamAccounts: TableSteamAccountInterface[] = [];

      for (var steamAccount of steamAccounts) {
        const tableSteamAccount: TableSteamAccountInterface = {
          ...steamAccount,
          isSelected: !steamAccount.deleted && (previous[steamAccount.id]?.isSelected ?? false),
          authCode: "not loaded",
          getChangableSecondaryError: null,
          // Список приходит и посреди работы (вкладка, группа, импорт): индикаторы идущих запросов
          // и прошлые ошибки строки остаются
          getSecondaryError: previous[steamAccount.id]?.getSecondaryError ?? null,
          isLoadChangableSecondary: false,
          isLoadSecondary: this.fullRequests[steamAccount.id] !== undefined,
          isLogining: previous[steamAccount.id]?.isLogining ?? false,
        };
        if (!steamAccount.deleted) {
          tableSteamAccounts.push(tableSteamAccount);
        } else {
          deletedTableSteamAccounts.push(tableSteamAccount);
        }
      }
      for (var i of tableSteamAccounts) {
        this.steamAccounts[i.id] = asRow(i);
      }
      for (let sa of tableSteamAccounts) {
        // Ошибка этого запуска показана в ячейке; в списке лежит старый сохранённый баланс
        // (и пока идёт повтор тоже)
        const shown = this.changableSecondaries[sa.id];
        if (this.balanceLoads[sa.id] && this.balanceLoads[sa.id].state !== "done" && shown?.content?.steam?.error) continue;
        this.changableSecondaries[sa.id] = {
          // Ответ на баланс в этом запуске уже был (удачный или с ошибкой): main сохранил его,
          // показываем без нового запроса. Повтор после ошибки — по правилам BALANCE_RETRY_*.
          isLoad: this.balanceLoads[sa.id]?.state === "done" || this.balanceLoads[sa.id]?.state === "failed",
          content: sa.changableSecondary,
        };
      }
      for (var i of deletedTableSteamAccounts) {
        this.steamAccounts[i.id] = asRow(i);
      }
      // Список приходит в порядке хранилища
      this.applySort();
      this.updateAuthCodes();
      this.startAuthCodeTimer();
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
  // Один таймер на всё приложение (SDA-65). Раньше каждый новый список заводил по таймеру на каждый
  // аккаунт и не убирал прежние. Срок считаем каждый раз заново: после сна компьютера setInterval
  // обновлял бы код посреди тридцатисекундного окна, и показанный код был бы уже недействителен.
  startAuthCodeTimer() {
    if (this.authCodeTimer !== null) return;
    this.authCodeTimer = setTimeout(() => {
      this.authCodeTimer = null;
      this.updateAuthCodes();
      this.startAuthCodeTimer();
    }, AUTH_CODE_PERIOD_MS - (Date.now() % AUTH_CODE_PERIOD_MS) + 50);
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
    // Настройки колонок перечитываются при возврате на вкладку: направление сортировки — наше
    const directions = new Map(this.fields.map((f) => [f.type, f.sortDirection]));
    this.fields = fields.map((f) => ({ ...f, sortDirection: directions.get(f.type) ?? f.sortDirection }));
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
  // Строки, которые сейчас можно увидеть: архив, группа, поиск. Вычисляемые значения MobX: пересчёт,
  // только когда изменилось то, от чего они зависят (SDA-65).
  get visibleAccounts(): TableSteamAccountInterface[] {
    const activeGroupId = this.root.groups?.activeGroupId;
    return Object.values(this.steamAccounts).filter((sa) =>
      (!sa.deleted || this.showDeleted) &&
      // Фильтр по активной группе (в навигации выбран пункт группы)
      (!activeGroupId || (!!sa.group && sa.group.id === activeGroupId)) &&
      matchesSteamAccountSearch(sa, this.searchString));
  }
  get pages(): TableSteamAccountInterface[][] {
    const pages: TableSteamAccountInterface[][] = [];
    for (let i = 0; i < this.visibleAccounts.length; i += this.pageSize) {
      pages.push(this.visibleAccounts.slice(i, i + this.pageSize));
    }
    return pages;
  }
  get pageAccounts(): TableSteamAccountInterface[] {
    return this.pages[this.activePage - 1] || [];
  }
  // Единственный источник для массовых действий: только строки, которые человек видит (SDA-65)
  get selectedAccounts(): TableSteamAccountInterface[] {
    return this.pageAccounts.filter((sa) => sa.isSelected && !sa.deleted);
  }
  get isAllSelected(): boolean {
    const selectable = this.pageAccounts.filter((sa) => !sa.deleted);
    return selectable.length > 0 && selectable.every((sa) => sa.isSelected);
  }
  getSteamAccountsByPages() {
    return this.pages;
  }
  // Баланс, который показан в ячейке: ответ этого запуска, а пока его нет — сохранённый. Неизвестный — null.
  balanceOf(id: string): number | null {
    const steam = (this.changableSecondaries[id]?.content ?? this.steamAccounts[id]?.changableSecondary)?.steam;
    return !steam || steam.error || typeof steam.balance !== "number" ? null : steam.balance;
  }
  // Выбранное не должно пережить своё исчезновение с экрана (поиск, группа, страница, архив)
  dropHiddenSelection() {
    const shown = new Set(this.pageAccounts.map((sa) => sa.id));
    for (const sa of Object.values(this.steamAccounts)) {
      if (sa.isSelected && !shown.has(sa.id)) sa.isSelected = false;
    }
  }
  changeShowStatus(status?: boolean) {
    if (status) {
      this.showDeleted = status;
    } else {
      this.showDeleted = !this.showDeleted;
    }
    // Страниц могло стать меньше, а выбранные архивные строки — исчезнуть
    this.setActivePage(this.activePage);
  }
  selectSteamAccount(id: string, isSelected: boolean = true) {
    const steamAccount = this.steamAccounts[id];
    if (steamAccount) steamAccount.isSelected = isSelected;
  }
  selectAllSteamAccounts(isSelected: boolean = true) {
    for (const steamAccount of this.pageAccounts) {
      if (!steamAccount.deleted) steamAccount.isSelected = isSelected;
    }
  }
  updateAuthCodes() {
    for (const sa of Object.values(this.steamAccounts)) {
      if (!sa.deleted) this.updateAuthCode(sa.id);
    }
  }
  freshAuthCode(id: string): string {
    this.updateAuthCode(id);
    return this.authCodes[id];
  }
  updateAuthCode(id: string) {
    // Аккаунт без пригодного shared_secret (импорт неполного файла) кодов не даёт, и ошибка одного
    // не должна оставить без кодов и статусов браузера остальных (SDA-62, SDA-65)
    let code = "";
    try {
      const secret = this.steamAccounts[id].maFile.shared_secret;
      if (isGuardSecret(secret)) code = String(window.Main.guardConnection.getAuthCode(secret));
    } catch (err) {
      console.log(`no Guard code for steam account #${id}: ${err}`);
    }
    this.authCodes[id] = code;
  }
  editSteamAccount(
    id: string,
    newSteamAccount: {
      [K in keyof TableSteamAccountInterface]?: TableSteamAccountInterface[K];
    }
  ) {
    const steamAccount = this.steamAccounts[id];
    if (!steamAccount) throw new Error(i18n.t("accounts.errors.editNotFound", { id }));
    Object.assign(steamAccount, newSteamAccount);
    // Строка могла уйти с экрана вместе со всей страницей (архивирована последняя на ней)
    if ("deleted" in newSteamAccount) this.setActivePage(this.activePage);
    return steamAccount;
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
      // Списка ещё нет — сохранённую страницу не теряем; иначе не дальше последней
      if (this.pages.length) n = Math.max(1, Math.min(n, this.pages.length));
      if (save) {
        window.Main.steamAccounts.setTableOptions({
          activePage: n,
          pageSize: this.pageSize,
        });
        console.log(`set new page size: ${this.pageSize}`);
      }

      this.loadPageBalances(n);
      this.activePage = n;
      // Выбор живёт в пределах страницы; повторная установка той же страницы его не сбрасывает
      this.dropHiddenSelection();
    } catch (err) {
      console.log(`Ошибка при установке страницы ${n}`);
      console.log(err);
    }
  }
  setPageSize(n: number, save: boolean = false) {
    // Сохранённое в файле не проверяется: размер 0 разбивал бы список на страницы бесконечно
    if (!Number.isInteger(n) || n < 1) n = 10;
    if (save)
      window.Main.steamAccounts.setTableOptions({
        activePage: 1,
        pageSize: n,
      });
    this.activePage = 1;
    this.pageSize = n;
    this.dropHiddenSelection();
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

// Неизвестный баланс всегда в конце
export function compareBalances(a: number | null, b: number | null, direction: "UP" | "DOWN"): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "UP" ? b - a : a - b;
}

// Строка таблицы. Наблюдаются только её поля, а maFile, smaFile, прокси и прочее — обычные объекты по
// ссылке: глубокое наблюдение и копирование 136 аккаунтов на каждый символ поиска стоили 0,2 с (SDA-65).
function asRow(account: TableSteamAccountInterface): TableSteamAccountInterface {
  return observable.object(account, {}, { deep: false });
}

// Ответ на последний запрос аккаунта. Ответ без номера принимаем: сравнивать не с чем.
function isLatest(requests: { [id: string]: number }, reply: { id: string; requestId?: number }) {
  return reply.requestId === undefined || requests[reply.id] === reply.requestId;
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

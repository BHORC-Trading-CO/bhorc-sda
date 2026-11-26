import useAccountImage from "../../../../../globalComponents/Images/useAccountImage";
import react, { FC } from "react";
import Table, { Line, Cell } from "../../../../../globalComponents/Table/Table";
import { Tip, CellText } from "../../../../../globalComponents/Table/Cells";
import { KtStatus, MarketStatus, TradeStatus, statusRank, balanceText } from "./AccountStatusBadges";
import Icon from "../../../../../globalComponents/Icon/Icon";
import AvalibleTypes from "../../../../../../electron/interfaces/TableFields/AvalibleFieldTypes";
import store from "../../../../../store/store";
import Field from "../../../../../../electron/interfaces/TableFields/Field";
import Checkbox from "../../../../../globalComponents/Checkbox/Checkbox";
import Button from "../../../../../globalComponents/Button/Button";
import Password from "../../../../../globalComponents/Password/Password";
import { observer, useLocalObservable } from "mobx-react";
import TableSteamAccountInterface from "../../../../../../electron/interfaces/SteamAccount/TableSteamAccountInterface";
import exportAccountFile from "./exportAccountFile";
import { getSteamID64 } from "../../../../../../electron/components/Functions/steamAccountSearch";
import { formatRegistrationDate, isRegistrationDate } from "../../../../../../electron/components/Functions/registrationDate";
import { compareBalances } from "../../../../../store/SteamAccountsTableStore/SteamAccountsTableStore";
import { useTranslation } from "react-i18next";
import EmptyState, { TableWithEmptyState } from "../../../../../globalComponents/EmptyState/EmptyState";
import GuardCode from "./GuardCode/GuardCode";
import "./SteamAccountsTable.css";

const SteamAccountsTableWrapper: FC = () => {
  const fields = store.steamAccountsTable.getFields();
  return <SteamAccountsTable fields={fields} />;
};

const SteamAccountsTable: FC<{ fields: Field[] }> = observer(({ fields }) => {
  const steamAccountsByPage =
    store.steamAccountsTable.getSteamAccountsByPages();
  const empty = steamAccountsByPage.length === 0 ? <SteamAccountsEmptyState /> : null;


  const lines: Line[] = [];
  if (steamAccountsByPage[store.steamAccountsTable.activePage - 1])
    for (var steamAccount of steamAccountsByPage[
      store.steamAccountsTable.activePage - 1
    ]) {
      if (steamAccount.deleted && !store.steamAccountsTable.showDeleted)
        continue;
      lines.push(generateLine(fields, steamAccount));
    }

  return (
    <TableWithEmptyState empty={empty}>
    <Table
      onSelect={(isSelected) => {
        // На пустой таблице страницы нет: selectAll бросал бы на for-of по undefined
        if (empty) return;
        store.steamAccountsTable.selectAllSteamAccounts(isSelected);
      }}
      isSelected={store.steamAccountsTable.isAllSelected}
      fields={fields}
      fieldsTable="steamAccounts"
      lines={lines}
      sortedField={store.steamAccountsTable.sortedField}
      onSort={(fieldType, direction) => {
        store.steamAccountsTable.changeFieldDirection(fieldType, direction);
        switch (fieldType) {
          case AvalibleTypes.number:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              direction === "UP"
                ? a.number < b.number
                  ? 1
                  : -1
                : a.number > b.number
                ? 1
                : -1
            );
          case AvalibleTypes.steamAccountNickname:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              direction === "UP"
                ? a.secondary.nickname < b.secondary.nickname
                  ? 1
                  : -1
                : a.secondary.nickname > b.secondary.nickname
                ? 1
                : -1
            );
          case AvalibleTypes.steamId:
            return store.steamAccountsTable.sortSteamAccounts((a, b) => {
              const aId = getSteamID64(a.maFile);
              const bId = getSteamID64(b.maFile);
              // аккаунты без SteamID всегда в конце
              if (!aId) return 1;
              if (!bId) return -1;
              // SteamID64 — числа одной длины, но сравниваем с учётом длины на всякий случай
              const aGreater = aId.length !== bId.length ? aId.length > bId.length : aId > bId;
              return direction === "UP" ? (aGreater ? -1 : 1) : (aGreater ? 1 : -1);
            });
          case AvalibleTypes.steamAccountBalance:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              compareBalances(store.steamAccountsTable.balanceOf(a.id), store.steamAccountsTable.balanceOf(b.id), direction));
          // Статусы трёхзначные (SDA-31): «неизвестно» (null) сортируется между false и true
          case AvalibleTypes.ktState:
          case AvalibleTypes.tpState:
          case AvalibleTypes.tradeState: {
            const key = fieldType === AvalibleTypes.ktState ? "ktState"
              : fieldType === AvalibleTypes.tpState ? "tpState" : "tradeState";
            return store.steamAccountsTable.sortSteamAccounts((a, b) => {
              const aRank = statusRank(a.secondary[key]);
              const bRank = statusRank(b.secondary[key]);
              return direction === "UP"
                ? aRank < bRank
                  ? 1
                  : -1
                : aRank > bRank
                ? 1
                : -1;
            });
          }
          case AvalibleTypes.steamAccountLevel:
            return store.steamAccountsTable.sortSteamAccounts((a, b) => {
              // Неизвестный уровень (null) — как самый низкий
              const aLevel = a.secondary.level ?? -1;
              const bLevel = b.secondary.level ?? -1;
              return direction === "UP"
                ? aLevel < bLevel
                  ? 1
                  : -1
                : aLevel > bLevel
                ? 1
                : -1;
            });
          case AvalibleTypes.registrationDate:
            return store.steamAccountsTable.sortSteamAccounts((a, b) => {
              // Неизвестная дата всегда в конце. "YYYY-MM-DD" сравнивается как строка.
              // UP — сначала новые аккаунты, DOWN — сначала старые.
              const aDate = isRegistrationDate(a.secondary?.registeredAt) ? a.secondary.registeredAt! : "";
              const bDate = isRegistrationDate(b.secondary?.registeredAt) ? b.secondary.registeredAt! : "";
              if (aDate === bDate) return 0;
              if (!aDate) return 1;
              if (!bDate) return -1;
              return direction === "UP"
                ? aDate < bDate
                  ? 1
                  : -1
                : aDate > bDate
                ? 1
                : -1;
            });
          case AvalibleTypes.steamAccountName:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              direction === "UP"
                ? a.accountName < b.accountName
                  ? 1
                  : -1
                : a.accountName > b.accountName
                ? 1
                : -1
            );
          case AvalibleTypes.steamPassword:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              direction === "UP"
                ? a.password < b.password
                  ? 1
                  : -1
                : a.password > b.password
                ? 1
                : -1
            );
          case AvalibleTypes.linkedProxies:
            return store.steamAccountsTable.sortSteamAccounts((a, b) => {
              // аккаунты без прокси всегда в конце, независимо от направления
              if (!a.proxy) return 1;
              if (!b.proxy) return -1;
              return direction === "UP"
                ? a.proxy.number < b.proxy.number
                  ? 1
                  : -1
                : a.proxy.number > b.proxy.number
                ? 1
                : -1;
            });
          case AvalibleTypes.group:
            return store.steamAccountsTable.sortSteamAccounts((a, b) => {
              // аккаунты без группы всегда в конце
              if (!a.group) return 1;
              if (!b.group) return -1;
              return direction === "UP"
                ? a.group.name < b.group.name
                  ? 1
                  : -1
                : a.group.name > b.group.name
                ? 1
                : -1;
            });
        }
      }}
    ></Table>
    </TableWithEmptyState>
  );
});

// Почему таблица пуста и что с этим сделать. Порядок: поиск, группа, архив, совсем нет аккаунтов.
const SteamAccountsEmptyState: FC = observer(() => {
  const { t } = useTranslation();
  const table = store.steamAccountsTable;
  if (table.searchString !== "") {
    return (
      <EmptyState
        icon="search"
        text={t("accounts.empty.search", { query: table.searchString })}
        action={{ text: t("common.clearSearch"), onClick: () => table.search("") }}
      />
    );
  }
  const activeGroup = store.groups.getActiveGroup();
  if (activeGroup) {
    return (
      <EmptyState
        icon="accounts"
        text={t("accounts.empty.group", { name: activeGroup.name })}
        action={{ text: t("accounts.empty.showAll"), onClick: () => store.groups.setActiveGroup(null) }}
      />
    );
  }
  if (!table.showDeleted && Object.values(table.steamAccounts).some((sa) => sa.deleted)) {
    return (
      <EmptyState
        icon="archive"
        text={t("accounts.empty.archived")}
        action={{ text: t("accounts.panel.showArchived"), onClick: () => table.changeShowStatus() }}
      />
    );
  }
  return (
    <EmptyState
      icon="accounts"
      text={t("accounts.empty.none")}
      action={{ text: t("accounts.panel.add"), primary: true, onClick: () => table.creationForm.open() }}
    />
  );
});

const generateLine = (
  fields: Field[],
  steamAccount: TableSteamAccountInterface
): Line => {
  const line: Line = {
    id: steamAccount.id,
    cells: [],
    deleted: steamAccount.deleted,
    selected: steamAccount.isSelected,
  };

  for (var index in fields) {
    line.cells.push({
      type: fields[index].type,
      jsx: <CellJSX type={fields[index].type} steamAccount={steamAccount} />,
    });
  }
  return line;
};

// Аватар Steam; вместо стандартного «?» Steam (и при ошибке загрузки) — нейтральная заглушка
const Avatar: FC<{ accountId: string, url?: string, routeKey: string }> = ({ accountId, url, routeKey }) => {
  const { t } = useTranslation();
  const { src, onError } = useAccountImage('avatar', accountId, url, routeKey);

  if (!src) {
    return (
      <span
        className="steam-account-avatar steam-account-avatar--placeholder"
        role="img"
        aria-label={t("accounts.table.noAvatar")}
      >
        <Icon name="user" size={14} />
      </span>
    );
  }
  return (
    <img
      src={src}
      className="steam-account-avatar"
      alt={t("fields.steamAccounts.steamAccountAvatar")}
      onError={onError}
    />
  );
};

// Аватар 28 px с чипом уровня Steam (макет main-v2: .ava em). Колонка уровня остаётся как была.
// observer: строка живая, и её поля читаются здесь, а не в ячейке (SDA-65)
const AccountAvatar: FC<{ steamAccount: TableSteamAccountInterface }> = observer(({ steamAccount }) => {
  const { t } = useTranslation();
  if (steamAccount.isLoadSecondary) {
    return (
      <span className="account-avatar">
        <span className="steam-account-avatar steam-account-avatar--placeholder">
          <Icon name="loader" size={14} motion="spinAlways" />
        </span>
      </span>
    );
  }
  const level = steamAccount.secondary?.level;
  const hasLevel = typeof level === "number";
  return (
    <span className="account-avatar" title={hasLevel ? t("accounts.table.level", { level }) : undefined}>
      <Avatar accountId={steamAccount.id} url={steamAccount.secondary?.avatarUrl} routeKey={`${steamAccount.proxyState}:${steamAccount.proxyId}`} />
      {hasLevel ? <span className="account-avatar__level" aria-hidden="true">{level}</span> : null}
    </span>
  );
});

// Загрузка в ячейке: крутящаяся иконка lucide вместо react-loading-icons
const Loading: FC = () => (
  <Icon name="loader" size={14} motion="spinAlways" className="cell-loader" />
);

const CellJSX: FC<{
  type: AvalibleTypes;
  steamAccount: TableSteamAccountInterface;
}> = observer((props) => {
  const { type, steamAccount } = props;
  const { t, i18n } = useTranslation();
  const changableSecondaries =
    store.steamAccountsTable.changableSecondaries[steamAccount.id];
  const browserStatus =
    store.steamAccountsTable.browserStatuses[steamAccount.id];

  switch (type) {
    case AvalibleTypes.mail:
      return steamAccount.mail ? <CellText text={steamAccount.mail} /> : <></>;
    case AvalibleTypes.mailPassword:
      return steamAccount.mailPassword ? (
        <Password password={steamAccount.mailPassword} />
      ) : (
        <span className="cell-muted">{t("common.none")}</span>
      );

    case AvalibleTypes.profileName:
      return steamAccount.profileName ? (
        <CellText text={steamAccount.profileName} />
      ) : (
        <></>
      );
    case AvalibleTypes.steamAccountButtons:
      return (
        <div className="row-actions">
          <Button
            disabled={steamAccount.deleted}
            size="tiny"
            color="grey"
            hoverColor="light-grey"
            view="icon"
            className="row-action"
            testId="row-confirmations"
            icon="shieldCheck"
            onClick={() => {
              window.Main.steamAccounts.openConfirmations({
                id: steamAccount.id,
                steamAccountName: steamAccount.accountName,
              });
            }}
            altText={t("accounts.table.actions.confirmations")}
          />
          <Button
            disabled={steamAccount.deleted}
            isLoad={steamAccount.isLoadSecondary}
            size="tiny"
            color="grey"
            hoverColor="light-grey"
            view="icon"
            className={`row-action${steamAccount.getSecondaryError ? " row-action--warn" : ""}`}
            icon="refresh"
            iconMotion="spin"
            onClick={() => {
              store.steamAccountsTable.loadSecondaries(steamAccount.id);
            }}
            altText={steamAccount.getSecondaryError
              ? t("accounts.table.actions.refreshProfileFailed", { error: steamAccount.getSecondaryError })
              : t("accounts.table.actions.refreshProfile")}
          />
          <Button
            disabled={steamAccount.deleted}
            isLoad={steamAccount.isLogining}
            size="tiny"
            color="grey"
            hoverColor="light-grey"
            view="icon"
            className={`row-action${steamAccount.sessionError ? " row-action--warn" : ""}`}
            icon="logIn"
            onClick={() => {
              store.steamAccountsTable.refreshSession(steamAccount.id);
            }}
            altText={steamAccount.sessionError
              ? t("accounts.table.actions.refreshSessionNeeded", { error: steamAccount.sessionError })
              : t("accounts.table.actions.refreshSession")}
          />
          <Button
            disabled={steamAccount.deleted}
            size="tiny"
            color="grey"
            hoverColor="light-grey"
            view="icon"
            className="row-action"
            icon="file"
            onClick={() => exportAccountFile(steamAccount.id, "maFile")}
            altText={t("accounts.table.actions.saveMaFile")}
          />
        </div>
      );
    // Три состояния: OK / проблема / неизвестно (SDA-31), см. AccountStatusBadges
    case AvalibleTypes.tradeState:
      if (steamAccount.deleted) return <></>;
      if (steamAccount.isLoadSecondary) return <Loading />;
      return <TradeStatus value={steamAccount.secondary?.tradeState} />;
    case AvalibleTypes.ktState:
      if (steamAccount.deleted) return <></>;
      if (steamAccount.isLoadSecondary) return <Loading />;
      return <KtStatus value={steamAccount.secondary?.ktState} />;
    case AvalibleTypes.tpState:
      if (steamAccount.deleted) return <></>;
      if (steamAccount.isLoadSecondary) return <Loading />;
      return <MarketStatus value={steamAccount.secondary?.tpState} />;
    case AvalibleTypes.steamAccountBalance:
      if (steamAccount.deleted) return <></>;

      if (changableSecondaries && changableSecondaries.isLoad) {
        const steam = changableSecondaries.content.steam;
        // Steam явно сказал, что кошелька нет (валюта 0, баланса нет): прочерк без значка (SDA-38)
        if (!steam.error && (steam.balance === null || steam.balance === undefined)) {
          return <span className="cell-muted">—</span>;
        }
        if (changableSecondaries.content.steam.error) {
          // Причину не прячем: прочерк, значок и текст ошибки в подсказке
          return (
            <Tip
              className="cell-warn"
              ariaLabel={t("accounts.table.balanceError")}
              tip={t("accounts.table.balanceErrorTip", {
                error: String(changableSecondaries.content.steam.error),
              })}
            >
              <span className="cell-muted">—</span>
              <Icon name="alert" size={14} />
            </Tip>
          );
        } else {
          return <>{balanceText(steam.balance, steam.currency)}</>;
        }
      } else {
        return <Loading />;
      }
    case AvalibleTypes.steamGuard:
      return (
        <>
          {steamAccount.deleted ? (
            ""
          ) : (
            <GuardCode
              code={store.steamAccountsTable.authCodes[steamAccount.id]}
              getCode={() => store.steamAccountsTable.freshAuthCode(steamAccount.id)}
            />
          )}
        </>
      );
    case AvalibleTypes.steamAccountName:
      return <CellText text={steamAccount.accountName} />;
    case AvalibleTypes.steamPassword:
      return <Password password={steamAccount.password} />;
    case AvalibleTypes.steamAccountNickname:
      return steamAccount.isLoadSecondary ? (
        <Loading />
      ) : (
        <CellText text={steamAccount.secondary.nickname} />
      );
    case AvalibleTypes.steamId: {
      const steamId = getSteamID64(steamAccount.maFile);
      return steamId ? <>{steamId}</> : <span className="cell-muted">—</span>;
    }
    case AvalibleTypes.steamAccountLevel:
      if (steamAccount.isLoadSecondary) return <Loading />;
      // null — уровень неизвестен (SDA-31): прочерк вместо чужого уровня или нуля
      return typeof steamAccount.secondary?.level === "number" ? (
        <>{steamAccount.secondary.level}</>
      ) : (
        <span className="cell-muted">—</span>
      );
    case AvalibleTypes.registrationDate: {
      // Дата не меняется: загруженную показываем и во время обновления, прочерк — неизвестна (SDA-58)
      const registeredAt = formatRegistrationDate(steamAccount.secondary?.registeredAt, i18n.language);
      if (registeredAt) return <>{registeredAt}</>;
      if (steamAccount.isLoadSecondary) return <Loading />;
      return <span className="cell-muted" title={t("accounts.table.registrationDateUnknown")}>—</span>;
    }
    case AvalibleTypes.steamAccountAvatar:
      return <AccountAvatar steamAccount={steamAccount} />;
    case AvalibleTypes.linkedProxies:
      // Состояния SDA-21: missing — прокси удалён, соединения заблокированы (красный);
      // привязан — адрес моноширинным с зелёной точкой; нет прокси — серая точка.
      if (steamAccount.proxyState === "missing") {
        return (
          <span className="proxy-cell proxy-cell--missing" title={t("accounts.table.proxyMissingHint")}>
            <span className="proxy-cell__dot" aria-hidden="true" />
            {t("accounts.table.proxyMissing")}
          </span>
        );
      }
      if (steamAccount.proxy) {
        const address = `${steamAccount.proxy.host}:${steamAccount.proxy.port}`;
        return (
          <span className="proxy-cell proxy-cell--ok">
            <span className="proxy-cell__dot" aria-hidden="true" />
            <CellText text={`(#${steamAccount.proxy.number}) ${address}`} className="proxy-cell__address">
              <span className="cell-muted">(#{steamAccount.proxy.number})</span>{" "}
              {address}
            </CellText>
          </span>
        );
      } else {
        return (
          <span className="proxy-cell proxy-cell--none">
            <span className="proxy-cell__dot" aria-hidden="true" />
            <span className="cell-muted">{t("common.none")}</span>
          </span>
        );
      }
    case AvalibleTypes.group:
      return steamAccount.group ? (
        <CellText text={steamAccount.group.name} className="group-pill" />
      ) : (
        <span className="cell-muted">—</span>
      );
    case AvalibleTypes.checkbox:
      if (steamAccount.deleted) {
        return (
          <Checkbox
            isChecked={false}
            disabled={true}
            onChange={(isChecked) => {}}
          />
        );
      }
      return (
        <Checkbox
          isChecked={steamAccount.isSelected}
          ariaLabel={t("accounts.table.selectAccount", { number: steamAccount.number })}
          onChange={(isChecked) => {
            store.steamAccountsTable.selectSteamAccount(
              steamAccount.id,
              isChecked
            );
          }}
        />
      );
    case AvalibleTypes.number:
      return <>{steamAccount.number}</>;
    case AvalibleTypes.exportButton:
      return (
        <div>
          <Button
            size="small"
            color="grey"
            hoverColor="light-grey"
            view="icon"
            className="row-action"
            testId="row-export"
            icon="download"
            onClick={() => exportAccountFile(steamAccount.id, "smaFile")}
            altText={t("accounts.table.actions.exportSmaFile")}
          />
        </div>
      );
    case AvalibleTypes.startButton:
      switch (browserStatus) {
        case "working":
          // Браузер запущен: жёлтая метка с пульсирующей точкой, рядом Стоп и Фокус (как раньше)
          return (
            <div className="browser-cell">
              <span className="browser-btn browser-btn--running" role="status">
                <span className="browser-btn__dot sda-pulse" aria-hidden="true" />
                {t("accounts.table.browser.running")}
              </span>
              <Tip tip={t("accounts.table.browser.stopHint")}>
                <button
                  type="button"
                  className="browser-stop-btn"
                  data-testid="row-browser-stop"
                  aria-label={t("accounts.table.browser.stop")}
                  onClick={() => {
                    window.Main.steamAccounts.stopBrowser(steamAccount.id);
                  }}
                >
                  <Icon name="square" size={13} motion="pop" />
                </button>
              </Tip>
              <Button
                disabled={steamAccount.deleted}
                size="tiny"
                color="grey"
                hoverColor="light-grey"
                view="icon"
                className="row-action"
                icon="focus"
                onClick={() => {
                  window.Main.steamAccounts.focusBrowser(steamAccount.id);
                }}
                altText={t("accounts.table.actions.focusBrowser")}
              />
            </div>
          );
        case "notworking":
          return (
            <div className="browser-cell">
              <Tip tip={t("accounts.table.browser.startHint")}>
                <button
                  type="button"
                  className="browser-btn browser-btn--start"
                  data-testid="row-browser-start"
                  onClick={() => {
                    window.Main.steamAccounts.startBrowser(steamAccount.id);
                  }}
                >
                  <Icon name="play" size={13} motion="pop" />
                  {t("accounts.table.browser.start")}
                </button>
              </Tip>
            </div>
          );
        default:
          // Статус неизвестен. У архивного аккаунта его не запрашивают, и загрузка крутилась
          // вечно: прячем только её. Известные состояния (в т.ч. STOP у браузера, который
          // работал до архивации) остаются, как и раньше.
          if (steamAccount.deleted) return <></>;
          return (
            <Tip tip={t("accounts.table.browser.checking")}>
              <span
                className="browser-btn browser-btn--checking"
                role="img"
                aria-label={t("accounts.table.browser.checking")}
              >
                <Icon name="loader" size={13} motion="spinAlways" />
              </span>
            </Tip>
          );
      }

    case AvalibleTypes.editingButton:
      if (steamAccount.deleted) {
        return (
          <Button
            size="small"
            color="grey"
            hoverColor="light-grey"
            view="icon"
            className="row-action"
            testId="row-restore"
            icon="archiveRestore"
            onClick={() => {
              store.steamAccountsTable.restoreAccount(steamAccount.id);
            }}
            altText={t("accounts.table.actions.restore")}
          />
        );
      } else {
        return (
          <Button
            size="small"
            color="grey"
            hoverColor="light-grey"
            view="icon"
            className="row-action"
            testId="row-edit"
            icon="pencil"
            onClick={() => {
              store.steamAccountsTable.editingForm.open(steamAccount);
            }}
            altText={t("accounts.table.actions.edit")}
          />
        );
      }
    case AvalibleTypes.deleteButton:
      return (
        <Button
          size="small"
          color="grey"
          hoverColor="danger"
          view="icon"
          className="row-action"
          testId="row-delete"
          icon="trash"
          altText={t(
            steamAccount.deleted
              ? "accounts.table.actions.deletePermanently"
              : "accounts.table.actions.archive"
          )}
          onClick={() => {
            if (steamAccount.deleted) {
              store.windows.prompt({
                type: "question",
                title: t("accounts.delete.permanentTitle", { number: steamAccount.number }),
                text: t("common.irreversible"),
                acceptButtonText: t("common.buttons.deleteIt"),
                cancelButtonText: t("prompt.cancel"),
                cb: () => {
                  window.Main.steamAccounts.delete(steamAccount.id);
                },
              });
            } else {
              store.windows.prompt({
                type: "question",
                title: t("accounts.delete.archiveTitle", { number: steamAccount.number }),
                text: t("accounts.delete.archiveHint"),
                acceptButtonText: t("common.buttons.archiveIt"),
                cancelButtonText: t("prompt.cancel"),
                cb: () => {
                  store.steamAccountsTable.editSteamAccount(steamAccount.id, {
                    deleted: true,
                  });
                  window.Main.steamAccounts.edit(
                    steamAccount.id,
                    { deleted: true }
                  );
                  //window.Main.steamAccounts.get();
                },
              });
            }
          }}
        />
      );
    default:
      return <></>;
  }
});

export default SteamAccountsTableWrapper;

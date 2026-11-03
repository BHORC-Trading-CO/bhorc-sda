import sanitizeAvatarUrl from "../../../../../../electron/components/Functions/sanitizeAvatarUrl";
import react, { FC, useEffect } from "react";
import Table, { Line, Cell } from "../../../../../globalComponents/Table/Table";
import AvalibleTypes from "../../../../../../electron/interfaces/TableFields/AvalibleFieldTypes";
import store from "../../../../../store/store";
import Field from "../../../../../../electron/interfaces/TableFields/Field";
import Checkbox from "../../../../../globalComponents/Checkbox/Checkbox";
import Button from "../../../../../globalComponents/Button/Button";
import Password from "../../../../../globalComponents/Password/Password";
import { observer, useLocalObservable } from "mobx-react";
import TableSteamAccountInterface from "../../../../../../electron/interfaces/SteamAccount/TableSteamAccountInterface";
import convertMaFileToStr from "../../../../../../electron/components/Functions/converMaFileToStr";
import { getSteamID64 } from "../../../../../../electron/components/Functions/steamAccountSearch";
import Guard from "../../../components/Guard/Guard";
import LoadingIcons from "react-loading-icons";
import ReactTooltip from "react-tooltip";
import uuid from "react-uuid";
import { toJS } from "mobx";
import { useTranslation } from "react-i18next";

const SteamAccountsTableWrapper: FC = () => {
  const fields = store.steamAccountsTable.getFields();
  return <SteamAccountsTable fields={fields} />;
};

const SteamAccountsTable: FC<{ fields: Field[] }> = observer(({ fields }) => {
  const steamAccountsByPage =
    store.steamAccountsTable.getSteamAccountsByPages();


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
    <Table
      onSelect={(isSelected) => {
        store.steamAccountsTable.selectAllSteamAccounts(isSelected);
      }}
      isSelected={store.steamAccountsTable.isAllSelected}
      fields={fields}
      fieldsTable="steamAccounts"
      lines={lines}
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
              direction === "UP"
                ? a.changableSecondary.steam.balance! <
                  b.changableSecondary.steam.balance!
                  ? 1
                  : -1
                : a.changableSecondary.steam.balance! >
                  b.changableSecondary.steam.balance!
                ? 1
                : -1
            );
          case AvalibleTypes.ktState:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              direction === "UP"
                ? a.secondary.ktState < b.secondary.ktState
                  ? 1
                  : -1
                : a.secondary.ktState > b.secondary.ktState
                ? 1
                : -1
            );
          case AvalibleTypes.tpState:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              direction === "UP"
                ? a.secondary.tpState < b.secondary.tpState
                  ? 1
                  : -1
                : a.secondary.tpState > b.secondary.tpState
                ? 1
                : -1
            );
          case AvalibleTypes.tradeState:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              direction === "UP"
                ? a.secondary.tradeState < b.secondary.tradeState
                  ? 1
                  : -1
                : a.secondary.tradeState > b.secondary.tradeState
                ? 1
                : -1
            );
          case AvalibleTypes.steamAccountLevel:
            return store.steamAccountsTable.sortSteamAccounts((a, b) =>
              direction === "UP"
                ? a.secondary.level < b.secondary.level
                  ? 1
                  : -1
                : a.secondary.level > b.secondary.level
                ? 1
                : -1
            );
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
  );
});

const generateLine = (
  fields: Field[],
  steamAccount: TableSteamAccountInterface
): Line => {
  const line: Line = { cells: [], deleted: steamAccount.deleted };

  for (var index in fields) {
    line.cells.push({
      type: fields[index].type,
      jsx: <CellJSX type={fields[index].type} steamAccount={steamAccount} />,
    });
  }
  return line;
};

const CellJSX: FC<{
  type: AvalibleTypes;
  steamAccount: TableSteamAccountInterface;
}> = observer((props) => {
  const { type, steamAccount } = props;
  const { t } = useTranslation();
  const changableSecondaries =
    store.steamAccountsTable.changableSecondaries[steamAccount.id];
  const browserStatus =
    store.steamAccountsTable.browserStatuses[steamAccount.id];

  switch (type) {
    case AvalibleTypes.mail:
      return <>{steamAccount.mail ? steamAccount.mail : ""}</>;
    case AvalibleTypes.mailPassword:
      return steamAccount.mailPassword ? (
        <Password password={steamAccount.mailPassword} />
      ) : (
        <>{t("common.none")}</>
      );

    case AvalibleTypes.profileName:
      return <>{steamAccount.profileName ? steamAccount.profileName : ""}</>;
    case AvalibleTypes.steamAccountButtons:
      return (
        <div
          style={{
            display: "flex",
          }}
        >
          <Button
            disabled={steamAccount.deleted}
            size="tiny"
            color="grey"
            hoverColor="dark-pink"
            view="icon"
            style={{ marginRight: "5px" }}
            img="./assets/img/Confirm.svg"
            hoverImg="./assets/img/confirm_hov.svg"
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
            hoverColor="dark-pink"
            view="icon"
            style={{ marginRight: "5px" }}
            img="./assets/img/MiniRefresh.svg"
            hoverImg="./assets/img/MiniRefreshHover.svg"
            onClick={() => {
              store.steamAccountsTable.loadSecondaries(steamAccount.id);
            }}
            altText={t("accounts.table.actions.refreshProfile")}
          />
          <Button
            disabled={steamAccount.deleted}
            isLoad={steamAccount.isLogining}
            size="tiny"
            color="grey"
            hoverColor="dark-pink"
            view="icon"
            style={{ marginRight: "5px" }}
            img="./assets/img/RefreshSession.svg"
            hoverImg="./assets/img/RefreshSessionHover.svg"
            onClick={() => {
              store.steamAccountsTable.refreshSession(steamAccount.id);
            }}
            altText={t("accounts.table.actions.refreshSession")}
          />
          <Button
            disabled={steamAccount.deleted}
            size="tiny"
            color="grey"
            hoverColor="dark-pink"
            view="icon"
            style={{ marginRight: "5px" }}
            img="./assets/img/MiniMaFile.svg"
            hoverImg="./assets/img/MiniMaFileHover.svg"
            onClick={() => {
              const el = document.getElementById(
                `exportMaFile${steamAccount.id}`
              );
              el?.click();
            }}
            altText={t("accounts.table.actions.saveMaFile")}
          />

          <a
            style={{ display: "none" }}
            id={`exportMaFile${steamAccount.id}`}
            href={
              "data:text/json;charset=utf-8," +
              encodeURIComponent(
                convertMaFileToStr(steamAccount.smaFile.maFile)
              )
            }
            download={`${steamAccount.maFile.Session.SteamID}.maFile`}
          ></a>
        </div>
      );
    case AvalibleTypes.tradeState:
      if (steamAccount.deleted) return <></>;
      return (
        <>
          {steamAccount.isLoadSecondary ? (
            <div>
              <LoadingIcons.ThreeDots className="micro-download" />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingRight: "30px",
              }}
            >
              {steamAccount.secondary.tradeState ? (
                <img src="./assets/img/okStatus.svg" alt="" />
              ) : (
                <img src="./assets/img/noStatus.svg" />
              )}
            </div>
          )}
        </>
      );
    case AvalibleTypes.ktState:
      if (steamAccount.deleted) return <></>;
      return (
        <>
          {steamAccount.isLoadSecondary ? (
            <div>
              <LoadingIcons.ThreeDots className="micro-download" />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingRight: "25px",
              }}
            >
              {steamAccount.secondary.ktState ? (
                <img src="./assets/img/ktStatus.svg" />
              ) : (
                <img src="./assets/img/okStatus.svg" />
              )}
            </div>
          )}
        </>
      );
    case AvalibleTypes.tpState:
      if (steamAccount.deleted) return <></>;
      return (
        <>
          {steamAccount.isLoadSecondary ? (
            <div>
              <LoadingIcons.ThreeDots className="micro-download" />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingRight: "25px",
              }}
            >
              {steamAccount.secondary.tpState ? (
                <img src="./assets/img/okStatus.svg" />
              ) : (
                <img src="./assets/img/noStatus.svg" />
              )}
            </div>
          )}
        </>
      );
    case AvalibleTypes.steamAccountBalance:
      if (steamAccount.deleted) return <></>;

      if (changableSecondaries.isLoad) {
        const uniqueId = uuid();
        if (changableSecondaries.content.steam.error) {
          return (
            <div data-tip="React-tooltip" data-for={uniqueId}>
              {t("accounts.table.balanceError")}
              <ReactTooltip
                place="top"
                type="dark"
                effect="float"
                id={uniqueId}
              >
                <div className="alt-text-container">
                  {String(changableSecondaries.content.steam.error)}
                </div>
              </ReactTooltip>
            </div>
          );
        } else {
          return (
            <>
              {changableSecondaries.content.steam.balance}
              {changableSecondaries.content.steam.currency}
            </>
          );
        }
      } else {
        return (
          <div>
            <LoadingIcons.ThreeDots className="micro-download" />
          </div>
        );
      }
    case AvalibleTypes.steamGuard:
      return (
        <>
          {steamAccount.deleted ? (
            ""
          ) : (
            <Guard code={store.steamAccountsTable.authCodes[steamAccount.id]} />
          )}
        </>
      );
    case AvalibleTypes.steamAccountName:
      return <>{steamAccount.accountName}</>;
    case AvalibleTypes.steamPassword:
      return <Password password={steamAccount.password} />;
    case AvalibleTypes.steamAccountNickname:
      return (
        <>
          {steamAccount.isLoadSecondary ? (
            <LoadingIcons.ThreeDots className="micro-download" />
          ) : (
            steamAccount.secondary.nickname
          )}
        </>
      );
    case AvalibleTypes.steamId:
      return <>{getSteamID64(steamAccount.maFile) || "—"}</>;
    case AvalibleTypes.steamAccountLevel:
      return (
        <>
          {steamAccount.isLoadSecondary ? (
            <LoadingIcons.ThreeDots className="micro-download" />
          ) : (
            steamAccount.secondary.level
          )}
        </>
      );
    case AvalibleTypes.steamAccountAvatar:
      return (
        <>
          {steamAccount.isLoadSecondary ? (
            <div className="steam-account-avatar">
              <LoadingIcons.ThreeDots className="micro-download" />
            </div>
          ) : (
            <img
              src={sanitizeAvatarUrl(steamAccount.secondary?.avatarUrl)}
              className="steam-account-avatar"
              style={{ backgroundColor: "black" }}
            />
          )}
        </>
      );
    case AvalibleTypes.linkedProxies:
      if (steamAccount.proxy) {
        return (
          <>
            (#{steamAccount.proxy.number}) {steamAccount.proxy.host}:
            {steamAccount.proxy.port}
          </>
        );
      } else {
        return <>{t("common.none")}</>;
      }
    case AvalibleTypes.group:
      return <>{steamAccount.group ? steamAccount.group.name : "—"}</>;
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
            img="./assets/img/Export.svg"
            onClick={() => {
              const el = document.getElementById(
                `exportSmaFile${steamAccount.id}`
              );
              el?.click();
            }}
            altText={t("accounts.table.actions.exportSmaFile")}
          />
          <a
            style={{ display: "none" }}
            id={`exportSmaFile${steamAccount.id}`}
            href={
              "data:text/json;charset=utf-8," +
              encodeURIComponent(
                JSON.stringify({
                  ...steamAccount.smaFile,
                  // round-trip: вкладываем привязанный прокси (только setup-поля, без локальных id/number/deleted)
                  proxy: steamAccount.proxy
                    ? {
                        host: steamAccount.proxy.host,
                        port: steamAccount.proxy.port,
                        username: steamAccount.proxy.username,
                        password: steamAccount.proxy.password,
                      }
                    : undefined,
                })
              )
            }
            download={`${steamAccount.accountName}.smaFile`}
          ></a>
        </div>
      );
    case AvalibleTypes.startButton:
      switch (browserStatus) {
        case "working":
          return (
            <div style={{ display: "flex" }}>
              <div
                className="browser-btn stop-browser-btn"
                onClick={() => {
                  window.Main.steamAccounts.stopBrowser(steamAccount.id);
                }}
              >
                STOP
              </div>
              <Button
                disabled={steamAccount.deleted}
                size="tiny"
                color="grey"
                hoverColor="dark-pink"
                view="icon"
                style={{ marginRight: "5px" }}
                img="./assets/img/focus.svg"
                onClick={() => {
                  window.Main.steamAccounts.focusBrowser(steamAccount.id);
                }}
                altText={t("accounts.table.actions.focusBrowser")}
              />
            </div>
          );
        case "notworking":
          return (
            <div>
              <div
                className="browser-btn start-browser-btn"
                onClick={() => {
                  window.Main.steamAccounts.startBrowser(steamAccount.id);
                }}
              >
                START
              </div>
            </div>
          );
        default:
          return (
            <div className="browser-btn download-browser-btn">
              <LoadingIcons.Bars
                style={{ width: "20px", height: "20px", marginTop: "3px" }}
              />
            </div>
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
            img="./assets/img/restoreProfile.svg"
            onClick={() => {
              //store.steamAccountsTable.editSteamAccount(steamAccount.id, { deleted: false });
              window.Main.steamAccounts.edit(
                steamAccount.id,
                { deleted: false },
                { proxyId: null }
              );
              window.Main.steamAccounts.get();
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
            img="./assets/img/Edit.svg"
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
          hoverColor="light-grey"
          view="icon"
          img="./assets/img/Trash.svg"
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
                text: t("common.archiveHint"),
                acceptButtonText: t("common.buttons.archiveIt"),
                cancelButtonText: t("prompt.cancel"),
                cb: () => {
                  store.steamAccountsTable.editSteamAccount(steamAccount.id, {
                    deleted: true,
                  });
                  window.Main.steamAccounts.edit(
                    steamAccount.id,
                    { deleted: true },
                    { proxyId: null }
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

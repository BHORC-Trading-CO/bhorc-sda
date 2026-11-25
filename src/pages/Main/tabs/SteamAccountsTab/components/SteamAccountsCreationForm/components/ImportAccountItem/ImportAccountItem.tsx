import React, { useState } from "react";
import SmaFileInterface from "../../../../../../../../../electron/interfaces/SteamAccount/SmaFileInterface";
import MaFile from "../../../../../../../../globalComponents/MaFile/MaFile";
import "./ImportAccountItem.css";
import ProxyItem from "./ProxyItem";
import store from "../../../../../../../../store/store";
import { observer } from "mobx-react";
import Button from "../../../../../../../../globalComponents/Button/Button";
import Icon from "../../../../../../../../globalComponents/Icon/Icon";
import { useTranslation } from "react-i18next";

const ImportAccountItem = observer(
  (props: {
    smaFile: SmaFileInterface;
    proxyId: string | null;
    noProxy?: boolean;
    tempId: string;
  }) => {
    const content = store.steamAccountsTable.creationForm.getContent();
    const { smaFile, proxyId, noProxy, tempId } = props;
    const [isMaFileOpen, setIsMaFileOpen] = useState(false);
    const [isProxyOpen, setIsProxyOpen] = useState(false);
    const [isSessionOpen, setIsSessionOpen] = useState(false);
    const { t } = useTranslation();
    // Показываем ровно то, что уйдёт в main: отдельная копия выбора сбрасывалась и расходилась с ним
    const activeProxy = proxyId ? store.proxiesTable.getProxies().find((proxy) => proxy.id === proxyId) : null;
    const choose = (choice: { proxyId: string | null; noProxy: boolean }) => {
      store.steamAccountsTable.creationForm.editContent({
        importedAccounts: content.importedAccounts.map((account) =>
          account.tempId === tempId ? { ...account, ...choice } : account
        ),
      });
      setIsProxyOpen(false);
    };

    return (
      <div className="imported-steam-account-item__container">
        <div className={`imported-steam-account-item text-white-medium${isMaFileOpen || isProxyOpen ? " imported-steam-account-item_open" : ""}`}>
          <div className="imported-steam-account-cell imported-steam-account-avatar-container">
            {/* Аватар импортируемого аккаунта не грузим: локальная заглушка. */}
            <span className="imported-steam-account-avatar" aria-hidden="true">
              <Icon name="user" />
            </span>
          </div>
          <div className="imported-steam-account-cell" title={smaFile.accountName}>
            <span className="imported-steam-account-cell__text">{smaFile.accountName}</span>
          </div>
          <div className="imported-steam-account-cell" title={smaFile.secondary.nickname}>
            <span className="imported-steam-account-cell__text">{smaFile.secondary.nickname}</span>
          </div>
          <div className="imported-steam-account-cell">
            <button
              type="button"
              className="proxy-item-button-expand"
              aria-label={t("accounts.import.pickProxy")}
              aria-expanded={isProxyOpen}
              title={t("accounts.import.pickProxy")}
              onClick={() => {
                setIsProxyOpen((isOpen) => !isOpen);
                setIsMaFileOpen(false);
              }}
            >
              <Icon name="plus" size={14} motion="pop" />
            </button>
            <span className="imported-steam-account-cell__text">
              {activeProxy
                ? `#${proxyId} ${activeProxy.host} : ${activeProxy.port}`
                : smaFile.proxy && !noProxy
                ? `${smaFile.proxy.host} : ${smaFile.proxy.port}`
                : smaFile.proxyMissing && !noProxy
                ? <span style={{ color: "var(--sda-danger)" }}>{t("accounts.table.proxyMissing")}</span>
                : <span className="imported-steam-account-cell__muted">{t("proxyBlock.noProxy")}</span>}
            </span>
          </div>
          <div className="imported-steam-account-cell-button">
            <button
              type="button"
              aria-expanded={isMaFileOpen}
              onClick={() => {
                setIsProxyOpen(false);
                setIsMaFileOpen((isOpen) => !isOpen);
              }}
              className="imported-steam-account-button text-white-medium"
            >
              {t("accounts.import.view")}
              <Icon name={isMaFileOpen ? "chevronUp" : "chevronDown"} />
            </button>
          </div>
          <div className="imported-steam-account-cell-button">
            <Button
              size="tiny"
              icon="trash"
              view="icon"
              color="grey"
              hoverColor="light-grey"
              altText={t("accounts.import.remove")}
              onClick={()=>{
                const index = content.importedAccounts.findIndex(sa=>sa.tempId===tempId);
                if (index >= 0){
                  content.importedAccounts = [...content.importedAccounts.slice(0, index), ...content.importedAccounts.slice(index + 1, content.importedAccounts.length)];
                  store.steamAccountsTable.creationForm.editContent({
                    importedAccounts: [...content.importedAccounts],
                  });
                }
                console.log(index);
              }}
            />
          </div>
        </div>
        {isMaFileOpen ? <MaFile maFile={smaFile.maFile}></MaFile> : <></>}
        {isProxyOpen ? (
          <>
            <Button
              size="small"
              text={t("proxyBlock.noProxy")}
              color="grey"
              hoverColor="light-grey"
              onClick={() => choose({ proxyId: null, noProxy: true })}
            />
            <ProxyItem onSelect={(newProxy) => choose({ proxyId: newProxy.id, noProxy: false })} />
          </>
        ) : (
          <></>
        )}
      </div>
    );
  }
);

export default ImportAccountItem;

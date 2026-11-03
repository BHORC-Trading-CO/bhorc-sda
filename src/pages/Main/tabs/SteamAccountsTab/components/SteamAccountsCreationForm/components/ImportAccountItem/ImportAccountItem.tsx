import sanitizeAvatarUrl from "../../../../../../../../../electron/components/Functions/sanitizeAvatarUrl";
import React, { useState } from "react";
import TableProxyInterface from "../../../../../../../../../electron/interfaces/Proxy/TableProxyInterface";
import SmaFileInterface from "../../../../../../../../../electron/interfaces/SteamAccount/SmaFileInterface";
import MaFile from "../../../../../../../../globalComponents/MaFile/MaFile";
import "./ImportAccountItem.css";
import ProxyItem from "./ProxyItem";
import store from "../../../../../../../../store/store";
import { observer } from "mobx-react";
import Button from "../../../../../../../../globalComponents/Button/Button";
import { useTranslation } from "react-i18next";

const ImportAccountItem = observer(
  (props: {
    smaFile: SmaFileInterface;
    proxyId: string | null;
    tempId: string;
  }) => {
    const content = store.steamAccountsTable.creationForm.getContent();
    const { smaFile, proxyId, tempId } = props;
    const [isMaFileOpen, setIsMaFileOpen] = useState(false);
    const [isProxyOpen, setIsProxyOpen] = useState(false);
    const [activeProxy, setActiveProxy] = useState<TableProxyInterface | null>(
      null
    );
    const [isSessionOpen, setIsSessionOpen] = useState(false);
    const { t } = useTranslation();

    return (
      <div className="imported-steam-account-item__container">
        <div className={`imported-steam-account-item text-white-medium${isMaFileOpen || isProxyOpen ? " imported-steam-account-item_open" : ""}`}>
          <div className="imported-steam-account-cell imported-steam-account-avatar-container">
            <img
              src={sanitizeAvatarUrl(smaFile.secondary?.avatarUrl)}
              className="imported-steam-account-avatar"
              alt=""
            ></img>
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
                setActiveProxy(null);
                setIsMaFileOpen(false);
              }}
            >
              <img src="./assets/img/AddNewAccount.svg" alt=""></img>
            </button>
            <span className="imported-steam-account-cell__text">
              {activeProxy
                ? `#${proxyId} ${activeProxy.host} : ${activeProxy.port}`
                : smaFile.proxy
                ? `${smaFile.proxy.host} : ${smaFile.proxy.port}`
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
              <img
                src="./assets/img/ArrowDown.svg"
                alt=""
                style={{
                  transform: isMaFileOpen ? "rotate(180deg)" : "",
                }}
              ></img>
            </button>
          </div>
          <div className="imported-steam-account-cell-button">
            <Button
              size="tiny"
              img="./assets/img/Trash.svg"
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
          <ProxyItem
            onSelect={(newProxy) => {
              for (var i in content.importedAccounts) {
                if (content.importedAccounts[i].tempId === tempId)
                  content.importedAccounts[i].proxyId = newProxy.id;
              }
              store.steamAccountsTable.creationForm.editContent({
                importedAccounts: [...content.importedAccounts],
              });
              setActiveProxy(newProxy);
              setIsProxyOpen(false);
            }}
          />
        ) : (
          <></>
        )}
      </div>
    );
  }
);

export default ImportAccountItem;

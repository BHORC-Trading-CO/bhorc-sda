import { FC } from "react";
import "./SavedProxies.css";
import SavedProxiesItem from "./SavedProxiesItem/SavedProxiesItem";
import Password from "../../../../../../../globalComponents/Password/Password";
import TableProxyInterface from "../../../../../../../../electron/interfaces/Proxy/TableProxyInterface";
import store from "../../../../../../../store/store";
import Button from "../../../../../../../globalComponents/Button/Button";
import { observer } from "mobx-react";
import { Trans, useTranslation } from "react-i18next";

const SavedProxiesBlock: FC<{
  proxies: TableProxyInterface[],
  activeId: string | null,
  onChange: (newActiveId: string | null) => void
}> = observer(({ proxies, activeId, onChange }) => {
  const { t } = useTranslation();
  const activeProxy = activeId ? proxies.filter(p => p.id === activeId)[0] : null;
  return (
    <div className="saved-proxies__container">
      <div className="saved-proxies-title text-grey-medium">
        <div className="saved-proxies-title-cell">№</div>
        <div className="saved-proxies-title-cell">{t("columns.host")}</div>
        <div className="saved-proxies-title-cell">{t("columns.port")}</div>
        <div className="saved-proxies-title-cell">{t("columns.steamAccounts")}</div>
        <div className="saved-proxies-title-cell"></div>
      </div>
      <div className="saved-proxies" role="listbox" aria-label={t("proxyBlock.savedProxy")}>
        {proxies.map((proxy) => {
          if (proxy.deleted) return <></>;
          return <SavedProxiesItem
            key={proxy.id}
            proxy={proxy}
            isActive={proxy.id === activeId}
            onClick={(proxyId) => {
              if (proxyId === activeId) {
                return onChange(null);
              }
              onChange(proxyId);
            }} />
        })}
      </div>
      <div className="proxy-item__container">
        {
          activeProxy ?
            <>
              <div className="saved-proxies-selected-title">{t("proxyBlock.selectedProxy")}</div>
              <div className="proxy-table proxy-table_in-form">
                <div className="proxy-table-header text-grey-medium">
                  <div className="proxy-table-header-cell proxy-table-cell_number">№</div>
                  <div className="proxy-table-header-cell">{t("columns.host")}</div>
                  <div className="proxy-table-header-cell">{t("columns.port")}</div>
                  <div className="proxy-table-header-cell">{t("columns.login")}</div>
                  <div className="proxy-table-header-cell">{t("columns.password")}</div>
                  <div className="proxy-table-header-cell">{t("proxyBlock.test")}</div>
                </div>
                <div className="proxy-item__container">
                  <div className="proxy-item text-white-medium">
                    <div className="proxy-item-row">
                      <div className="proxy-item-cell proxy-table-cell_number">{activeProxy.number}</div>
                      <div className="proxy-item-cell" title={activeProxy.host}>{activeProxy.host}</div>
                      <div className="proxy-item-cell">{activeProxy.port}</div>
                      <div className="proxy-item-cell"><Password style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }} password={activeProxy.username} /></div>
                      <div className="proxy-item-cell"><Password style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }} password={activeProxy.password} /></div>
                      <div className="proxy-item-cell"><Button onClick={() => {
                        store.proxiesTable.testEditingProxy(activeProxy);
                      }} className="proxy-test-button" isLoad={store.proxiesTable.isTestingEditingProxy} size="small" text={t("proxyBlock.runTest")} color="grey" hoverColor="light-grey" /></div>
                    </div>
                  </div>
                </div>
              </div>
            </>
            :
            <div className='info-block sda-callout'>
              <div>
                <Trans i18nKey="proxyBlock.notSet" components={{ br: <br /> }} />
              </div>
            </div>
        }
      </div>
    </div>
  );
});

export default SavedProxiesBlock;
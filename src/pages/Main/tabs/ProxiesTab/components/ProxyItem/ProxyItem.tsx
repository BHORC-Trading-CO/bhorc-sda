import React, { useEffect, useState } from "react";
import store from "../../../../../../store/store";
import AccountItem from "../AccountItem/AccountItem";
import ProxySetupInterface from '../../../../../../../electron/interfaces/Proxy/ProxySetupInterface';
import "./ProxyItem.css";
import { observer } from "mobx-react-lite";
import { ProxyTestButton } from "../ProxyActionButton";
import Icon from "../../../../../../globalComponents/Icon/Icon";
import { useTranslation } from "react-i18next";

const ProxyItem = observer((props: {
  proxyData: ProxySetupInterface | null,
  links: { steamAccountIds: string[] },
  setLinks: (links: { steamAccountIds: string[] }) => void
}) => {
  const { proxyData, links, setLinks } = props;
  const { t } = useTranslation();

  if (!proxyData) {
    console.log('return empty')
    return <></>;
  }

  useEffect(() => {
    links.steamAccountIds.length > 5 ? setOverflow(true) : setOverflow(false)
  }, [links.steamAccountIds])

  const [overflow, setOverflow] = useState(false);
  const [navigation, setNavigation] = useState<Navigation>("none");

  const steamAccounts = Object.values(store.steamAccountsTable.getSteamAccounts());
  const linkedAccounts = steamAccounts.filter(sa => links.steamAccountIds.includes(sa.id)).map(sa => sa.number).join(", ");
  const testedProxy = store.proxiesTable.testedEditingProxy;
  const isCurrentTest = testedProxy && testedProxy.host === proxyData.host && testedProxy.port === proxyData.port
    && testedProxy.username === proxyData.username && testedProxy.password === proxyData.password;

  return (
    <div className="proxy-item text-white-medium">
      <div className="proxy-item-row">
        <div className="proxy-item-cell proxy-item-cell_mono" title={proxyData.host}>{proxyData.host || <span className="proxy-empty-cell">—</span>}</div>
        <div className="proxy-item-cell proxy-item-cell_mono" title={proxyData.port}>{proxyData.port || <span className="proxy-empty-cell">—</span>}</div>
        <div className="proxy-item-cell" title={proxyData.username}>{proxyData.username || <span className="proxy-empty-cell">—</span>}</div>
        <div className="proxy-item-cell" title={proxyData.password}>{proxyData.password || <span className="proxy-empty-cell">—</span>}</div>
        <div
          className="proxy-item-cell icon"
          style={overflow ? { justifyContent: "flex-start" } : {}}
        >
          <button
            className="proxy-item-button-expand"
            type="button"
            title={t("proxies.links.manage")}
            aria-label={t("proxies.links.manage")}
            aria-expanded={navigation === "accounts"}
            onClick={() => {
              navigation == "accounts"
                ? setNavigation("none")
                : setNavigation("accounts");
            }}
          >
            <Icon name="plus" size={14} motion="pop" />
          </button>

          <span className={`proxy-linked-cell${linkedAccounts ? '' : ' proxy-empty-cell'}`} title={linkedAccounts || t('proxies.links.empty')}>
            {linkedAccounts || '—'}
          </span>
        </div>
        <div className="proxy-item-cell proxy-item-test"><ProxyTestButton isWorking={isCurrentTest ? store.proxiesTable.editingTestResult : undefined} isTesting={store.proxiesTable.isTestingEditingProxy} onClick={() => {
          store.proxiesTable.testEditingProxy(proxyData);
        }} /></div>
      </div>
      {
        {
          none: <></>,
          accounts: (
            <div className="accounts__container">
              <div className="accounts-header text-grey-medium">
                <span className="account-header-text">№</span>
                <span className="account-header-text">{t("columns.login")}</span>
                <span className="account-header-text" style={{ width: '250px' }}>{t("columns.linkedProxies")}</span>
              </div>

              <div className="accounts-proxy">
                {steamAccounts.map((steamAccount, index) => {
                  if (!steamAccount.deleted)
                    return (
                      <AccountItem
                        steamAccount={steamAccount}
                        links={links}
                        setLinks={setLinks}
                        key={`accountItem${index}`}
                      ></AccountItem>
                    );
                })}
              </div>
            </div>
          )
        }[navigation]
      }
    </div>
  );
});

type Navigation = "accounts" | "none";

export default ProxyItem;

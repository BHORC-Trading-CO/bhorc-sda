import react, { FC, useEffect, useState } from "react";
import "./CreateProxyBlock.css";
import parseProxyString from "../../../../ProxiesTab/components/Funcs/parseProxyString";
import store from "../../../../../../../store/store";
import { observer } from 'mobx-react';
import ProxySetupInterface from "../../../../../../../../electron/interfaces/Proxy/ProxySetupInterface";
import Button from "../../../../../../../globalComponents/Button/Button";
import { Trans, useTranslation } from "react-i18next";

export const CreateProxyBlock: FC<{
  proxy: ProxySetupInterface,
  onChange: (newProxy: ProxySetupInterface) => void
}> = observer(({ proxy, onChange }) => {
  const { t } = useTranslation();
  const [isProxyFilledData, setIsProxyFilledData] = useState(false);
  const [proxyStr, setProxyStr] = useState(``);

  useEffect(() => {
    if (proxy.username != '' || proxy.password != '' || proxy.host != '' || proxy.port != '') { setIsProxyFilledData(true) }
    else { setIsProxyFilledData(false) }
  }, [proxy])

  return (
    <div className="proxy__container create-proxy-block">
      <div className="proxy-create__container__creation">
        <input
          className="proxy-create-input text-grey-medium"
          placeholder={t("common.startTyping")}
          aria-label={t("proxyBlock.example")}
          value={proxyStr}
          onChange={(e) => {
            const value = e.target.value;
            const proxyData = parseProxyString(value);
            setProxyStr(value);
            onChange(proxyData);
          }}
        ></input>
        <div className="proxy-data-example text-grey-medium">
          {t("proxyBlock.example")}
        </div>

      </div>
      {isProxyFilledData ?
        <div className="proxy-table__container__creation">
          <div className="proxy-table proxy-table_in-form">
            <div className="proxy-table-header text-grey-medium">
              <div className="proxy-table-header-cell">{t("columns.host")}</div>
              <div className="proxy-table-header-cell">{t("columns.port")}</div>
              <div className="proxy-table-header-cell">{t("columns.login")}</div>
              <div className="proxy-table-header-cell">{t("columns.password")}</div>
              <div className="proxy-table-header-cell">{t("proxyBlock.test")}</div>
            </div>
            <div className="proxy-item__container">
              <div className="proxy-item text-white-medium">
                <div className="proxy-item-row">
                  <div className="proxy-item-cell proxy-item-cell_mono" title={proxy.host}>{proxy.host}</div>
                  <div className="proxy-item-cell proxy-item-cell_mono">{proxy.port}</div>
                  <div className="proxy-item-cell" title={proxy.username}>{proxy.username}</div>
                  <div className="proxy-item-cell">{proxy.password}</div>
                  <div className="proxy-item-cell"><Button onClick={() => {
                    store.proxiesTable.testEditingProxy(proxy);
                  }} className="proxy-test-button" isLoad={store.proxiesTable.isTestingEditingProxy} size="small" text={t("proxyBlock.runTest")} color="grey" hoverColor="light-grey" /></div>
                </div>
              </div>
            </div>
          </div>
        </div> : <div className='info-block sda-callout'>
          <div>
            <Trans i18nKey="proxyBlock.notSet" components={{ br: <br /> }} />
          </div>
        </div>
      }
    </div>
  );
});

export default CreateProxyBlock;

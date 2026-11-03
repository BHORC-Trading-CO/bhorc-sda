import react, { FC, useEffect, useState } from "react";
import "./CreateProxyBlock.css";
import Delimeter from "../../../../../../../globalComponents/Delimeter/Delimeter";
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
    <div className="proxy__container">
      <div className="proxy-create__container__creation">
        <input
          className="proxy-create-input text-grey-medium"
          placeholder={t("common.startTyping")}
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
          <Delimeter marginTop="26px" marginBottom="15px"></Delimeter>
          <div className="proxy-table">
            <div className="proxy-table-header text-grey-medium">
              <div className="proxy-table-header-cell">{t("columns.host")}</div>
              <div className="proxy-table-header-cell">{t("columns.port")}</div>
              <div className="proxy-table-header-cell">{t("columns.login")}</div>
              <div className="proxy-table-header-cell">{t("columns.password")}</div>
              <div className="proxy-table-header-cell">test</div>
            </div>
            <div className="proxy-item__container">
              <div className="proxy-item text-white-medium">
                <div className="proxy-item-row">
                  <div className="proxy-item-cell">{proxy.host}</div>
                  <div className="proxy-item-cell">{proxy.port}</div>
                  <div className="proxy-item-cell">{proxy.username}</div>
                  <div className="proxy-item-cell">{proxy.password}</div>
                  <div className="proxy-item-cell"><Button onClick={() => {
                    store.proxiesTable.testEditingProxy(proxy);
                  }} style={{ margin: 'auto' }} isLoad={store.proxiesTable.isTestingEditingProxy} size="small" img="./assets/img/testProxy.svg" view="icon" color="grey" hoverColor="light-grey" /></div>
                </div>
              </div>
            </div>
          </div>
        </div> : <><br /><div className='info-block'>
          <Trans i18nKey="proxyBlock.notSet" components={{ br: <br /> }} />
        </div></>
      }
    </div>
  );
});

export default CreateProxyBlock;

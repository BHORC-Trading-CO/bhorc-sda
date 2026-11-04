import react, { FC, useEffect, useState } from "react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import "../ProxiesCreationForm/ProxiesCreationForm.css";
import "./ProxiesEditingForm.css";
import Delimeter from "../../../../../../globalComponents/Delimeter/Delimeter";
import ProxyItem from "../ProxyItem/ProxyItem";
import Button from "../../../../../../globalComponents/Button/Button";
import { observer } from 'mobx-react';
import ProxySetupInterface from "../../../../../../../electron/interfaces/Proxy/ProxySetupInterface";
import parseProxyString from "../Funcs/parseProxyString";
import { useTranslation } from "react-i18next";

const ProxiesEditingForm: FC = observer(() => {
  const { t } = useTranslation();
  if (!store.proxiesTable.isEditingFormOpen) return <></>;
  const proxy = store.proxiesTable.getEditingFormContent();

  return (
    <MiniWindow
      title={t("proxies.editing.title", { number: proxy.number, host: proxy.host, port: proxy.port })}
      width="1000px"
      height=""
      // key: поля и привязки живут в состоянии окна; если правку открыли для другого прокси,
      // не закрывая окно, состояние начинается заново, а не уезжает в сохранение другого прокси.
      content={
        <EditingFormContent key={proxy.id} />
      }
      onClose={() => {
        store.proxiesTable.closeEditingForm();
      }}
    />
  );
});

const EditingFormContent: FC = observer(() => {
  const { t } = useTranslation();
  const proxy = store.proxiesTable.getEditingFormContent();
  const [proxyData, setProxyData] = useState<ProxySetupInterface>({
    username: proxy.username,
    password: proxy.password,
    host: proxy.host,
    port: proxy.port
  });

  const [originalSteamAccountIds] = useState(() => [...proxy.steamAccountIds]);
  const [links, setLinks] = useState<{ steamAccountIds: string[] }>({
    steamAccountIds: proxy.steamAccountIds
  });

  const parseAddProxyArea = (value: string) => {
    const proxySetup: ProxySetupInterface = parseProxyString(value);

    store.proxiesTable.resetEditingTestDisplay();
    setProxyData(proxySetup);
  }

  return (
    <div className="proxies-form proxy__container proxy-editing-form">
      <div className="proxy-create__container">
        <label className="proxy-field-label" htmlFor="proxy-edit-value">{t("proxies.form.label")}</label>
        <input
          id="proxy-edit-value"
          aria-describedby="proxy-edit-format"
          className="proxy-create-input text-grey-medium"
          placeholder={t("common.startTyping")}
          defaultValue={
            proxyData.username +
            ":" +
            proxyData.password +
            "@" +
            proxyData.host +
            ":" +
            proxyData.port
          }
          onChange={(e) => parseAddProxyArea(e.target.value)}
        ></input>
        <div id="proxy-edit-format" className="proxy-data-example text-grey-medium">
          {t("proxyBlock.example")}
        </div>
        <Delimeter marginTop="26px" marginBottom="15px"></Delimeter>
      </div>
      <div className="proxy-table__container">
        <div className="proxy-table">
          <div className="proxy-table-header text-grey-medium">
            <div className="proxy-table-header-cell">{t("columns.host")}</div>
            <div className="proxy-table-header-cell">{t("columns.port")}</div>
            <div className="proxy-table-header-cell">{t("columns.login")}</div>
            <div className="proxy-table-header-cell">{t("columns.password")}</div>
            <div className="proxy-table-header-cell">{t("columns.account")}</div>
            <div className="proxy-table-header-cell">{t("proxies.test.column")}</div>
          </div>
          <div className="proxy-item__container">
            {<ProxyItem
              proxyData={proxyData}
              links={links}
              setLinks={setLinks}
            ></ProxyItem>}
          </div>
          <Delimeter marginTop="10px" marginBottom="20px"></Delimeter>
        </div>
      </div>
      <div className="proxy-button__container">
        <Button
          size="medium"
          text={t("common.buttons.cancel")}
          color="grey"
          hoverColor="grey"
          onClick={() => {
            store.proxiesTable.closeEditingForm();
          }}
        ></Button>
        <Button size="medium" text={t("common.buttons.save")} onClick={() => {
          if (proxyData.host && proxyData.port && proxyData.password && proxyData.host) {
            window.Main.proxies.edit(proxy.id, proxyData, { ...links, originalSteamAccountIds });
            store.proxiesTable.closeEditingForm();
          }
        }}></Button>
      </div>
    </div>
  );
});

export default ProxiesEditingForm;

import react, { FC, useEffect, useState } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Delimeter from "../../../../../../globalComponents/Delimeter/Delimeter";
import Button from "../../../../../../globalComponents/Button/Button";
import ProxyItem from "../ProxyItem/ProxyItem";
import "./ProxiesCreationForm.css";
import ProxySetupInterface from '../../../../../../../electron/interfaces/Proxy/ProxySetupInterface';
import parseProxyString from "../Funcs/parseProxyString";
import { useTranslation } from "react-i18next";

const ProxiesCreationForm: FC = observer(() => {
  const { t } = useTranslation();
  if (!store.proxiesTable.isCreationFormOpen) return <></>;

  return (
    <MiniWindow
      title={t("proxies.creation.title")}
      width="1000px"
      height=""
      content={<CreationFormContent />}
      onClose={() => {
        store.proxiesTable.closeCreationForm();
      }}
    />
  );
});

export const CreationFormContent: FC = () => {
  const { t } = useTranslation();
  const [proxy, setProxy] = useState<ProxySetupInterface>({
    username: "",
    password: "",
    host: "",
    port: ""
  });
  const [links, setLinks] = useState<{ steamAccountIds: string[] }>({
    steamAccountIds: []
  });

  const [isProxyFilledData, setIsProxyFilledData] = useState(false)
  useEffect(() => {
    if (proxy.username != '' || proxy.password != '' || proxy.host != '' || proxy.port != '') { setIsProxyFilledData(true) }
    else { setIsProxyFilledData(false) }
  }, [proxy])

  return (
    <div className="proxies-form proxy__container">
      <div className="proxy-create__container">
        <label className="proxy-field-label" htmlFor="proxy-create-value">{t("proxies.form.label")}</label>
        <input
          id="proxy-create-value"
          aria-describedby="proxy-create-format"
          className="proxy-create-input text-grey-medium"
          placeholder={t("common.startTyping")}
          onChange={(e) => {
            const value = e.target.value;
            const proxyData = parseProxyString(value);
            store.proxiesTable.resetEditingTestDisplay();
            setProxy(proxyData);
          }}
        ></input>
        <div id="proxy-create-format" className="proxy-data-example text-grey-medium">
          {t("proxyBlock.example")}
        </div>
        <Delimeter marginTop="26px" marginBottom="15px"></Delimeter>
      </div>
      {isProxyFilledData ?
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
              {
                <ProxyItem
                  proxyData={proxy}
                  links={links}
                  setLinks={setLinks}
                ></ProxyItem>
              }
            </div>
            <Delimeter marginTop="19px" marginBottom="20px"></Delimeter>
          </div>
        </div> : <></>}
      <div className="proxy-button__container">
        <Button
          size="medium"
          text={t("common.buttons.cancel")}
          color="grey"
          hoverColor="grey"
          onClick={() => {
            store.proxiesTable.closeCreationForm();
          }}
        ></Button>
        <Button size="medium" text={t("common.buttons.save")} onClick={() => {
          console.log(links);
          if (proxy.host && proxy.port && proxy.username && proxy.password) {
            window.Main.proxies.new(proxy, links);
            store.proxiesTable.closeCreationForm();
          } else {
            store.windows.openMiniNotification({
              type: "error",
              text: t("proxies.creation.incomplete")
            });
          }
        }}></Button>
      </div>
    </div>
  );
};


export default ProxiesCreationForm;

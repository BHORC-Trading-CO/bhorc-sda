import React, { FC, useState } from "react";
import Button from "../../../../../../../../../globalComponents/Button/Button";
import Input from "../../../../../../../../../globalComponents/Input/Input";
import "./SteamGuardConnecting.css";
import store from "../../../../../../../../../store/store";
import { observer } from 'mobx-react';
import { useTranslation } from 'react-i18next';

const SteamDataCode: FC = observer(() => {
  const [currentPage, setCurrentPage] = useState('start');

  const StartPage: FC = observer(() => {
    const { t } = useTranslation();
    return (
      <>
        {/* Предупреждение — обычный текст в плашке, а не крупный заголовок. */}
        <div className="sda-callout sda-callout--warning">
          <div>{t("guard.connect.question")}</div>
        </div>
        <div className="steam-data-code__actions">
          <Button size="medium" text={t("common.buttons.connect")} isNonGuardButton={false} onClick={() => {
            setCurrentPage('accept');
          }} />
        </div>
      </>
    );
  });

  const AcceptConnectingPage: FC = observer(() => {
    const params = store.steamAccountsTable.creationForm.getContent();
    const { t } = useTranslation();

    return (
      <>
        <div className="steam-data-code__title">{t("guard.connect.checkData")}</div>
        <div className="steam-data-code__details">
          <div>{t("guard.connect.login", { value: params.accountName ? params.accountName : t("common.notSet") })}</div>
          <div>{t("guard.connect.password", { value: params.password ? params.password : t("common.notSet") })}</div>
        </div>
        <div className="steam-data-code__actions">
          <Button text={t("common.buttons.back")} size="medium" color="grey" isNonGuardButton={false} hoverColor='light-grey' onClick={() => {
            setCurrentPage('start');
          }}></Button>
          <Button disabled={!(params.accountName && params.password) || !store.steamAccountsTable.creationForm.hasValidProxySelection} isNonGuardButton={false} text={t("common.buttons.connect")} size="medium" onClick={() => {
            store.steamAccountsTable.creationForm.runGuardSetupProcess();
          }}></Button>
        </div>
      </>
    );
  });

  return (
    <div className="steam-data-code">
      <div className="steam-data-code__container">
        {currentPage === 'start' ? <StartPage /> : <AcceptConnectingPage />}
      </div>
    </div>
  );
});

export default SteamDataCode;
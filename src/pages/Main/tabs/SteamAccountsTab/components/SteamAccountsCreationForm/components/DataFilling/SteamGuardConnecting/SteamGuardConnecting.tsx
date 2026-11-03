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
        <h1>{t("guard.connect.question")}</h1>
        <br />
        <Button size="medium" text={t("common.buttons.connect")} isNonGuardButton={false} onClick={() => {
          setCurrentPage('accept');
        }} />
      </>
    );
  });

  const AcceptConnectingPage: FC = observer(() => {
    const params = store.steamAccountsTable.creationForm.getContent();
    const { t } = useTranslation();

    return (
      <>
        <h1>{t("guard.connect.checkData")}</h1><br />
        <div>{t("guard.connect.login", { value: params.accountName ? params.accountName : t("common.notSet") })}</div>
        <div>{t("guard.connect.password", { value: params.password ? params.password : t("common.notSet") })}</div>
        <br />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button text={t("common.buttons.back")} size="medium" color="grey" isNonGuardButton={false} hoverColor='light-grey' style={{ marginRight: '20px' }} onClick={() => {
            setCurrentPage('start');
          }}></Button>
          <Button disabled={!(params.accountName && params.password)} isNonGuardButton={false} text={t("common.buttons.connect")} size="medium" onClick={() => {
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
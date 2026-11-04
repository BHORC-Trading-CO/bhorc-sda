import '../../../../../css/Panel.css';
import Button from "../../../../../globalComponents/Button/Button";
import Search from "../../../../../globalComponents/Search/Search";
import { observer } from 'mobx-react';
import store from '../../../../../store/store';
import { useTranslation } from 'react-i18next';

const ProxiesPanel = observer(() => {
    const { t } = useTranslation();
    return (
        <div className="panel">
            <div className="panel-content">
                <h1 className="panel-text_main">{t("accounts.panel.title")}</h1>
                <div className="panel-content__options">
                    {/* <div className="header-content__buttons-container">
            <div className="button-default" id="panel_settings" onClick={()=>{
              store.openTableSettings();
            }}></div>
            <div className="button-default" id="panel_refresh"></div>
          </div> */}
                    {/* <Button
                    view="icon"
                    hoverColor="gradient"
                    color="grey"
                    size="large"
                    icon="shieldCheck"
                    className="button-default"
                    onClick={() => {
                        store.windows.prompt({
                            text: "Введите старый ключ шифрования. Если устанавливаете ключ в первый раз, то оставьте поле пустым",
                            title: "Установить ключ шифрования",
                            isInput: true,
                            type: "question",
                            cb: (text) => {
                                window.Main.window.setSecretKey(text);
                            }
                        })
                    }}
                    altText="Установить код шифрования. Ваши данные будут шифроваться"
                /> */}
                    <Button
                        view="icon"
                        hoverColor="gradient"
                        color="grey"
                        size="large"
                        icon="folder"
                        className="button-default"
                        onClick={() => {
                            window.Main.window.openAppdata();
                        }}
                        altText={t("common.openDataFolder")}
                    />
                    <Button
                        view="icon"
                        hoverColor="gradient"
                        color="grey"
                        size="large"
                        icon="sliders"
                        className="button-default"
                        testId="table-settings"
                        onClick={() => {
                            store.steamAccountsTable.settingsForm.open();
                        }}
                        altText={t("tableSettings.title")}
                    />

                    <Button
                        view="icon"
                        hoverColor="gradient"
                        color="grey"
                        size="large"
                        icon="refresh"
                        iconMotion="spin"
                        className="button-default"
                        onClick={() => {
                            console.log('send refresh req')
                            window.Main.steamAccounts.refresh();
                        }}
                        altText={t("common.reloadAll")}
                    />

                    <Search
                        placeholder={t("accounts.panel.searchPlaceholder")}
                        value={store.steamAccountsTable.searchString}
                        onChange={(value) => {
                            console.log(value);
                            store.steamAccountsTable.search(value);
                        }}></Search>


                    <Button
                        size="large"
                        icon="plus"
                        text={t("accounts.panel.add")}
                        className="headline-button_gradient"
                        testId="add-account"
                        onClick={() => {
                            store.steamAccountsTable.creationForm.open();
                        }}
                    />

                    <Button
                        view="icon"
                        hoverColor="light-grey"
                        color="grey"
                        size="large"
                        icon={store.steamAccountsTable.showDeleted ? "eye" : "eyeOff"}
                        altText={store.steamAccountsTable.showDeleted ? t("accounts.panel.hideArchived") : t("accounts.panel.showArchived")}
                        className="button-default"
                        testId="show-archived"
                        onClick={() => {
                            if (store.steamAccountsTable.showDeleted)
                                for (var i = store.steamAccountsTable.activePage; i >= 1; i--) {
                                    const steamAccountsInPage = store.steamAccountsTable.getSteamAccountsByPages()[i - 1];
                                    if (steamAccountsInPage && (steamAccountsInPage.filter(sa => sa.deleted).length != steamAccountsInPage.length)) {
                                        store.steamAccountsTable.setActivePage(i);
                                        break;
                                    }
                                }

                            store.steamAccountsTable.changeShowStatus();
                        }}
                    />
                </div>
            </div>
        </div>
    );
});

export default ProxiesPanel;

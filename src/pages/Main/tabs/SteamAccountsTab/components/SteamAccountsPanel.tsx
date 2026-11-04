import React, { FC } from 'react';
import './SteamAccountsPanel.css';
import Button from "../../../../../globalComponents/Button/Button";
import Search from "../../../../../globalComponents/Search/Search";
import Icon, { IconMotion, IconName } from "../../../../../globalComponents/Icon/Icon";
import { Tip } from "../../../../../globalComponents/Table/Cells";
import { observer } from 'mobx-react';
import store from '../../../../../store/store';
import { useTranslation } from 'react-i18next';

// Иконка панели (макет main-v2: .ghost): 34 px, контур zinc-700, подсказка как у остальных кнопок.
// Своя разметка, а не Button: вид панели не зависит от правок Button.css в других PR.
const ToolbarIconButton: FC<{
    icon: IconName,
    label: string,
    motion?: IconMotion,
    isActive?: boolean,
    testId?: string,
    onClick: () => void,
}> = ({ icon, label, motion = "pop", isActive, testId, onClick }) => (
    <Tip tip={label} className="accounts-toolbar__tip">
        <button
            type="button"
            className={`accounts-toolbar__icon${isActive ? " accounts-toolbar__icon--active" : ""}`}
            aria-label={label}
            data-testid={testId}
            onClick={onClick}
        >
            <Icon name={icon} motion={motion} />
        </button>
    </Tip>
);

const SteamAccountsPanel = observer(() => {
    const { t } = useTranslation();
    const table = store.steamAccountsTable;
    // То же число, что «всего» в подвале: все аккаунты, кроме архивных (с архивными, если они показаны)
    const count = Object.values(table.steamAccounts).filter((sa) => !sa.deleted || table.showDeleted).length;

    return (
        <div className="accounts-toolbar">
            <div className="accounts-toolbar__title">
                <h1 className="accounts-toolbar__heading">{t("accounts.panel.title")}</h1>
                <span className="accounts-toolbar__count" title={t("accounts.count", { count })}>{count}</span>
            </div>

            <Search
                placeholder={t("accounts.panel.searchPlaceholder")}
                value={table.searchString}
                onChange={(value) => {
                    table.search(value);
                }}
            />

            <div className="accounts-toolbar__icons">
                <ToolbarIconButton
                    icon="folder"
                    label={t("common.openDataFolder")}
                    testId="open-data-folder"
                    onClick={() => {
                        window.Main.window.openAppdata();
                    }}
                />
                <ToolbarIconButton
                    icon="sliders"
                    label={t("tableSettings.title")}
                    testId="table-settings"
                    onClick={() => {
                        table.settingsForm.open();
                    }}
                />
                <ToolbarIconButton
                    icon="refresh"
                    motion="spin"
                    label={t("common.reloadAll")}
                    testId="refresh-all"
                    onClick={() => {
                        window.Main.steamAccounts.refresh();
                    }}
                />
                <ToolbarIconButton
                    icon="archive"
                    isActive={table.showDeleted}
                    label={table.showDeleted ? t("accounts.panel.hideArchived") : t("accounts.panel.showArchived")}
                    testId="show-archived"
                    onClick={() => {
                        if (table.showDeleted)
                            for (var i = table.activePage; i >= 1; i--) {
                                const steamAccountsInPage = table.getSteamAccountsByPages()[i - 1];
                                if (steamAccountsInPage && (steamAccountsInPage.filter(sa => sa.deleted).length != steamAccountsInPage.length)) {
                                    table.setActivePage(i);
                                    break;
                                }
                            }

                        table.changeShowStatus();
                    }}
                />
            </div>

            <Button
                size="large"
                icon="plus"
                text={t("accounts.panel.add")}
                className="accounts-toolbar__add sda-sweep"
                testId="add-account"
                onClick={() => {
                    table.creationForm.open();
                }}
            />
        </div>
    );
});

export default SteamAccountsPanel;

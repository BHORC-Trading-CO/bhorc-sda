import react, { FC } from 'react';
import './SteamAccountsFooter.css';
import { observer } from 'mobx-react';
import store from '../../../../../store/store';
import Button from '../../../../../globalComponents/Button/Button';
import TablePageSwitcher from '../../../../../globalComponents/TablePageSwitcher/TablePageSwitcher';
import { useTranslation } from 'react-i18next';

const SteamAccountsFooter: FC = observer(() => {
    const { t } = useTranslation();
    const steamAccounts = store.steamAccountsTable.getSteamAccounts();
    const steamAccountsByPage = store.steamAccountsTable.getSteamAccountsByPages();
    // Строк в текущем списке (группа, поиск, архив) по всем страницам — то же число, что у заголовка
    const rowsCount = steamAccountsByPage.reduce((total, page) => total + page.length, 0);
    const visibleSteamAccounts = Object.values(steamAccounts).filter(p => !p.deleted || store.steamAccountsTable.showDeleted);
    const selectedSteamAccounts = visibleSteamAccounts.filter(p => p.isSelected);
    // Ничего не выбрано: кнопки выглядят неактивными, но клики работают как раньше (напр. тост «не выбрано»)
    const nothingSelected = selectedSteamAccounts.length === 0;
    const inactiveHint = nothingSelected ? t("accounts.footer.selectFirst") : undefined;

    return (
        <>
            <div className="accounts-footer">
                <TablePageSwitcher numberOfElements={rowsCount} countText={t("accounts.count", { count: rowsCount })} numberOfPages={steamAccountsByPage.length} options={{ avalible: [5, 10, 15, 20, 40, 100] }} pageSize={store.steamAccountsTable.pageSize} activePageNumber={store.steamAccountsTable.activePage} onChangeActivePage={(activePage) => {
                    store.steamAccountsTable.setActivePage(activePage, true);
                }}
                    onChangePageSize={(newPageSize) => {
                        store.steamAccountsTable.setPageSize(newPageSize, true)
                    }} />

                <div className="accounts-footer__bulk">
                    <div className="accounts-footer__selected">
                        <span>{t("common.selected")}</span>
                        <span className={`accounts-footer__selected-value${nothingSelected ? "" : " accounts-footer__selected-value--active"}`}>{selectedSteamAccounts.length}</span>
                    </div>

                    <Button
                        disabled={false}
                        inactive={nothingSelected}
                        altText={inactiveHint}
                        view="default"
                        size="large"
                        color="grey"
                        hoverColor="grey"
                        className="accounts-footer__button"
                        icon="refresh"
                        iconMotion="spin"
                        text={t("accounts.footer.refreshSession")}
                        onClick={() => {
                            const selected = Object.values(store.steamAccountsTable.getSteamAccounts()).filter(p => p.isSelected && !p.deleted);
                            if (selected.length === 0) return;
                            store.steamAccountsTable.refreshSessionSelected();
                        }}
                    />

                    <Button
                        disabled={false}
                        inactive={nothingSelected}
                        altText={inactiveHint}
                        view="default"
                        size="large"
                        color="grey"
                        hoverColor="grey"
                        className="accounts-footer__button"
                        icon="folder"
                        text={t("accounts.footer.toGroup")}
                        onClick={() => {
                            const selected = Object.values(store.steamAccountsTable.getSteamAccounts()).filter(p => p.isSelected && !p.deleted);
                            if (selected.length === 0) {
                                return store.windows.openMiniNotification({ type: 'error', text: t('common.noAccountsSelected') });
                            }
                            store.groups.openAssignForm();
                        }}
                    />

                    <Button
                        disabled={false}
                        inactive={nothingSelected}
                        altText={inactiveHint}
                        view="default"
                        size="large"
                        color="grey"
                        hoverColor="danger"
                        className="accounts-footer__button accounts-footer__button--danger"
                        icon="trash"
                        text={t("common.buttons.delete")}
                        onClick={() => {
                            const selectedSteamAccounts = Object.values(store.steamAccountsTable.getSteamAccounts()).filter(p => p.isSelected);
                            if (selectedSteamAccounts.length === 0) return;

                            store.windows.prompt({
                                type: 'question',
                                title: t('accounts.archiveSelected.title', { count: selectedSteamAccounts.length }),
                                text: t(selectedSteamAccounts.length === 1 ? 'accounts.archiveSelected.textSingle' : 'accounts.archiveSelected.textMany', { numbers: selectedSteamAccounts.map(p => p.number).join(', ') }),
                                acceptButtonText: t('accounts.archiveSelected.accept', { count: selectedSteamAccounts.length }),
                                cancelButtonText: t('prompt.cancel'),
                                cb: () => {
                                    for (var steamAccount of selectedSteamAccounts) {
                                        store.steamAccountsTable.editSteamAccount(steamAccount.id, { deleted: true, isSelected: false });
                                        //store.steamAccountsTable.editSteamAccountInStorage(steamAccount.id, { deleted: true });
                                        window.Main.steamAccounts.edit(steamAccount.id, { deleted: true });
                                    }
                                    window.Main.steamAccounts.get();
                                }
                            });
                        }}
                    />
                </div>
            </div>
        </>
    );
});

export default SteamAccountsFooter;
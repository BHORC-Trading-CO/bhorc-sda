import react, { FC } from 'react';
import '../../../../../css/Footer.css';
import { observer } from 'mobx-react';
import store from '../../../../../store/store';
import Button from '../../../../../globalComponents/Button/Button';
import TablePageSwitcher from '../../../../../globalComponents/TablePageSwitcher/TablePageSwitcher';
import { useTranslation } from 'react-i18next';

const SteamAccountsFooter: FC = observer(() => {
    const { t } = useTranslation();
    const steamAccounts = store.steamAccountsTable.getSteamAccounts();
    const steamAccountsByPage = store.steamAccountsTable.getSteamAccountsByPages();
    const visibleSteamAccounts = Object.values(steamAccounts).filter(p => !p.deleted || store.steamAccountsTable.showDeleted);
    const selectedSteamAccounts = visibleSteamAccounts.filter(p => p.isSelected);
    // Ничего не выбрано: кнопки выглядят неактивными, но клики работают как раньше (напр. тост «не выбрано»)
    const nothingSelected = selectedSteamAccounts.length === 0;
    const inactiveHint = nothingSelected ? t("accounts.footer.selectFirst") : undefined;

    return (
        <>
            <div className="footer">
                <div className="footer__accounts-number">
                    <TablePageSwitcher numberOfElements={visibleSteamAccounts.length} numberOfPages={steamAccountsByPage.length} options={{ avalible: [5, 10, 15, 20, 40, 100] }} pageSize={store.steamAccountsTable.pageSize} activePageNumber={store.steamAccountsTable.activePage} onChangeActivePage={(activePage) => {
                        store.steamAccountsTable.setActivePage(activePage, true);
                    }}
                        onChangePageSize={(newPageSize) => {
                            console.log(newPageSize);
                            store.steamAccountsTable.setPageSize(newPageSize, true)
                        }} />
                </div>


                <div className="footer__control">
                    <div className="footer__select-number">
                        <span className="text-grey-large">{t("common.selected")}</span>
                        <span className={`text-white-large footer__info${nothingSelected ? "" : " footer__info--active"}`}>{selectedSteamAccounts.length}</span>
                    </div>

                    <Button
                        disabled={false}
                        inactive={nothingSelected}
                        altText={inactiveHint}
                        view="default"
                        size="large"
                        color="grey"
                        hoverColor="grey"
                        className="footer__button"
                        iconMask
                        img="./assets/img/refreshSession.svg"
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
                        className="footer__button"
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
                        className="footer__button"
                        iconMask
                        img="./assets/img/Trash.svg"
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
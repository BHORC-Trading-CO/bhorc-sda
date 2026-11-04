import react, { FC } from 'react';
import '../../../../../css/Footer.css';
import './ProxyActions.css';
import { observer } from 'mobx-react';
import store from '../../../../../store/store';
import Button from '../../../../../globalComponents/Button/Button';
import Icon from '../../../../../globalComponents/Icon/Icon';
import TablePageSwitcher from '../../../../../globalComponents/TablePageSwitcher/TablePageSwitcher';
import { useTranslation } from 'react-i18next';

const ProxiesFooter: FC = observer(() => {
    const { t } = useTranslation();
    const proxies = store.proxiesTable.getProxies().filter(p => !p.deleted || store.proxiesTable.showDeleted);
    const proxiesByPage = store.proxiesTable.getProxiesByPages();
    const selectedProxies = proxies.filter(p => p.isSelected);

    return (
        <>
            <div className="footer">
                <div className="footer__accounts-number">
                    <TablePageSwitcher numberOfElements={proxies.length} numberOfPages={proxiesByPage.length} options={{ avalible: [5, 10, 15, 20, 40, 100] }} pageSize={store.proxiesTable.pageSize} activePageNumber={store.proxiesTable.activePage} onChangeActivePage={(activePage) => {
                        store.proxiesTable.setActivePage(activePage);
                    }}
                        onChangePageSize={(newPageSize) => {
                            console.log(newPageSize);
                            store.proxiesTable.setPageSize(newPageSize)
                        }} />
                </div>
                <div className="footer__control">
                    <div className="footer__select-number">
                        <span className="text-grey-large">{t("common.selected")}</span>
                        <span className="text-white-large footer__info">{selectedProxies.length}</span>
                    </div>

                    <button
                        type="button"
                        className="button button--view-default button--size-large button--grey button--hoverColor-grey footer__button proxy-test-selected"
                        onClick={() => {
                            const selectedProxies = store.proxiesTable.getProxies().filter(p => p.isSelected && !p.deleted);
                            if (selectedProxies.length === 0) return;
                            store.proxiesTable.testSelected();
                        }}
                    >
                        <Icon name="activity" size={16} motion="pop" className="button__icon" />
                        <span className="button__text">{t("proxies.footer.testAll")}</span>
                    </button>

                    <Button
                        disabled={false}
                        view="default"
                        size="large"
                        color="grey"
                        hoverColor="danger"
                        className="footer__button"
                        icon="trash"
                        text={t("common.buttons.delete")}
                        onClick={() => {
                            const selectedProxies = store.proxiesTable.getProxies().filter(p => p.isSelected);
                            if (selectedProxies.length === 0) return;
                            store.windows.prompt({
                                type: 'question',
                                title: t('proxies.archiveSelected.title', { count: selectedProxies.length }),
                                text: t(selectedProxies.length === 1 ? 'proxies.archiveSelected.textSingle' : 'proxies.archiveSelected.textMany', { numbers: selectedProxies.map(p => p.number).join(', ') }),
                                acceptButtonText: t('proxies.archiveSelected.accept', { count: selectedProxies.length }),
                                cancelButtonText: t('prompt.cancel'),
                                cb: () => {
                                    for (var proxy of selectedProxies) {
                                        store.proxiesTable.editProxyInStorage(proxy.id, { deleted: true }, {
                                            steamAccountIds: []
                                        });
                                    }
                                }
                            });
                        }}
                    />
                </div>
            </div>
        </>
    );
});

export default ProxiesFooter;
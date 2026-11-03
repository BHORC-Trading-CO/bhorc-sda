import react, { FC } from 'react';
import Table, { Line, Cell } from '../../../../../globalComponents/Table/Table';
import AvalibleTypes from '../../../../../../electron/interfaces/TableFields/AvalibleFieldTypes';
import store from '../../../../../store/store';
import TableProxyInterface from '../../../../../../electron/interfaces/Proxy/TableProxyInterface';
import Field from '../../../../../../electron/interfaces/TableFields/Field';
import Checkbox from '../../../../../globalComponents/Checkbox/Checkbox';
import { ProxyActionButton, ProxyTestButton } from './ProxyActionButton';
import Password from '../../../../../globalComponents/Password/Password';
import { observer } from 'mobx-react';
import { useTranslation } from 'react-i18next';

const ProxiesTable: FC = observer(() => {
    const fields = store.proxiesTable.getFields();
    const proxiesByPage = store.proxiesTable.getProxiesByPages();
    const lines: Line[] = [];

    if (proxiesByPage[store.proxiesTable.activePage - 1])
        for (var proxy of proxiesByPage[store.proxiesTable.activePage - 1]) {
            if (proxy.deleted && !store.proxiesTable.showDeleted) continue;
            lines.push(generateLine(fields, proxy));
        }
    return (
        <Table
            onSelect={(isSelected) => { store.proxiesTable.selectAllProxies(isSelected); }}
            isSelected={store.proxiesTable.isAllSelected}
            fields={fields}
            fieldsTable="proxies"
            lines={lines}
            onSort={(fieldType, direction) => {
                store.proxiesTable.changeFieldDirection(fieldType, direction);
                switch (fieldType) {
                    case AvalibleTypes.number: return store.proxiesTable.proxies.sort((a, b) => direction === 'UP' ? (a.number < b.number ? 1 : -1) : (a.number > b.number ? 1 : -1));
                    case AvalibleTypes.proxyHost: return store.proxiesTable.proxies.sort((a, b) => direction === 'UP' ? (a.host < b.host ? 1 : -1) : (a.host > b.host ? 1 : -1));
                    case AvalibleTypes.proxyPort: return store.proxiesTable.proxies.sort((a, b) => direction === 'UP' ? (a.port < b.port ? 1 : -1) : (a.port > b.port ? 1 : -1));
                    case AvalibleTypes.proxyUsername: return store.proxiesTable.proxies.sort((a, b) => direction === 'UP' ? (a.username < b.username ? 1 : -1) : (a.username > b.username ? 1 : -1));
                    case AvalibleTypes.proxyPassword: return store.proxiesTable.proxies.sort((a, b) => direction === 'UP' ? (a.password < b.password ? 1 : -1) : (a.password > b.password ? 1 : -1));
                }
            }}
        ></Table>
    );
});

const generateLine = (fields: Field[], proxy: TableProxyInterface): Line => {
    const line: Line = { cells: [], deleted: proxy.deleted };

    for (var index in fields) {
        line.cells.push({ type: fields[index].type, jsx: <CellJSX type={fields[index].type} proxy={proxy} /> })
    }
    return line;
}

const CellJSX: FC<{ type: AvalibleTypes, proxy: TableProxyInterface }> = observer((props) => {
    const { type, proxy } = props;
    const { t } = useTranslation();
    switch (type) {
        case AvalibleTypes.checkbox:
            if (proxy.deleted) {
                return <Checkbox isChecked={false} disabled={true} onChange={(isChecked) => { }} />;
            }
            return <Checkbox isChecked={proxy.isSelected} onChange={(isChecked) => {
                store.proxiesTable.selectProxy(proxy.id, isChecked)
            }} />;
        case AvalibleTypes.number:
            return <>{proxy.number}</>;
        case AvalibleTypes.proxyHost:
            return <>{proxy.host}</>;
        case AvalibleTypes.proxyPort:
            return <>{proxy.port}</>;
        case AvalibleTypes.proxyUsername:
            return <>{proxy.username}</>;
        case AvalibleTypes.proxyPassword:
            return <Password password={proxy.password} />;
        case AvalibleTypes.testProxyButton:
            return (
                <ProxyTestButton isWorking={proxy.isWorking} isTesting={proxy.isTesting} onClick={() => {
                    store.proxiesTable.testProxy(proxy.id);
                }} />
            );
        case AvalibleTypes.editingButton:
            if (proxy.deleted) {
                return <ProxyActionButton icon='restore' label={t('proxies.actions.restore')} onClick={() => {
                    store.proxiesTable.editProxyInStorage(proxy.id, { deleted: false }, {
                        steamAccountIds: proxy.steamAccountIds
                    });
                }} />;
            } else {
                return <ProxyActionButton icon='edit' label={t('proxies.actions.edit')} data-testid='proxy-edit' onClick={() => {
                    console.log(`Открываем форму редактирования прокси`);
                    store.proxiesTable.openEditingForm(proxy);
                }} />;
            }
        case AvalibleTypes.deleteButton:
            return <ProxyActionButton icon='delete' label={t(proxy.deleted ? 'proxies.actions.delete' : 'proxies.actions.archive')} onClick={() => {
                if (proxy.deleted) {
                    store.windows.prompt({
                        type: 'question',
                        title: t('proxies.delete.permanentTitle', { number: proxy.number }),
                        text: t('common.irreversible'),
                        acceptButtonText: t('common.buttons.deleteIt'),
                        cancelButtonText: t('prompt.cancel'),
                        cb: () => {
                            store.proxiesTable.deleteProxy(proxy.id);
                        }
                    });
                } else {
                    store.windows.prompt({
                        type: 'question',
                        title: t('proxies.delete.archiveTitle', { number: proxy.number }),
                        text: t('common.archiveHint'),
                        acceptButtonText: t('common.buttons.archiveIt'),
                        cancelButtonText: t('prompt.cancel'),
                        cb: () => {
                            store.proxiesTable.editProxyInStorage(proxy.id, { deleted: true }, {
                                steamAccountIds: []
                            });
                        }
                    });
                }
            }} />;
        case AvalibleTypes.linkedSteamAccounts:
            return <span className={`proxy-linked-cell${proxy.steamAccounts.length ? '' : ' proxy-empty-cell'}`} title={proxy.steamAccounts.map(sa => sa.number).join(', ') || t('proxies.links.empty')}>{proxy.steamAccounts.map(sa => sa.number).join(', ') || '—'}</span>;
        case AvalibleTypes.linkedProfiles:
            return <span className='proxy-linked-cell proxy-empty-cell'>—</span>;
        default:
            return <></>;
    }
});

export default ProxiesTable;
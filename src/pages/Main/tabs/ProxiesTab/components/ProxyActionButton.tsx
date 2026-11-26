import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon, { IconName } from '../../../../../globalComponents/Icon/Icon';
import { ProxyTestResult } from '../../../../../../electron/interfaces/Proxy/ProxyResults';
import './ProxyActions.css';

type Action = 'test' | 'edit' | 'delete' | 'restore';

const ACTION_ICONS: Record<Action, IconName> = {
    test: 'activity',
    edit: 'pencil',
    delete: 'trash',
    restore: 'archiveRestore',
};

// Кнопка действия в строке: 28 px без рамки, как действия строки аккаунтов (редизайн R4).
// busy — идёт проверка: вместо иконки крутится лоадер.
export const ProxyActionButton = ({ icon, label, busy = false, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: Action, label: string, busy?: boolean }) => (
    <button {...props} type="button" className={`proxy-action proxy-action--${icon} ${className}`} title={label} aria-label={label}>
        {busy
            ? <Icon name="loader" size={16} motion="spinAlways" />
            : <Icon name={ACTION_ICONS[icon]} size={16} motion="pop" />}
    </button>
);

export const ProxyTestButton = ({ isTesting, isWorking, failure, onClick }: { isTesting: boolean, isWorking?: boolean, failure?: Pick<ProxyTestResult, 'statusCode' | 'error'>, onClick: () => void }) => {
    const { t } = useTranslation();
    // Код ответа Steam (403, 429): прокси работает, отказал Steam — свой вид, не «сбой» (SDA-64).
    const steamCode = !isTesting && isWorking !== undefined ? failure?.statusCode : undefined;
    const state = isTesting ? 'pending' : isWorking === undefined ? 'idle' : steamCode ? 'warning' : isWorking ? 'success' : 'danger';
    const reason = steamCode ? t('proxies.test.steamHint', { code: steamCode }) : state === 'danger' ? failure?.error : undefined;
    const status = steamCode ? t('proxies.test.steamCode', { code: steamCode })
        : t(isTesting ? 'proxies.test.pending' : isWorking === undefined ? 'proxies.test.untested' : isWorking ? 'proxies.test.ok' : 'proxies.test.failed');

    return (
        <div className={`proxy-test-control proxy-test-control--${state}`}>
            <ProxyActionButton icon="test" label={`${t('proxies.actions.test')}: ${status}`} aria-busy={isTesting} busy={isTesting} onClick={onClick} />
            {/* Результат — бейдж состояния: работает — зелёный, отказ Steam — жёлтый, сбой — красный, иначе нейтральный. */}
            <span className="proxy-test-state" role="status" title={reason}>{status}</span>
        </div>
    );
};

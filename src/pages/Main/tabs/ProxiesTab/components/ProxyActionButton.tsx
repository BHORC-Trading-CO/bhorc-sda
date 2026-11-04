import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon, { IconName } from '../../../../../globalComponents/Icon/Icon';
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

export const ProxyTestButton = ({ isTesting, isWorking, onClick }: { isTesting: boolean, isWorking?: boolean, onClick: () => void }) => {
    const { t } = useTranslation();
    const state = isTesting ? 'pending' : isWorking === undefined ? 'idle' : isWorking ? 'success' : 'danger';
    const status = t(isTesting ? 'proxies.test.pending' : isWorking === undefined ? 'proxies.test.untested' : isWorking ? 'proxies.test.ok' : 'proxies.test.failed');

    return (
        <div className={`proxy-test-control proxy-test-control--${state}`}>
            <ProxyActionButton icon="test" label={`${t('proxies.actions.test')}: ${status}`} aria-busy={isTesting} busy={isTesting} onClick={onClick} />
            {/* Результат — бейдж состояния: работает — зелёный, сбой — красный, иначе нейтральный. */}
            <span className="proxy-test-state" role="status">{status}</span>
        </div>
    );
};

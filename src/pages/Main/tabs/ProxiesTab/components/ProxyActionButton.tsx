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

export const ProxyActionButton = ({ icon, label, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: Action, label: string }) => (
    <button {...props} type="button" className={`proxy-action proxy-action--${icon} ${className}`} title={label} aria-label={label}>
        <Icon name={ACTION_ICONS[icon]} size={18} motion="pop" />
    </button>
);

export const ProxyTestButton = ({ isTesting, isWorking, onClick }: { isTesting: boolean, isWorking?: boolean, onClick: () => void }) => {
    const { t } = useTranslation();
    const state = isTesting ? 'pending' : isWorking === undefined ? 'idle' : isWorking ? 'success' : 'danger';
    const status = t(isTesting ? 'proxies.test.pending' : isWorking === undefined ? 'proxies.test.untested' : isWorking ? 'proxies.test.ok' : 'proxies.test.failed');

    return (
        <div className={`proxy-test-control proxy-test-control--${state}`}>
            <ProxyActionButton icon="test" label={`${t('proxies.actions.test')}: ${status}`} aria-busy={isTesting} onClick={onClick} />
            <span className="proxy-test-state" role="status">{status}</span>
        </div>
    );
};

import React from 'react';
import { useTranslation } from 'react-i18next';
import './ProxyActions.css';

type Icon = 'test' | 'edit' | 'delete' | 'restore';

export const ProxyActionButton = ({ icon, label, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: Icon, label: string }) => (
    <button {...props} type="button" className={`proxy-action proxy-action--${icon} ${className}`} title={label} aria-label={label}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icon === 'test' && <><path d="M3 12h4l3-7 4 14 3-7h4" /></>}
            {icon === 'edit' && <><path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" /></>}
            {icon === 'delete' && <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>}
            {icon === 'restore' && <><path d="M4 4v6h6M4 10a8 8 0 1 1 1 8" /></>}
        </svg>
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

import react, { FC } from 'react';
import './miniNotifications.css';
import store from '../../store/store';
import { observer } from 'mobx-react';
import TableProxyInterface from '../../../electron/interfaces/Proxy/TableProxyInterface';
import { Trans } from 'react-i18next';
import Icon, { IconName } from '../Icon/Icon';

const MiniNotification: FC = observer(() => {
    if (!store.windows.isMiniNotificationOpen) return <></>;

    switch (store.windows.miniNotificationContent.type) {
        case "info":
            return <InfoMiniNotification text={store.windows.miniNotificationContent.text} />
        case "error":
            return <ErrorMiniNotification text={store.windows.miniNotificationContent.text} />
        case "success":
            return <SuccessMiniNotification text={store.windows.miniNotificationContent.text} />
    }
});

// Тост одного вида: цвет иконки и полосы слева берётся из токена состояния (SDA-9).
// Иконки lucide рисуются currentColor, цвет задаёт miniNotifications.css.
const Toast: FC<{ variant: 'success' | 'error' | 'info', icon: IconName }> = (props) => {
    return (
        <div
            className={`mini_notification mini_notification_${props.variant}`}
            role={props.variant === 'error' ? 'alert' : 'status'}
            style={{ display: store.windows.isMiniNotificationOpen ? 'flex' : 'none' }}
        >
            <Icon name={props.icon} size={20} className='mini_notification__icon' />
            <div className='mini_notification__text'>{props.children}</div>
        </div>
    );
}

const SuccessMiniNotification: FC<{ text: string }> = (props) => {
    return <Toast variant='success' icon='check'>{props.text}</Toast>;
}

const ErrorMiniNotification: FC<{ text: string }> = (props) => {
    return <Toast variant='error' icon='alert'>{props.text}</Toast>;
}

const InfoMiniNotification: FC<{ text: string }> = (props) => {
    return <Toast variant='info' icon='info'>{props.text}</Toast>;
}

const ErrorInTestingProxy: FC<{ proxy: TableProxyInterface }> = (props) => {
    return (
        <Toast variant='error' icon='info'>
            <Trans i18nKey="proxies.test.notWorkingRich" values={{ number: props.proxy.number, host: props.proxy.host, port: props.proxy.port }} components={{ b: <b className='mini_notification__bad' /> }} />
        </Toast>
    )
}

const SuccessInTestingProxy: FC<{ proxy: TableProxyInterface }> = (props) => {
    return (
        <Toast variant='success' icon='info'>
            <Trans i18nKey="proxies.test.workingRich" values={{ number: props.proxy.number, host: props.proxy.host, port: props.proxy.port }} components={{ b: <b className='mini_notification__good' /> }} />
        </Toast>
    )
}

export default MiniNotification;

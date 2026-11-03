import react, { FC } from 'react';
import './miniNotifications.css';
import store from '../../store/store';
import { observer } from 'mobx-react';
import TableProxyInterface from '../../../electron/interfaces/Proxy/TableProxyInterface';
import { Trans } from 'react-i18next';

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
// Иконки — белые SVG-маски, поэтому их можно перекрасить без новых файлов.
const Toast: FC<{ variant: 'success' | 'error' | 'info', icon: string }> = (props) => {
    return (
        <div
            className={`mini_notification mini_notification_${props.variant}`}
            role={props.variant === 'error' ? 'alert' : 'status'}
            style={{ display: store.windows.isMiniNotificationOpen ? 'flex' : 'none' }}
        >
            <span className='mini_notification__icon' aria-hidden='true' style={{ WebkitMaskImage: `url(./assets/img/${props.icon})` }}></span>
            <div className='mini_notification__text'>{props.children}</div>
        </div>
    );
}

const SuccessMiniNotification: FC<{ text: string }> = (props) => {
    return <Toast variant='success' icon='Success.svg'>{props.text}</Toast>;
}

const ErrorMiniNotification: FC<{ text: string }> = (props) => {
    return <Toast variant='error' icon='Error.svg'>{props.text}</Toast>;
}

const InfoMiniNotification: FC<{ text: string }> = (props) => {
    return <Toast variant='info' icon='Info.svg'>{props.text}</Toast>;
}

const ErrorInTestingProxy: FC<{ proxy: TableProxyInterface }> = (props) => {
    return (
        <Toast variant='error' icon='Info.svg'>
            <Trans i18nKey="proxies.test.notWorkingRich" values={{ number: props.proxy.number, host: props.proxy.host, port: props.proxy.port }} components={{ b: <b className='mini_notification__bad' /> }} />
        </Toast>
    )
}

const SuccessInTestingProxy: FC<{ proxy: TableProxyInterface }> = (props) => {
    return (
        <Toast variant='success' icon='Info.svg'>
            <Trans i18nKey="proxies.test.workingRich" values={{ number: props.proxy.number, host: props.proxy.host, port: props.proxy.port }} components={{ b: <b className='mini_notification__good' /> }} />
        </Toast>
    )
}

export default MiniNotification;

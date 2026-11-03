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

const SuccessMiniNotification: FC<{ text: string }> = (props) => {
    return (
        <div className='mini_notification' style={{ display: store.windows.isMiniNotificationOpen ? 'flex' : 'none' }}>
            <img src="./assets/img/success.svg" alt="" />
            <div>{props.text}</div>
        </div>
    );
}

const ErrorMiniNotification: FC<{ text: string }> = (props) => {
    return (
        <div className='mini_notification' style={{ display: store.windows.isMiniNotificationOpen ? 'flex' : 'none' }}>
            <img src="./assets/img/Error.svg" alt="" />
            <div>{props.text}</div>
        </div>
    );
}

const InfoMiniNotification: FC<{ text: string }> = (props) => {
    return (
        <div className='mini_notification' style={{ display: store.windows.isMiniNotificationOpen ? 'flex' : 'none' }}>
            <img src="./assets/img/Info.svg" alt="" />
            <div>{props.text}</div>
        </div>
    );
}

const ErrorInTestingProxy: FC<{ proxy: TableProxyInterface }> = (props) => {
    return (
        <div className='mini_notification' style={{ display: store.windows.isMiniNotificationOpen ? 'flex' : 'none' }}>
            <img src="./assets/img/Info.svg" alt="" />
            <div><Trans i18nKey="proxies.test.notWorkingRich" values={{ number: props.proxy.number, host: props.proxy.host, port: props.proxy.port }} components={{ b: <b style={{ color: "#FA403A" }} /> }} /></div>
        </div>
    )
}

const SuccessInTestingProxy: FC<{ proxy: TableProxyInterface }> = (props) => {
    return (
        <div className='mini_notification' style={{ display: store.windows.isMiniNotificationOpen ? 'flex' : 'none' }}>
            <img src="./assets/img/Info.svg" alt="" />
            <div><Trans i18nKey="proxies.test.workingRich" values={{ number: props.proxy.number, host: props.proxy.host, port: props.proxy.port }} components={{ b: <b style={{ color: "#6BF06C" }} /> }} /></div>
        </div>
    )
}

export default MiniNotification;
import react, { FC } from 'react';
import { useTranslation } from 'react-i18next';
import './Attic.css';

type WindowName = "askSomething" | "main" | "confirmations" | "auth" | "error";

const Attic: FC<AtticInterface> = (props) => {
    const { t } = useTranslation("shell");

    const close = () => {
        switch (props.windowName) {
            case "main":
                return window.Main.window.close();
            case "askSomething":
                return window.AskFamilyPin.windowApi.close(props.id!);
            case "confirmations":
                return window.Confirmations.windowApi.close(props.id!);
            case "auth":
                return window.Auth.windowApi.close();
            case "error":
                return window.ErrorWindow.windowApi.close(props.id!);
        }
    };
    const toggleMaximize = () => {
        console.log(window.innerHeight, screen.height - 40)
        if (window.innerHeight === screen.height - 40) {
            switch (props.windowName) {
                case "main":
                    return window.Main.window.centerize();
                case "askSomething":
                    return window.AskFamilyPin.windowApi.centerize(props.id!);
                case "confirmations":
                    return window.Confirmations.windowApi.centerize(props.id!);
                case "auth":
                    return window.Auth.windowApi.centerize();
                case "error":
                    return window.ErrorWindow.windowApi.centerize(props.id!);
            }
        } else {
            switch (props.windowName) {
                case "main":
                    return window.Main.window.maximize();
                case "askSomething":
                    return window.AskFamilyPin.windowApi.maximize(props.id!);
                case "confirmations":
                    return window.Confirmations.windowApi.maximize(props.id!);
                case "auth":
                    return window.Auth.windowApi.maximize();
                case "error":
                    return window.ErrorWindow.windowApi.maximize(props.id!);
            }
        }
    };
    const minimize = () => {
        switch (props.windowName) {
            case "main":
                return window.Main.window.minimize();
            case "askSomething":
                return window.AskFamilyPin.windowApi.minimize(props.id!);
            case "confirmations":
                console.log(props);
                return window.Confirmations.windowApi.minimize(props.id!);
            case "auth":
                return window.Auth.windowApi.minimize();
            case "error":
                return window.ErrorWindow.windowApi.minimize(props.id!);
        }
    };

    // Кнопки окна вне Tab-порядка, как системные. Подпись только в title (он же доступное имя):
    // aria-label="Close" совпал бы с селектором закрытия модалок в скриншот-харнессе и закрыл бы окно.
    const windowButton = (kind: "minimize" | "maximize" | "close", onClick: () => void) => (
        <button
            type="button"
            tabIndex={-1}
            className={`attic-button attic-button_${kind}`}
            title={t(`attic.${kind}`)}
            onClick={onClick}
        />
    );

    return (
        <>
            <div className='attic'>
                <div className='drag'>
                    {props.title ? props.title : (
                        <>
                            <span className='attic-name'>BHORC SDA</span>
                            <span className='attic-version'>v{__APP_VERSION__}</span>
                        </>
                    )}
                </div>
                <div className='buttons'>
                    {windowButton("minimize", minimize)}
                    {windowButton("maximize", toggleMaximize)}
                    {windowButton("close", close)}
                </div>
            </div>
        </>
    );
}

interface AtticInterface {
    title?: string,
    windowName: WindowName,
    id?: string
}

export default Attic;

import react, { FC, FormEvent, useState } from 'react';
import TitleBar from '../../globalComponents/TitleBar/TitleBar';
import Button from '../../globalComponents/Button/Button';
import { useTranslation } from 'react-i18next';

/**
 * Окно ввода кода (PIN семейного просмотра, код с почты, код из SMS): подпись, поле моноширинным
 * шрифтом, «Отмена» и «Подтвердить». Enter отправляет код. «Отмена» идёт через abort: main
 * закрывает окно и отклоняет запрос с причиной («ввод отменён»), системное закрытие — без причины.
 */
const AskCodeForm: FC<{ steamAccountName: string, id: string, label: string, maxLength: number }> = (props) => {
    const [pin, setPin] = useState("");
    const { t } = useTranslation();
    const { steamAccountName, id, label, maxLength } = props;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        window.AskFamilyPin.askFamilyPinApi.sendData(id, pin);
    };

    return (
        <div className="ask-family-pin-wrapper">
            <TitleBar platform={window.AskFamilyPin.platform} title={steamAccountName} />
            <form className="ask-family-pin-container" onSubmit={submit}>
                <label htmlFor="ask-code-input" className="ask-code-label">{label}</label>
                <div className="ask-code-row">
                    <input
                        id="ask-code-input"
                        type="text"
                        className="ask-family-pin-input"
                        autoFocus
                        autoComplete="one-time-code"
                        spellCheck={false}
                        placeholder={"•".repeat(maxLength)}
                        value={pin}
                        onChange={(event) => {
                            const value = event.target.value;
                            if (pin.length >= maxLength && value.length >= maxLength) return;
                            setPin(value);
                        }}
                    ></input>
                    <Button
                        className="ask-cancel-button"
                        size="small"
                        color="grey"
                        hoverColor="grey"
                        text={t("common.buttons.cancel")}
                        onClick={() => {
                            window.AskFamilyPin.askFamilyPinApi.abort(id);
                        }}
                    ></Button>
                    <Button
                        className="ask-confirm-button sda-sweep"
                        type="submit"
                        size="small"
                        color="grey"
                        hoverColor="grey"
                        text={t("common.buttons.confirm")}
                    ></Button>
                </div>
            </form>
        </div>
    );
}

export default AskCodeForm;

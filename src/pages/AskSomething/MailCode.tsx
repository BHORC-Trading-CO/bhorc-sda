import react, { FC, useState } from 'react';
import TitleBar from '../../globalComponents/TitleBar/TitleBar';
import Button from '../../globalComponents/Button/Button';
import { useTranslation } from 'react-i18next';

const MailCode: FC<{ steamAccountName: string, id: string }> = (props) => {
    const [pin, setPin] = useState("");
    const { t } = useTranslation();
    const { steamAccountName, id } = props;

    return (
        <div className="ask-family-pin-wrapper">
            <TitleBar platform={window.AskFamilyPin.platform} title={steamAccountName} />
            <div className="ask-family-pin-container">
                <div className="">
                    <label htmlFor="ask-code-input" className="text-white-large">{t("ask.mailCode.label")}</label>
                    <input
                        id="ask-code-input"
                        type="text"
                        className="ask-family-pin-input text-white-medium"
                        value={pin}
                        onChange={(event) => {
                            const value = event.target.value;
                            if (pin.length >= 5 && value.length >= 5) return;
                            setPin(value);
                        }}
                    ></input>
                </div>
                <Button
                    className="ask-confirm-button"
                    size="medium"
                    color="grey"
                    hoverColor="grey"
                    text={t("common.buttons.confirm")}
                    onClick={() => {
                        window.AskFamilyPin.askFamilyPinApi.sendData(id, pin);
                    }}
                ></Button>
            </div>
        </div>
    );
}

export default MailCode;
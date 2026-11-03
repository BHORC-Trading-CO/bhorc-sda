import react, { FC, useState } from 'react';
import Attic from '../../globalComponents/Attic/Attic';
import Button from '../../globalComponents/Button/Button';
import { useTranslation } from 'react-i18next';

const SmsCode: FC<{ steamAccountName: string, id: string }> = (props) => {
    const [pin, setPin] = useState("");
    const { t } = useTranslation();
    const { steamAccountName, id } = props;

    return (
        <div className="ask-family-pin-wrapper">
            <Attic title={steamAccountName} windowName="askSomething" id={props.id} ></Attic>
            <div className="ask-family-pin-container">
                <div className="">
                    <span className="text-white-large">{t("ask.smsCode.label")}</span>
                    <input
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

export default SmsCode;
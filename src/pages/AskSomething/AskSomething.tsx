import react, { FC, useState, useEffect } from "react";
import InfoType from "../../../electron/components/application/askInfo/InfoType";
import "./AskSomething.css";
import AskCodeForm from "./AskCodeForm";
import TitleBar from "../../globalComponents/TitleBar/TitleBar";
import { useTranslation } from "react-i18next";

const AskSomething: FC = () => {
  const { t } = useTranslation();
  const [id, setId] = useState("");
  const [steamAccountName, setSteamAccountName] = useState("");
  const [infoType, setInfoType] = useState<InfoType>("none");

  useEffect(() => {
    window.AskFamilyPin.askFamilyPinApi
    window.AskFamilyPin.askFamilyPinApi.onGetParams(
      (event, { steamAccountName, id, infoType }) => {
        console.log(id);
        setSteamAccountName(steamAccountName);
        setId(id);
        setInfoType(infoType);
      }
    );
  });

  // Длина кода: PIN семейного просмотра — 4 знака, коды с почты и из SMS — 5.
  switch (infoType) {
    case "familyPin":
      return <AskCodeForm steamAccountName={steamAccountName} id={id} label={t("ask.familyPin.label")} maxLength={4} />;
    case "mailCode":
      return <AskCodeForm steamAccountName={steamAccountName} id={id} label={t("ask.mailCode.label")} maxLength={5} />;
    case "smsCode":
      return <AskCodeForm steamAccountName={steamAccountName} id={id} label={t("ask.smsCode.label")} maxLength={5} />;
    default:
      // До параметров из main (~50 мс после загрузки) и для неизвестного типа: та же полоса окна,
      // чтобы его можно было перетащить, и строка по центру.
      return (
        <div className="ask-family-pin-wrapper">
          <TitleBar platform={window.AskFamilyPin.platform} title={steamAccountName} />
          <div className="ask-family-pin-container ask-family-pin-container--empty">
            {infoType === "none" ? t("ask.nothing") : t("ask.unknown")}
          </div>
        </div>
      );
  }
};

export default AskSomething;

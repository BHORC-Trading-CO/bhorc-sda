import react, { FC, useState, useEffect } from "react";
import InfoType from "../../../electron/components/application/askInfo/InfoType";
import "./AskSomething.css";
import FamilyPin from "./FamilyPin";
import MailCode from "./MailCode";
import SmsCode from "./SmsCode";
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

  switch (infoType) {
    case "none":
      return <>{t("ask.nothing")}</>;
    case "familyPin":
      return <FamilyPin steamAccountName={steamAccountName} id={id} />;
    case "mailCode":
      return <MailCode steamAccountName={steamAccountName} id={id} />
    case "smsCode":
      return <SmsCode steamAccountName={steamAccountName} id={id} />
    default:
      return <>{t("ask.unknown")}</>
  }
};

export default AskSomething;

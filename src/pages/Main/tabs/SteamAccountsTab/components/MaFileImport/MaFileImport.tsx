import react, { FC, useState, useRef, useEffect } from "react";
import Button from "../../../../../../globalComponents/Button/Button";
import { observer } from "mobx-react";
import store from "../../../../../../store/store";
import readFile from "../../../../../../globalComponents/SomeFuncs/readFile";
import MaFileInterface from "../../../../../../../electron/interfaces/SteamAccount/MaFileInterface";
import MaFile from "../../../../../../globalComponents/MaFile/MaFile";
import { useTranslation } from "react-i18next";

const MaFileImport: FC<{ currentMaFile: MaFileInterface | null, onChange: (newMaFile: MaFileInterface | null) => void }> = observer((props) => {
    const [maFileHidden, setMaFileHidden] = useState(true);
    const { t } = useTranslation();
    const { currentMaFile, onChange } = props;

    return (
        <div className="import-account">
            <Button
                size="medium"
                img="./assets/img/Download.svg"
                style={{ width: "100%", marginBottom: "20px" }}
                text={
                    currentMaFile
                        ? `${currentMaFile.account_name}`
                        : t("maFile.load")
                }
                color="grey"
                hoverColor="light-grey"
                onClick={() => {
                    const el = document.getElementById("maFileImportInput");
                    el?.click();
                }}
                altText={t("maFile.attach")}
            />
            {currentMaFile ? (
                <div>
                    <Button
                        size="medium"
                        style={{ width: "100%", marginBottom: "20px" }}
                        text={maFileHidden ? t("common.buttons.expand") : t("common.buttons.collapse")}
                        color="grey"
                        hoverColor="light-grey"
                        onClick={() => { setMaFileHidden(!maFileHidden) }}
                        altText={maFileHidden ? t("common.buttons.expand") : t("common.buttons.collapse")}
                    ></Button>
                    {maFileHidden ? <></> : <MaFile maFile={currentMaFile}></MaFile>}
                </div>
            ) : (
                <></>
            )}
            <input
                type="file"
                id="maFileImportInput"
                style={{ display: "none" }}
                onChange={async (event) => {
                    const files = event.target.files;

                    if (files) {
                        readFile(files[0])
                            .then((maFile: MaFileInterface) => {
                                if (maFile.Session) {
                                    const steamid: any = maFile.Session.SteamID;
                                    if (typeof (steamid) != 'string') {
                                        maFile.Session.SteamID = String(steamid.c[0]) + String(steamid.c[1]);
                                    }
                                }


                                onChange(maFile);
                            })
                            .catch((err) => {
                                onChange(null);
                                event.target.value = "";
                                store.windows.openMiniNotification({
                                    text: t("maFile.invalid", { error: String(err) }),
                                    type: "error",
                                });
                            });
                    }
                }}
            />
        </div>
    );
});

export default MaFileImport;

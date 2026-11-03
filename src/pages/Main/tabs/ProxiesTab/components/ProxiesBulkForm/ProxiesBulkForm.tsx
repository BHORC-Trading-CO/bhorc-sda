import react, { FC, useState } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Delimeter from "../../../../../../globalComponents/Delimeter/Delimeter";
import Button from "../../../../../../globalComponents/Button/Button";
import "../ProxiesCreationForm/ProxiesCreationForm.css";
import "./ProxiesBulkForm.css";
import { useTranslation } from "react-i18next";

const ProxiesBulkForm: FC = observer(() => {
  const { t } = useTranslation();
  if (!store.proxiesTable.isBulkFormOpen) return <></>;

  return (
    <MiniWindow
      title={t("proxies.bulk.title")}
      width="800px"
      height=""
      content={<BulkFormContent />}
      onClose={() => {
        store.proxiesTable.closeBulkForm();
      }}
    />
  );
});

const BulkFormContent: FC = () => {
  const [rawText, setRawText] = useState("");
  const { t } = useTranslation();

  return (
    <div className="proxy__container">
      <div className="proxy-create__container">
        <label htmlFor="proxy-bulk-value" className="proxy-field-label">{t("proxies.bulk.label")}</label>
        <div id="proxy-bulk-format" className="proxy-data-example text-grey-medium">
          {t("proxies.bulk.example")}
        </div>
        <textarea
          id="proxy-bulk-value"
          aria-describedby="proxy-bulk-format"
          className="text-area text-grey-medium proxy-bulk-textarea"
          placeholder={t("proxies.bulk.placeholder")}
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
          }}
        ></textarea>
        <Delimeter marginTop="26px" marginBottom="15px"></Delimeter>
      </div>
      <div className="proxy-button__container">
        <Button
          size="medium"
          text={t("common.buttons.cancel")}
          color="grey"
          hoverColor="grey"
          onClick={() => {
            store.proxiesTable.closeBulkForm();
          }}
        ></Button>
        <Button
          size="medium"
          text={t("common.buttons.save")}
          onClick={() => {
            if (rawText.trim().length === 0) {
              store.windows.openMiniNotification({
                type: "error",
                text: t("proxies.bulk.empty"),
              });
              return;
            }
            store.proxiesTable.createBulk(rawText);
            store.proxiesTable.closeBulkForm();
          }}
        ></Button>
      </div>
    </div>
  );
};

export default ProxiesBulkForm;

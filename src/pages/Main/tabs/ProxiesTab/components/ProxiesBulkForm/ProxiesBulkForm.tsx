import react, { FC, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Delimeter from "../../../../../../globalComponents/Delimeter/Delimeter";
import Button from "../../../../../../globalComponents/Button/Button";
import "../ProxiesCreationForm/ProxiesCreationForm.css";
import "./ProxiesBulkForm.css";
import { useTranslation } from "react-i18next";
import { ProxyBulkReason } from "../../../../../../../electron/interfaces/Proxy/ProxyResults";

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

const BulkFormContent: FC = observer(() => {
  const [rawText, setRawText] = useState("");
  const [rejectedReasons, setRejectedReasons] = useState<ProxyBulkReason[]>([]);
  const isSaving = store.proxiesTable.isSavingBulk;
  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);
  const { t } = useTranslation();

  const save = async () => {
    if (isSaving) return;
    if (rawText.trim().length === 0) {
      store.windows.openMiniNotification({
        type: "error",
        text: t("proxies.bulk.empty"),
      });
      return;
    }
    const { rejected } = await store.proxiesTable.createBulk(rawText);
    if (!isMounted.current) return;
    if (rejected.length === 0) return store.proxiesTable.closeBulkForm();
    // Отклонённые строки остаются в поле: их можно исправить и сохранить ещё раз (SDA-64).
    setRawText(rejected.map(({ line }) => line).join("\n"));
    setRejectedReasons(rejected.map(({ reason }) => reason));
  };

  return (
    <div className="proxies-form proxy__container">
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
          // Ответ заменит текст отклонёнными строками: набранное за это время пропало бы (SDA-64).
          readOnly={isSaving}
          onChange={(e) => {
            setRawText(e.target.value);
          }}
        ></textarea>
        <BulkRejected reasons={rejectedReasons} />
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
          isLoad={isSaving}
          onClick={save}
        ></Button>
      </div>
    </div>
  );
});

// Сколько строк не добавлено и почему: по строке на причину.
export const BulkRejected: FC<{ reasons: ProxyBulkReason[] }> = ({ reasons }) => {
  const { t } = useTranslation();
  if (reasons.length === 0) return <></>;
  return (
    <div className="proxy-form-error" role="alert">
      {t("proxies.bulk.rejected", { count: reasons.length })}
      <ul className="proxy-form-error__list">
        {Array.from(new Set(reasons)).map((reason) => (
          <li key={reason}>{t(`proxies.reject.${reason}`)}: {reasons.filter((other) => other === reason).length}</li>
        ))}
      </ul>
    </div>
  );
};

export default ProxiesBulkForm;

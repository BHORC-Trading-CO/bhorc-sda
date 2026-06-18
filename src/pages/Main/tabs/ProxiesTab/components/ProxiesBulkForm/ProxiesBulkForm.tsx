import react, { FC, useState } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Delimeter from "../../../../../../globalComponents/Delimeter/Delimeter";
import Button from "../../../../../../globalComponents/Button/Button";
import "./ProxiesBulkForm.css";

const ProxiesBulkForm: FC = observer(() => {
  if (!store.proxiesTable.isBulkFormOpen) return <></>;

  return (
    <MiniWindow
      title="Массовое добавление прокси"
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

  return (
    <div className="proxy__container">
      <div className="proxy-create__container">
        <div className="proxy-data-example text-grey-medium">
          Один прокси на строку. Пример: Login:Password@1.1.1.1:7777
        </div>
        <textarea
          className="text-area text-grey-medium proxy-bulk-textarea"
          placeholder={"Login:Password@1.1.1.1:7777\nLogin:Password@2.2.2.2:7777"}
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
          text="Отменить"
          color="grey"
          hoverColor="grey"
          onClick={() => {
            store.proxiesTable.closeBulkForm();
          }}
        ></Button>
        <Button
          size="medium"
          text="Сохранить"
          onClick={() => {
            if (rawText.trim().length === 0) {
              store.windows.openMiniNotification({
                type: "error",
                text: "Поле пустое!",
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

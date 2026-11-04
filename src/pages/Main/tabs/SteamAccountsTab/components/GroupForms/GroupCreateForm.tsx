import { FC, FormEvent, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Button from "../../../../../../globalComponents/Button/Button";
import Input from "../../../../../../globalComponents/Input/Input";
import "./GroupForms.css";

interface GroupCreateFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Вызывается после отправки в main, до закрытия окна. */
  onCreated?: () => void;
}

// Окно «Новая группа» (кнопка в строке групп, R2): пустая группа с названием; аккаунты в неё
// добавляются потом кнопкой «В группу». Проверка названия — как в GroupEditForm.
const GroupCreateForm: FC<GroupCreateFormProps> = observer((props) => {
  const { t } = useTranslation("shell");
  if (!props.isOpen) return <></>;

  // Окно рисуется в строке групп, то есть в DOM раньше таблицы, а у затемнения (.darkBackground)
  // нет z-index: без своего слоя поверх окна легли бы позиционированные ячейки и кнопки таблицы.
  // Слой выше липкой шапки таблицы (z-index 2) и ниже тоста ошибки (1000).
  return (
    <div style={{ position: "relative", zIndex: 3 }}>
      <MiniWindow
        title={t("groups.createTitle")}
        width="440px"
        height=""
        content={<CreateFormContent onClose={props.onClose} onCreated={props.onCreated} />}
        onClose={props.onClose}
      />
    </div>
  );
});

const CreateFormContent: FC<Omit<GroupCreateFormProps, "isOpen">> = (props) => {
  const { t } = useTranslation("shell");
  const [name, setName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Окно открыли, чтобы ввести название: курсор сразу в поле.
  useEffect(() => {
    formRef.current?.querySelector("input")?.focus();
  }, []);

  // Enter в поле отправляет форму; по умолчанию браузер ушёл бы со страницы.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      store.windows.openMiniNotification({ type: "error", text: t("groups.emptyName") });
      return;
    }
    store.groups.createGroup(trimmed, []);
    props.onCreated?.();
    props.onClose();
  };

  return (
    <form className="group-form-wrapper" ref={formRef} onSubmit={submit} noValidate>
      <div className="group-form">
        <section className="group-form__section">
          <h3 className="sda-form-section__title group-form__section-title">{t("groups.name")}</h3>
          <Input value={name} placeholder={t("groups.name")} onChange={(value) => setName(value)} />
        </section>
      </div>

      <div className="sda-form-footer">
        <Button
          size="medium"
          text={t("common:common.buttons.cancel")}
          color="grey"
          hoverColor="light-grey"
          onClick={props.onClose}
        />
        <Button size="medium" type="submit" text={t("groups.create")} testId="group-create-submit" />
      </div>
    </form>
  );
};

export default GroupCreateForm;

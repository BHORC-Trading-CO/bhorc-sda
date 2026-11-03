import React, { FC, useState, useEffect } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Button from "../../../../../../globalComponents/Button/Button";
import Input from "../../../../../../globalComponents/Input/Input";
import "./GroupForms.css";
import { useTranslation } from "react-i18next";

// Popup редактирования группы (иконка карандаша в навигации): переименование и удаление.
const GroupEditForm: FC = observer(() => {
  const { t } = useTranslation();
  if (store.groups.editingGroupId === null) return <></>;
  const group = store.groups
    .getGroups()
    .find((g) => g.id === store.groups.editingGroupId);
  if (!group) return <></>;

  return (
    <MiniWindow
      title={t("groups.edit.title")}
      width="440px"
      height=""
      content={<EditFormContent groupId={group.id} groupName={group.name} />}
      onClose={() => store.groups.closeEditForm()}
    />
  );
});

const EditFormContent: FC<{ groupId: string; groupName: string }> = observer(
  (props) => {
    const [name, setName] = useState(props.groupName);
    const { t } = useTranslation();

    // Синхронизируем поле, если переоткрыли форму для другой группы
    useEffect(() => {
      setName(props.groupName);
    }, [props.groupId]);

    const save = () => {
      if (!name.trim()) {
        return store.windows.openMiniNotification({
          type: "error",
          text: t("groups.edit.emptyName"),
        });
      }
      store.groups.renameGroup(props.groupId, name.trim());
      store.groups.closeEditForm();
    };

    const remove = () => {
      // danger: красная кнопка подтверждения в Prompt (необязательное поле, см. Prompt.tsx).
      const content = {
        type: "question" as const,
        title: t("groups.delete.title", { name: props.groupName }),
        text: t("groups.delete.text"),
        acceptButtonText: t("groups.delete.button"),
        cancelButtonText: t("prompt.cancel"),
        danger: true,
        cb: () => {
          store.groups.deleteGroup(props.groupId);
          store.groups.closeEditForm();
        },
      };
      store.windows.prompt(content);
    };

    return (
      <div className="group-form-wrapper">
        <div className="group-form">
          <section className="group-form__section">
            <h3 className="sda-form-section__title group-form__section-title">
              {t("groups.edit.name")}
            </h3>
            <Input
              value={name}
              placeholder={t("groups.edit.name")}
              onChange={(value) => setName(value)}
            />
          </section>
        </div>

        <div className="sda-form-footer">
          <Button
            size="medium"
            text={t("groups.delete.button")}
            color="grey"
            hoverColor="dark-pink"
            className="sda-button--danger"
            onClick={remove}
          />
          <Button size="medium" text={t("common.buttons.save")} onClick={save} />
        </div>
      </div>
    );
  }
);

export default GroupEditForm;

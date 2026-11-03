import React, { FC, useState, useEffect } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Button from "../../../../../../globalComponents/Button/Button";
import Input from "../../../../../../globalComponents/Input/Input";
import Delimeter from "../../../../../../globalComponents/Delimeter/Delimeter";
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
      store.windows.prompt({
        type: "question",
        title: t("groups.delete.title", { name: props.groupName }),
        text: t("groups.delete.text"),
        acceptButtonText: t("groups.delete.button"),
        cancelButtonText: t("prompt.cancel"),
        cb: () => {
          store.groups.deleteGroup(props.groupId);
          store.groups.closeEditForm();
        },
      });
    };

    return (
      <div className="group-form">
        <div className="group-form__section-title text-white-medium">
          {t("groups.edit.name")}
        </div>
        <Input
          value={name}
          placeholder={t("groups.edit.name")}
          onChange={(value) => setName(value)}
        />

        <div className="group-form__buttons">
          <Button
            size="medium"
            text={t("groups.delete.button")}
            color="grey"
            hoverColor="dark-pink"
            onClick={remove}
          />
          <Button size="medium" text={t("common.buttons.save")} onClick={save} />
        </div>
        <Delimeter marginTop="6px" marginBottom="0px" />
      </div>
    );
  }
);

export default GroupEditForm;

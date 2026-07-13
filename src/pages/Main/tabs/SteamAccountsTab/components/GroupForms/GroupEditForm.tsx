import React, { FC, useState, useEffect } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Button from "../../../../../../globalComponents/Button/Button";
import Input from "../../../../../../globalComponents/Input/Input";
import Delimeter from "../../../../../../globalComponents/Delimeter/Delimeter";
import "./GroupForms.css";

// Popup редактирования группы (иконка карандаша в навигации): переименование и удаление.
const GroupEditForm: FC = observer(() => {
  if (store.groups.editingGroupId === null) return <></>;
  const group = store.groups
    .getGroups()
    .find((g) => g.id === store.groups.editingGroupId);
  if (!group) return <></>;

  return (
    <MiniWindow
      title="Редактировать группу"
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

    // Синхронизируем поле, если переоткрыли форму для другой группы
    useEffect(() => {
      setName(props.groupName);
    }, [props.groupId]);

    const save = () => {
      if (!name.trim()) {
        return store.windows.openMiniNotification({
          type: "error",
          text: "Название группы не может быть пустым",
        });
      }
      store.groups.renameGroup(props.groupId, name.trim());
      store.groups.closeEditForm();
    };

    const remove = () => {
      store.windows.prompt({
        type: "question",
        title: `Удалить группу «${props.groupName}»?`,
        text: "Аккаунты из группы не удаляются — они просто перестанут быть в этой группе.",
        acceptButtonText: "Удалить группу",
        cancelButtonText: "Отмена",
        cb: () => {
          store.groups.deleteGroup(props.groupId);
          store.groups.closeEditForm();
        },
      });
    };

    return (
      <div className="group-form">
        <div className="group-form__section-title text-white-medium">
          Название группы
        </div>
        <Input
          value={name}
          placeholder="Название группы"
          onChange={(value) => setName(value)}
        />

        <div className="group-form__buttons">
          <Button
            size="medium"
            text="Удалить группу"
            color="grey"
            hoverColor="dark-pink"
            onClick={remove}
          />
          <Button size="medium" text="Сохранить" onClick={save} />
        </div>
        <Delimeter marginTop="6px" marginBottom="0px" />
      </div>
    );
  }
);

export default GroupEditForm;

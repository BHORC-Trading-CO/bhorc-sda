import React, { FC, useState } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Button from "../../../../../../globalComponents/Button/Button";
import Input from "../../../../../../globalComponents/Input/Input";
import Delimeter from "../../../../../../globalComponents/Delimeter/Delimeter";
import "./GroupForms.css";

// Popup "В группу": назначить выделенные аккаунты в существующую группу
// или создать новую и сразу их туда добавить.
const GroupAssignForm: FC = observer(() => {
  if (!store.groups.isAssignFormOpen) return <></>;

  return (
    <MiniWindow
      title="Добавить аккаунты в группу"
      width="480px"
      height=""
      content={<AssignFormContent />}
      onClose={() => store.groups.closeAssignForm()}
    />
  );
});

const AssignFormContent: FC = observer(() => {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const selectedAccounts = Object.values(
    store.steamAccountsTable.getSteamAccounts()
  ).filter((a) => a.isSelected && !a.deleted);
  const groups = store.groups.getGroups();

  const apply = () => {
    if (selectedAccounts.length === 0) {
      return store.windows.openMiniNotification({
        type: "error",
        text: "Не выбрано ни одного аккаунта",
      });
    }
    const ids = selectedAccounts.map((a) => a.id);

    if (newName.trim()) {
      store.groups.createGroup(newName.trim(), ids);
    } else if (selectedGroupId) {
      store.groups.assignToGroup(selectedGroupId, ids);
    } else {
      return store.windows.openMiniNotification({
        type: "error",
        text: "Выберите группу или введите название новой",
      });
    }
    store.groups.closeAssignForm();
  };

  return (
    <div className="group-form">
      <div className="group-form__caption text-grey-medium">
        Выбрано аккаунтов: {selectedAccounts.length}
      </div>

      {groups.length > 0 && (
        <>
          <div className="group-form__section-title text-white-medium">
            Существующие группы
          </div>
          <div className="group-form__list">
            {groups.map((group) => (
              <div
                key={group.id}
                className={
                  "group-form__item" +
                  (selectedGroupId === group.id ? " group-form__item_active" : "")
                }
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setNewName("");
                }}
              >
                <span className="group-form__item-name">{group.name}</span>
                <span className="group-form__item-count text-grey-medium">
                  {group.steamAccountIds.length}
                </span>
              </div>
            ))}
          </div>
          <Delimeter marginTop="18px" marginBottom="14px" />
        </>
      )}

      <div className="group-form__section-title text-white-medium">
        Новая группа
      </div>
      <Input
        value={newName}
        placeholder="Название новой группы"
        onChange={(value) => {
          setNewName(value);
          if (value) setSelectedGroupId(null);
        }}
      />

      <div className="group-form__buttons">
        <Button
          size="medium"
          text="Отменить"
          color="grey"
          hoverColor="grey"
          onClick={() => store.groups.closeAssignForm()}
        />
        <Button size="medium" text="Применить" onClick={apply} />
      </div>
    </div>
  );
});

export default GroupAssignForm;

import React, { FC, useState } from "react";
import { observer } from "mobx-react";
import MiniWindow from "../../../../components/MiniWindow/MiniWindow";
import store from "../../../../../../store/store";
import Button from "../../../../../../globalComponents/Button/Button";
import Input from "../../../../../../globalComponents/Input/Input";
import "./GroupForms.css";
import { useTranslation } from "react-i18next";

// Popup "В группу": назначить выделенные аккаунты в существующую группу
// или создать новую и сразу их туда добавить.
const GroupAssignForm: FC = observer(() => {
  const { t } = useTranslation();
  if (!store.groups.isAssignFormOpen) return <></>;

  return (
    <MiniWindow
      title={t("groups.assign.title")}
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
  const { t } = useTranslation();

  const selectedAccounts = Object.values(
    store.steamAccountsTable.getSteamAccounts()
  ).filter((a) => a.isSelected && !a.deleted);
  const groups = store.groups.getGroups();

  const apply = () => {
    if (selectedAccounts.length === 0) {
      return store.windows.openMiniNotification({
        type: "error",
        text: t("common.noAccountsSelected"),
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
        text: t("groups.assign.chooseOrName"),
      });
    }
    store.groups.closeAssignForm();
  };

  return (
    <div className="group-form-wrapper">
      <div className="group-form">
        <div className="group-form__caption">
          {t("groups.assign.selectedCount", { count: selectedAccounts.length })}
        </div>

        {groups.length > 0 && (
          <section className="group-form__section">
            <h3 className="sda-form-section__title group-form__section-title">
              {t("groups.assign.existing")}
            </h3>
            <div className="group-form__list" role="listbox" aria-label={t("groups.assign.existing")}>
              {groups.map((group) => (
                <div
                  key={group.id}
                  role="option"
                  aria-selected={selectedGroupId === group.id}
                  tabIndex={0}
                  className={
                    "group-form__item" +
                    (selectedGroupId === group.id ? " group-form__item_active" : "")
                  }
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setNewName("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedGroupId(group.id);
                      setNewName("");
                    }
                  }}
                >
                  <span className="group-form__item-name">{group.name}</span>
                  <span className="group-form__item-count">
                    {group.steamAccountIds.length}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="group-form__section">
          <h3 className="sda-form-section__title group-form__section-title">
            {t("groups.assign.newGroup")}
          </h3>
          <Input
            value={newName}
            placeholder={t("groups.assign.newGroupName")}
            onChange={(value) => {
              setNewName(value);
              if (value) setSelectedGroupId(null);
            }}
          />
        </section>
      </div>

      <div className="sda-form-footer">
        <Button
          size="medium"
          text={t("common.buttons.cancel")}
          color="grey"
          hoverColor="light-grey"
          onClick={() => store.groups.closeAssignForm()}
        />
        <Button size="medium" text={t("common.buttons.apply")} onClick={apply} />
      </div>
    </div>
  );
});

export default GroupAssignForm;

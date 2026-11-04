import { useEffect, useRef, useState, WheelEvent } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import store from "../../../../../../store/store";
import Icon from "../../../../../../globalComponents/Icon/Icon";
import GroupCreateForm from "../GroupForms/GroupCreateForm";
import "./GroupsRow.css";

/**
 * Строка групп под верхней панелью (R2), только на странице Steam аккаунтов: «Все аккаунты»,
 * группы (клик — фильтр таблицы, карандаш на ховере — редактирование) и «Новая группа».
 * Группы между «Все аккаунты» и «Новая группа» прокручиваются вбок: обе крайние кнопки всегда
 * видны, края списка затухают, если за ними есть ещё группы.
 */
const GroupsRow = observer(() => {
  if (store.tabs.active !== "steamAccounts") return null;
  return <GroupsRowContent />;
});

const GroupsRowContent = observer(() => {
  const { t } = useTranslation("shell");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [fade, setFade] = useState({ left: false, right: false });
  const scrollRef = useRef<HTMLDivElement>(null);
  // После «Создать» новая группа приходит из main последней: число групп в момент создания,
  // прокрутка к концу — когда список станет длиннее.
  const scrollToEndAfterRef = useRef<number | null>(null);

  const groups = store.groups.getGroups();
  const activeGroupId = store.groups.activeGroupId;
  // Сколько аккаунтов без архивных; читаем только ключи и флаг deleted, без копии всех аккаунтов.
  const total = Object.values(store.steamAccountsTable.steamAccounts).filter((account) => !account.deleted).length;

  const updateFade = () => {
    const el = scrollRef.current;
    const left = !!el && el.scrollLeft > 1;
    const right = !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  // После каждой отрисовки (группы, названия, язык): затухание по тому, что реально не влезло.
  useEffect(() => {
    const after = scrollToEndAfterRef.current;
    if (after !== null && groups.length > after) {
      scrollToEndAfterRef.current = null;
      if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
    updateFade();
  });

  useEffect(() => {
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, []);

  // Колесо мыши без горизонтальной прокрутки листает список вбок.
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY;
  };

  const fadeClass = `${fade.left ? " groups-row-scroll_fade-left" : ""}${fade.right ? " groups-row-scroll_fade-right" : ""}`;

  return (
    <>
      <div className="groups-row" role="group" aria-label={t("groups.label")}>
        <button
          type="button"
          className={`groups-row-item groups-row-select${activeGroupId === null ? " groups-row-item_active" : ""}`}
          aria-pressed={activeGroupId === null}
          data-testid="group-all"
          onClick={() => store.groups.setActiveGroup(null)}
        >
          <span className="groups-row-name">{t("groups.all")}</span>
          <span className="groups-row-count">{total}</span>
        </button>

        {groups.length > 0 ? (
          <div className={`groups-row-scroll${fadeClass}`} ref={scrollRef} onScroll={updateFade} onWheel={onWheel}>
            {groups.map((group) => {
              const isActive = activeGroupId === group.id;
              return (
                <div key={group.id} className={`groups-row-item groups-row-group${isActive ? " groups-row-item_active" : ""}`}>
                  <button
                    type="button"
                    className="groups-row-select"
                    aria-pressed={isActive}
                    title={group.name}
                    data-testid={`group-${group.id}`}
                    onClick={() => store.groups.setActiveGroup(group.id)}
                  >
                    <span className="groups-row-name">{group.name}</span>
                    <span className="groups-row-count">{group.steamAccountIds.length}</span>
                  </button>
                  <button
                    type="button"
                    className="groups-row-edit"
                    title={t("groups.edit")}
                    aria-label={t("groups.edit")}
                    data-testid={`group-edit-${group.id}`}
                    onClick={() => store.groups.openEditForm(group.id)}
                  >
                    <Icon name="pencil" size={13} motion="pop" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <button
          type="button"
          className="groups-row-item groups-row-select groups-row-add"
          data-testid="group-new"
          onClick={() => setIsCreateOpen(true)}
        >
          <Icon name="plus" size={14} motion="pop" />
          <span className="groups-row-name">{t("groups.new")}</span>
        </button>
      </div>
      <GroupCreateForm
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          scrollToEndAfterRef.current = groups.length;
        }}
      />
    </>
  );
});

export default GroupsRow;

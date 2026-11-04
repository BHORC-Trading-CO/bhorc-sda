import React, { FC, ReactNode, useEffect, useState } from "react";
import Button from "../Button/Button";
import Icon, { IconName } from "../Icon/Icon";
import "./EmptyState.css";

// Иконки lucide, те же, что у разделов навигации; плитку и приглушённый цвет задаёт EmptyState.css.
const icons: Record<"accounts" | "proxies" | "search" | "archive", IconName> = {
  accounts: "users",
  proxies: "link",
  search: "search",
  archive: "archive",
};

export type EmptyStateIcon = keyof typeof icons;

export interface EmptyStateAction {
  text: string;
  onClick: () => void;
  /** Главное действие (добавить первый аккаунт/прокси) — синяя кнопка с бликом, остальные контурные */
  primary?: boolean;
}

/** Пустая таблица: приглушённая иконка, одна строка о том, что происходит, и одно действие. */
const EmptyState: FC<{ icon: EmptyStateIcon; text: ReactNode; action?: EmptyStateAction }> = ({ icon, text, action }) => (
  <div className="sda-empty-state" role="status" data-testid="empty-state">
    <span className="sda-empty-state__badge" aria-hidden="true">
      <Icon name={icons[icon]} size={20} />
    </span>
    <p className="sda-empty-state__text">{text}</p>
    {action ? (
      <Button
        size="small"
        color={action.primary ? "gradient" : "grey"}
        hoverColor={action.primary ? "gradient" : "grey"}
        icon={action.primary ? "plus" : undefined}
        text={action.text}
        className={`sda-empty-state__action${action.primary ? " sda-sweep" : ""}`}
        testId="empty-state-action"
        onClick={action.onClick}
      />
    ) : null}
  </div>
);

// Пустое состояние показываем, только если таблица пуста дольше этого времени: при запуске
// список аккаунтов приходит из main через мгновение, и «Аккаунтов ещё нет» не должно мелькать
// у того, у кого их 200; заодно оно не мигает на каждой букве поиска.
const EMPTY_STATE_DELAY_MS = 250;

/** Таблица с пустым состоянием поверх области строк (под шапкой). Обёртка всегда на месте,
 *  чтобы Table не перемонтировался при появлении первой строки. */
export const TableWithEmptyState: FC<{ empty: ReactNode | null; children: ReactNode }> = ({ empty, children }) => {
  const isEmpty = !!empty;
  const [isShown, setIsShown] = useState(false);
  useEffect(() => {
    if (!isEmpty) {
      setIsShown(false);
      return;
    }
    const timer = setTimeout(() => setIsShown(true), EMPTY_STATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isEmpty]);

  return (
    <div className="sda-table-area">
      {children}
      {isEmpty && isShown ? <div className="sda-table-area__empty">{empty}</div> : null}
    </div>
  );
};

export default EmptyState;

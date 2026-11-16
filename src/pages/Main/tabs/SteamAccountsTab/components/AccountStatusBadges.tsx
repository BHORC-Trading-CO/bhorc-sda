import React, { FC } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../../../../../globalComponents/Table/Cells";

// Badges for the red flag (KT), Market (TP) and Trades columns (SDA-31). Three states: OK, problem
// and unknown. Unknown is null (not checked yet, or the last check failed) or a field missing from
// an older config; it is a neutral badge and never reads as "OK". Booleans saved by older versions
// render exactly as before until the next successful check replaces them.

type Status = boolean | string | null | undefined;

const isUnknown = (value: Status) => value === null || value === undefined;

const UnknownBadge: FC<{ tip: string }> = ({ tip }) => {
  const { t } = useTranslation();
  return <StatusBadge tone="neutral" icon="help" label={t("accounts.table.status.unknown")} tip={tip} />;
};

export const KtStatus: FC<{ value: Status }> = ({ value }) => {
  const { t } = useTranslation();
  if (isUnknown(value)) return <UnknownBadge tip={t("accounts.table.status.ktUnknown")} />;
  return value ? (
    <StatusBadge tone="danger" label={t("accounts.table.status.locked")} tip={t("accounts.table.status.ktLocked")} />
  ) : (
    <StatusBadge tone="success" label={t("accounts.table.status.ok")} tip={t("accounts.table.status.ktOk")} />
  );
};

export const MarketStatus: FC<{ value: Status }> = ({ value }) => {
  const { t } = useTranslation();
  if (isUnknown(value)) return <UnknownBadge tip={t("accounts.table.status.marketUnknown")} />;
  // A string is the date Steam named for when the Market becomes available
  if (typeof value === "string")
    return (
      <StatusBadge
        tone="warning"
        label={t("accounts.table.status.later")}
        tip={t("accounts.table.status.marketLater", { date: value })}
      />
    );
  return value ? (
    <StatusBadge tone="success" label={t("accounts.table.status.ok")} tip={t("accounts.table.status.marketOk")} />
  ) : (
    <StatusBadge tone="danger" label={t("accounts.table.status.no")} tip={t("accounts.table.status.marketBlocked")} />
  );
};

export const TradeStatus: FC<{ value: Status }> = ({ value }) => {
  const { t } = useTranslation();
  if (isUnknown(value)) return <UnknownBadge tip={t("accounts.table.status.tradeUnknown")} />;
  return value ? (
    <StatusBadge tone="success" label={t("accounts.table.status.ok")} tip={t("accounts.table.status.tradeOk")} />
  ) : (
    <StatusBadge tone="danger" label={t("accounts.table.status.no")} tip={t("accounts.table.status.tradeBlocked")} />
  );
};

/**
 * Sort key shared by the three status columns: false, then unknown, then a date ("later"), then true.
 * Known booleans keep their old relative order (false before true); unknown sits between them.
 */
export function statusRank(value: Status): number {
  if (value === false) return 0;
  if (isUnknown(value)) return 1;
  if (typeof value === "string") return 2;
  return 3;
}

/**
 * Balance cell text (SDA-38). A currency sign is attached ("50.99₴"); a letter code is separated by a
 * space ("12.34 CAD", "12.34 #999" for a currency code the app does not know).
 */
export function balanceText(balance: number | null, currency: string | null): string {
  const code = currency || "";
  return `${balance}${/^[A-Za-z#]/.test(code) ? " " : ""}${code}`;
}

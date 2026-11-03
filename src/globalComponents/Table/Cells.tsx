import React, { FC, ReactNode, useState } from 'react';
import ReactTooltip from 'react-tooltip';
import uuid from 'react-uuid';

// Общие кусочки ячеек таблицы (SDA-9): подсказка, текст с многоточием, бейдж статуса, иконки.

/** Подсказка в стиле остальных подсказок приложения (react-tooltip, тёмная) на любом содержимом */
export const Tip: FC<{ tip?: ReactNode, className?: string, ariaLabel?: string, role?: string }> = ({ tip, className, ariaLabel, role, children }) => {
    const [id] = useState(() => uuid());
    if (!tip) return <span className={className} aria-label={ariaLabel} role={role}>{children}</span>;
    return (
        <span className={className} data-tip="React-tooltip" data-for={id} aria-label={ariaLabel} role={role}>
            {children}
            <ReactTooltip id={id} place="top" type="dark" effect="solid">
                <div className="table-tip">{tip}</div>
            </ReactTooltip>
        </span>
    );
};

/**
 * Текст ячейки в одну строку с многоточием. Полное значение показываем системной подсказкой,
 * только когда текст действительно обрезан.
 */
export const CellText: FC<{ text: string, className?: string }> = ({ text, className, children }) => (
    <span
        className={`cell-text${className ? ` ${className}` : ''}`}
        onMouseEnter={(event) => {
            const el = event.currentTarget;
            el.title = el.scrollWidth > el.clientWidth ? text : '';
        }}
    >
        {children !== undefined ? children : text}
    </span>
);

export type StatusTone = 'success' | 'danger' | 'warning';

/** Бейдж статуса аккаунта: переводимый текст, цвет по смыслу, пояснение в подсказке */
export const StatusBadge: FC<{ tone: StatusTone, label: string, tip: string }> = ({ tone, label, tip }) => (
    <Tip tip={tip} className={`status-badge status-badge--${tone}`} role="img" ariaLabel={`${label}. ${tip}`}>
        {label}
    </Tip>
);

// Иконки рисуются currentColor, цвет задаёт CSS через токены
export const CopyIcon: FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.75 3.25V3A1.75 1.75 0 0 0 9 1.25H3A1.75 1.75 0 0 0 1.25 3V9A1.75 1.75 0 0 0 3 10.75h.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

export const CheckIcon: FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 8.5l3.2 3.1L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const WarningIcon: FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5v4.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="11.25" r="0.95" fill="currentColor" />
    </svg>
);

export const UserIcon: FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="9" r="4" fill="currentColor" />
        <path d="M4.5 20.5c.9-3.7 3.9-6.1 7.5-6.1s6.6 2.4 7.5 6.1" fill="currentColor" />
    </svg>
);

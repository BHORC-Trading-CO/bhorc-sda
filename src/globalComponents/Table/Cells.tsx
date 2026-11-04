import React, { FC, ReactNode, useState } from 'react';
import ReactTooltip from 'react-tooltip';
import uuid from 'react-uuid';

// Общие кусочки ячеек таблицы (SDA-9): подсказка, текст с многоточием, бейдж статуса.

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

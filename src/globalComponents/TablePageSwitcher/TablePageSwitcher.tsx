import React, { FC } from 'react';
import './TablePageSwitcher.css';
import Dropdown from 'react-dropdown';
import { useTranslation } from 'react-i18next';
import Icon, { IconName } from '../Icon/Icon';

// Стрелки — кнопки: фокус, имя для скринридера, неактивное состояние; клики те же, что были у картинок
const PageButton: FC<{ disabled: boolean, label: string, icon: IconName, onClick: () => void }> = (p) => (
    <button
        type="button"
        className="page-switcher-btn"
        aria-label={p.label}
        title={p.label}
        aria-disabled={p.disabled || undefined}
        onClick={() => {
            if (p.disabled) return;
            p.onClick();
        }}
    >
        <Icon name={p.icon} className="page-switcher-img" />
    </button>
);

const TablePageSwitcher: FC<{
    options?: {
        numberOfElementsInPage?: number,
        avalible?: number[]
    }
    pageSize: number,
    numberOfElements: number,
    numberOfPages: number,
    activePageNumber: number,
    onChangeActivePage: (newActivePageNumber: number) => void,
    onChangePageSize: (newPageSize: number) => void
}> = ({ options = { numberOfElementsInPage: 10, avalible: [5, 10, 15] }, pageSize, numberOfPages, activePageNumber, onChangeActivePage, onChangePageSize, numberOfElements }) => {
    const { t } = useTranslation();
    const atFirst = activePageNumber === 1 || numberOfPages === 0;
    const atLast = activePageNumber === numberOfPages || numberOfPages === 0;

    return <>
        <div className='table-footer-left'>
            <div className='table-footer-left_item'><span className="text-grey-large">{t("pagination.total")}</span><span className="table-footer-value">{numberOfElements}</span></div>
            <div className='table-footer-left_item'><span className="text-grey-large">{t("pagination.page")}</span><span className="table-footer-value">{activePageNumber} / {numberOfPages === 0 ? 1 : numberOfPages}</span></div>
            <div className='table-footer-left_item'>
                <span className="text-grey-large">{t("pagination.pageSize")}</span>
                <Dropdown options={options.avalible!.map(el => String(el))} onChange={(el) => {
                    onChangePageSize(Number(el.value));
                }} value={String(pageSize)} />
            </div>
            <div className='table-footer-left_item table-footer-img-item'>
                <PageButton disabled={atFirst} label={t("pagination.first")} icon="chevronsLeft" onClick={() => onChangeActivePage(1)} />
                <PageButton disabled={atFirst} label={t("pagination.prev")} icon="chevronLeft" onClick={() => onChangeActivePage(activePageNumber - 1)} />
                <PageButton disabled={atLast} label={t("pagination.next")} icon="chevronRight" onClick={() => onChangeActivePage(activePageNumber + 1)} />
                <PageButton disabled={atLast} label={t("pagination.last")} icon="chevronsRight" onClick={() => onChangeActivePage(numberOfPages)} />
            </div>
        </div>
    </>;
}
export default TablePageSwitcher;

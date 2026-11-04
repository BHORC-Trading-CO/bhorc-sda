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
        <Icon name={p.icon} size={13} className="page-switcher-img" />
    </button>
);

// Подвал таблицы слева (макет main-v2): число строк, «« ‹ 1 / 3 › »», размер страницы.
// Компактно, чтобы подвал с кнопками массовых действий помещался в одну строку в окне 1024 px.
const TablePageSwitcher: FC<{
    options?: {
        numberOfElementsInPage?: number,
        avalible?: number[]
    }
    pageSize: number,
    numberOfElements: number,
    numberOfPages: number,
    activePageNumber: number,
    /** Готовая подпись числа строк («6 аккаунтов»). Не передана — «Всего элементов: N». */
    countText?: string,
    onChangeActivePage: (newActivePageNumber: number) => void,
    onChangePageSize: (newPageSize: number) => void
}> = ({ options = { numberOfElementsInPage: 10, avalible: [5, 10, 15] }, pageSize, numberOfPages, activePageNumber, onChangeActivePage, onChangePageSize, numberOfElements, countText }) => {
    const { t } = useTranslation();
    const atFirst = activePageNumber === 1 || numberOfPages === 0;
    const atLast = activePageNumber === numberOfPages || numberOfPages === 0;
    const pageText = `${activePageNumber} / ${numberOfPages === 0 ? 1 : numberOfPages}`;

    return <>
        <div className='table-footer-left'>
            <div className='table-footer-left_item table-footer-count'>
                {countText !== undefined ? countText : <>
                    <span>{t("pagination.total")}</span><span className="table-footer-value">{numberOfElements}</span>
                </>}
            </div>
            <div className='table-footer-left_item table-footer-pager'>
                <PageButton disabled={atFirst} label={t("pagination.first")} icon="chevronsLeft" onClick={() => onChangeActivePage(1)} />
                <PageButton disabled={atFirst} label={t("pagination.prev")} icon="chevronLeft" onClick={() => onChangeActivePage(activePageNumber - 1)} />
                <span className="table-footer-page" title={`${t("pagination.page")}${pageText}`}>{pageText}</span>
                <PageButton disabled={atLast} label={t("pagination.next")} icon="chevronRight" onClick={() => onChangeActivePage(activePageNumber + 1)} />
                <PageButton disabled={atLast} label={t("pagination.last")} icon="chevronsRight" onClick={() => onChangeActivePage(numberOfPages)} />
            </div>
            <div className='table-footer-left_item table-footer-size' title={t("pagination.pageSize")}>
                <Dropdown options={options.avalible!.map(el => String(el))} onChange={(el) => {
                    onChangePageSize(Number(el.value));
                }} value={String(pageSize)} />
                <span>{t("pagination.perPage")}</span>
            </div>
        </div>
    </>;
}
export default TablePageSwitcher;

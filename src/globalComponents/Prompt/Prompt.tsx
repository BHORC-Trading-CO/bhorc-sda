import react, { FC, useRef, useState } from 'react';
import './prompt.css';
import store from '../../store/store';
import { observer } from 'mobx-react';
import Button from '../Button/Button';
import Input from '../Input/Input';
import { useTranslation } from 'react-i18next';
import Icon, { IconName } from '../Icon/Icon';
import useModalFocus from '../Modal/useModalFocus';

// Опасный вариант (SDA-9): вызывающий код может передать danger: true для необратимых
// действий — тогда кнопка подтверждения красная. Поле необязательное, поведение не меняется.
type PromptContent = typeof store.windows.promptContent & { danger?: boolean };

// Иконка по типу окна; неизвестный тип получает «инфо».
const ICONS: { [type: string]: IconName } = {
    question: 'help',
    info: 'info',
    error: 'alert',
    success: 'check',
};

const Notification: FC = observer(() => {
    if (!store.windows.isPromptOpen) return <></>;
    return <PromptDialog />;
});

// Само окно монтируется только открытым: фокус и клавиши (useModalFocus) живут, пока окно
// на экране, а введённый в поле текст не переходит в следующее открытие окна.
const PromptDialog: FC = observer(() => {
    const [value, setValue] = useState("");
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLDivElement>(null);
    // Escape — как Отмена (или клик мимо окна), никогда не подтверждение; поверх другого окна
    // фокус остаётся в Prompt и после закрытия возвращается в то окно.
    useModalFocus(dialogRef, () => store.windows.closeNotification());

    const content = store.windows.promptContent as PromptContent;
    const isDanger = content.danger === true;
    const cancelButtonText = content.cancelButtonText ? content.cancelButtonText : t("prompt.cancel");
    const acceptButtonText = content.acceptButtonText ? content.acceptButtonText : t("prompt.accept");
    const icon = ICONS[content.type] || 'info';

    return (
        <div className='darkBackground' onClick={(event) => {
            const target = event.target as HTMLDivElement;
            if (target.className == 'darkBackground') store.windows.closeNotification();
        }}>
            <div className={`notification notification_${content.type}${isDanger ? ' notification_danger' : ''}`} ref={dialogRef} role='dialog' aria-modal='true' aria-labelledby='prompt-title' tabIndex={-1}>
                <div className='notification_content'>
                    {/* Круглая подложка с иконкой; цвет состояния берётся из токена (prompt.css). */}
                    <span className='notification_icon' aria-hidden='true'><Icon name={icon} size={20} /></span>
                    <h3 className='notification_title' id='prompt-title'>{content.title}</h3>
                    <div className='notification_text'>{content.text}</div>
                    <div className={`notification__buttons${content.isInput === true ? ' notification__buttons_input' : ''}`}>
                        {content.isInput === true ? <>
                            <Input value={value} onChange={(value) => {
                                setValue(value);
                            }} />
                            <Button color='gradient' size='large' isNonGuardButton={false} text={t("common.buttons.confirm")} onClick={() => {
                                if (content.cb)
                                    content.cb(value);
                            }} />
                        </> : <>
                            <Button color='grey' hoverColor='light-grey' size='large' isNonGuardButton={false} text={cancelButtonText} onClick={() => {
                                store.windows.closeNotification();
                            }} />
                            <Button color='gradient' size='large' isNonGuardButton={false} className={isDanger ? 'notification__accept_danger' : 'notification__accept'} text={acceptButtonText} onClick={() => {
                                if (content.cb) content.cb("");
                                store.windows.closeNotification();
                            }} />
                        </>}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Notification;

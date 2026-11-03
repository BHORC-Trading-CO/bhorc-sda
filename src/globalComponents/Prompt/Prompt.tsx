import react, { FC, useState } from 'react';
import './prompt.css';
import store from '../../store/store';
import { observer } from 'mobx-react';
import Button from '../Button/Button';
import Input from '../Input/Input';
import { useTranslation } from 'react-i18next';

// Опасный вариант (SDA-9): вызывающий код может передать danger: true для необратимых
// действий — тогда кнопка подтверждения красная. Поле необязательное, поведение не меняется.
type PromptContent = typeof store.windows.promptContent & { danger?: boolean };

// Имена файлов иконок с заглавной буквы: на регистрозависимых ФС `question.svg` не найдётся.
const ICONS: { [type: string]: string } = {
    question: 'Question.svg',
    info: 'Info.svg',
    error: 'Error.svg',
    success: 'Success.svg',
};

const Notification: FC = observer(() => {
    const [value, setValue] = useState("");
    const { t } = useTranslation();

    if (!store.windows.isPromptOpen) return <></>;

    const content = store.windows.promptContent as PromptContent;
    const isDanger = content.danger === true;
    const cancelButtonText = content.cancelButtonText ? content.cancelButtonText : t("prompt.cancel");
    const acceptButtonText = content.acceptButtonText ? content.acceptButtonText : t("prompt.accept");
    const icon = ICONS[content.type] || `${content.type}.svg`;

    return (
        <div className='darkBackground' onClick={(event) => {
            const target = event.target as HTMLDivElement;
            if (target.className == 'darkBackground') store.windows.closeNotification();
        }}>
            <div className={`notification notification_${content.type}${isDanger ? ' notification_danger' : ''}`} role='dialog' aria-modal='true' aria-labelledby='prompt-title'>
                <div className='notification_content'>
                    {content.type === 'question'
                        // В Question.svg знак «?» нарисован тёмной заливкой, маской его не перекрасить.
                        ? <img className='notification_icon-img' src={`./assets/img/${icon}`} alt='' />
                        // Остальные иконки — белые маски: цвет состояния берётся из токена.
                        : <span className='notification_icon' aria-hidden='true' style={{ WebkitMaskImage: `url(./assets/img/${icon})` }}></span>}
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

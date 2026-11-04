import react, { FC, useEffect, useState } from 'react';
import TitleBar from '../../globalComponents/TitleBar/TitleBar';
import Icon from '../../globalComponents/Icon/Icon';
import Button from '../../globalComponents/Button/Button';
import './Error.css';
import { useTranslation } from 'react-i18next';

const Error: FC = () => {
    const { t } = useTranslation();
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [id, setId] = useState("");

    useEffect(() => {
        window.ErrorWindow.windowApi.onGetParams((event, data) => {
            setTitle(data.title);
            setText(data.text);
            setId(data.id);
        });
    }, []);

    return (
        <div className='error-window'>
            <TitleBar platform={window.ErrorWindow.platform} title={t('common.error')} />
            <div className='error-container'>
                <div className='error-body' role='alert'>
                    <span className='error-warning-icon'><Icon name="alert" size={16} /></span>
                    <div className='error-content'>
                        <h1 className='error-title'>{title}</h1>
                        <div className='error-container-text'>
                            {text}
                        </div>
                    </div>
                </div>
                <div className='error-actions'>
                    {/* Как системное закрытие: main закрывает окно и освобождает errorWindows[id]. */}
                    <Button
                        className='error-close-button'
                        size='small'
                        color='grey'
                        hoverColor='grey'
                        text={t('common.buttons.close')}
                        onClick={() => window.ErrorWindow.windowApi.close(id)}
                    />
                </div>
            </div>
        </div>
    );
}

export default Error;

import react, { FC, useEffect, useState } from 'react';
import TitleBar from '../../globalComponents/TitleBar/TitleBar';
import Icon from '../../globalComponents/Icon/Icon';
import './Error.css';
import { useTranslation } from 'react-i18next';

const Error: FC = () => {
    const { t } = useTranslation();
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");

    useEffect(() => {
        window.ErrorWindow.windowApi.onGetParams((event, data) => {
            setTitle(data.title);
            setText(data.text);
        });
    }, []);

    return (
        <div className='error-window'>
            <TitleBar platform={window.ErrorWindow.platform} title={t('common.error')} />
            <div className='error-container'>
                <div >
                    <h1><Icon name="alert" size={20} className="error-warning-icon" />{title}</h1>
                </div>
                <div className='error-container-text'>
                    {text}
                </div>
            </div>
        </div>
    );
}

export default Error;
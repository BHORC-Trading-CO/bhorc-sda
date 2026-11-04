import react, { FC, useEffect, useState } from 'react';
import TitleBar from '../../globalComponents/TitleBar/TitleBar';
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
                    <h1><svg className="error-warning-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01" /></svg>{title}</h1>
                </div>
                <div className='error-container-text'>
                    {text}
                </div>
            </div>
        </div>
    );
}

export default Error;
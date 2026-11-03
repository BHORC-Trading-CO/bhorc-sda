import react, { FC, useEffect, useState } from 'react';
import Attic from '../../globalComponents/Attic/Attic';
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
        <>
            <Attic windowName='error' title={t('common.error')} id={id} />
            <div className='error-container'>
                <div >
                    <h1><svg className="error-warning-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01" /></svg>{title}</h1>
                </div>
                <div className='error-container-text'>
                    {text}
                </div>
            </div>
        </>
    );
}

export default Error;
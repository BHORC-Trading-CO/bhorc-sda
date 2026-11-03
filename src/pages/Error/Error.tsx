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
                    <h1>{title} 🤔</h1>
                </div>
                <div className='error-container-text'>
                    {text}
                </div>
            </div>
        </>
    );
}

export default Error;
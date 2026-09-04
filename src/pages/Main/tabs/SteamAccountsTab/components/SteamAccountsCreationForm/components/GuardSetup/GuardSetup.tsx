import react, { FC } from 'react';
import CreationStepType from '../../../../../../../../../electron/interfaces/SteamAccount/CreationStepType';
import store from '../../../../../../../../store/store';
import Button from '../../../../../../../../globalComponents/Button/Button';
import LoadingIcons from 'react-loading-icons';
import { observer } from 'mobx-react';

const Page: FC<{ step: CreationStepType }> = observer(({ step }) => {
    switch (step) {
        case "start":
            return <Step title='Запускаем процесс подключения Steam Guard' text='Программа залогинится по вашим данным и подгрузит всю нужную информацию. Это может занять какое-то время, не переживайте' />;
        case "loginByPassword":
            return <Step title='Логинимся по имени и паролю' text='' />;
        case "askEmailCode":
            return <Step title='Введите код с почты' text='На подключенную к аккаунту почту должен был прийти код. Пожалуйста впишите его в появивщееся окно' />;
        case "tryEmailCode":
            return <Step title='Отправляем код с почты Steam' text='' />;
        case "enableTwoFactor":
            return <Step title='Первый этап подключения Guard' text='Запрашиваем у Steam всю нужную информацию и сохраняем ее' />;
        case "askSmsCode":
            return <Step title='Введите код подтверждения' text='Steam прислал код подтверждения: на почту, если к аккаунту не привязан телефон, или в смс, если привязан. Пожалуйста впишите его в появившееся окно' />;
        case "trySmsCode":
            return <Step title='Отправляем код подтверждения Steam' text='' />;
        case "finalizeTwoFactor":
            return <Step title='Второй этап подключения Guard' text='Отправляем финальный запрос на подключение' />
        case "loadData":
            return <Step title='Собираем данные' text='' />;
        case "import":
            return <Step title='Создаем аккаунт и сохраняем данные в локальное хранилище' text='' />
        case "link":
            return <Step title='Привязываем указанный прокси и профиль' text='' />;
        case "end":
            return <div className='account-creation_step'>
                <div className='title'>Аккаунт создан 😍</div>
                <div className='text'>Можно закрыть окно</div>
            </div>;
        case "error":
            return <div className='account-creation_step'>
                <div className='title'>Ошибка 😒</div>
                <div className='texxt'>{store.steamAccountsTable.creationForm.guardSetupProcessError}</div>
            </div>
        default:
            return <>Неизвестный шаг: {step}</>;
    }
});

const GuardSetup: FC = observer(() => {
    console.log(store.steamAccountsTable.creationForm.guardSetupProcessStep);
    return (
        <>
            <Page step={store.steamAccountsTable.creationForm.guardSetupProcessStep} />
        </>
    );
});

const Step: FC<{ title: string, text: string }> = (props) => {
    const { title, text } = props;

    return <div className='account-creation_step'>
        <div className='title'>{title}</div>
        <div className='text'>{text}</div>
        <LoadingIcons.BallTriangle style={{ width: '50px', height: '50px', marginBottom: '30px' }} />
        <Button size='medium' text='Прервать подключение' color='grey' hoverColor='light-grey' onClick={() => {
            store.steamAccountsTable.creationForm.close();
        }} />
    </div>
}

export default GuardSetup;
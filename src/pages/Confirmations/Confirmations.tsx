import react, { FC, useEffect, useState } from 'react';
import CConfirmation from 'steamcommunity/classes/CConfirmation';
import Attic from '../../globalComponents/Attic/Attic';
import Button from '../../globalComponents/Button/Button';
import "./Confirmation.css"
import SellItem from './SellItem/SellItem';
import LoadingIcons from 'react-loading-icons';

interface Item { selected: boolean, confirmation: CConfirmation };

const Confirmations: FC = () => {
    const [name, setName] = useState('');
    const [items, setItems] = useState<Item[]>([]);
    const [id, setId] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isResponding, setIsResponding] = useState<null | 'confirm' | 'cancel'>(null);

    useEffect(() => {
        window.Confirmations.api.onGetParams((event, params) => {
            console.log(params);
            setName(params.steamAccountName);
            setId(params.id);
            console.log(params.id, params.steamAccountName);
            window.Confirmations.api.getConfirmations(params.id);
            console.log('get confirms');
            //const newItems = params.confirmations.map(confirmation => { return { selected: false, confirmation } });
            //setItems(newItems);
        });

        window.Confirmations.api.onGetConfirmations((event, data) => {
            setId(currentId => {
                if (currentId != data.id) return currentId;
                setIsLoading(false);
                setError("");
                setItems(data.confirmations.map(el => { return { confirmation: el, selected: false } }));
                return currentId;
            });
        });
        window.Confirmations.api.onGetConfirmationsError((event, data) => {
            console.log(data);
            setId(currentId => {
                if (data.id != currentId) return currentId;
                setIsLoading(false);
                setError(data.err);
                return currentId;
            });
        });
        window.Confirmations.api.onRespondconfirmations((event, id) => {
            setId(currentId => {
                if (currentId != id) return currentId;
                setIsResponding(null);
                setIsLoading(true);
                window.Confirmations.api.getConfirmations(id);
                return currentId;
            })
        });
    }, []);

    return (
        <div className='confirmation-wrapper'>
            <Attic id={id} windowName="confirmations" title='Подтверждения'></Attic>
            <div className='confirmation-container'>
                <div className='confirmation-info-container'>
                    <div className='info-account-name'>
                        <img src='./assets/img/User.svg' className='info-account-logo'></img>
                        <span className='text-medium-white'>{name}</span>
                    </div>
                    <div className='confirmation-info-container'>
                        <div className='sell-items-count-selected'>
                            Выбрано: {items.filter(i => i.selected).length} из {items.length}
                        </div>
                        <Button onClick={() => {
                            const selectedItems = items.filter(i => i.selected);
                            const newItems = [...items];
                            if (selectedItems.length === 0) {
                                setItems(newItems.map(i => { return { ...i, selected: true } }));
                            } else {
                                setItems(newItems.map(i => { return { ...i, selected: false } }));
                            }
                        }}
                            style={{ marginRight: '5px' }}
                            altText='Выбрать/отменить все подтверждения' view='icon' size='small' color='grey' hoverColor='light-grey' img='./assets/img/selectAll.svg' hoverImg='./assets/img/selectAllHover.svg' />
                        <Button disabled={isLoading} altText='Обновить' onClick={() => {
                            window.Confirmations.api.getConfirmations(id);
                            setIsLoading(true);
                        }} view='icon' size='small' color='grey' hoverColor='light-grey' img='./assets/img/Refresh.svg' hoverImg='./assets/img/Refresh_hov.svg' />
                    </div>
                </div>
                <div className='sell-items-container'>
                    {error ? <div className='centered-block'>😯{String(error)}</div> : (!isLoading && !isResponding ?
                        (items.length > 0 ? <Items items={items} setItems={setItems} /> : <div className='centered-block'>Нет доступных подтверждений 😕</div>) :
                        <div className='centered-block'>
                            {isLoading ? <div>
                                <LoadingIcons.Oval />
                                <div style={{ lineHeight: '50px' }}>
                                    🤩Получаем доступные подтверждения...
                                </div>

                            </div> :
                                <div>
                                    <LoadingIcons.Oval />
                                    <div style={{ lineHeight: '50px' }}>
                                        {isResponding === 'confirm' ? "😁Подтверждаем" : "😯Отклоняем"} выбранное: {items.filter(i => i.selected).length}
                                    </div>
                                </div>}
                        </div>)}
                </div>

                <div className='sell-items-confirms-button-container'>
                    <Button
                        text='Отклонить выбранное'
                        size='large'
                        color='grey'
                        hoverColor='grey'
                        onClick={() => {
                            const selectedItems = items.filter(i => i.selected);
                            const ids = selectedItems.map(i => i.confirmation.id);
                            const keys = selectedItems.map(i => i.confirmation.key);
                            console.log(ids, keys);
                            setIsResponding('cancel');
                            window.Confirmations.api.respondConfirmations(id, {
                                allow: { ids: [], keys: [] },
                                cancel: { ids: ids, keys: keys }
                            })
                        }}
                    />
                    <Button
                        text='Подтвердить выбранное'
                        size='large'
                        color='grey'
                        hoverColor='grey'
                        onClick={() => {
                            const selectedItems = items.filter(i => i.selected);
                            const ids = selectedItems.map(i => i.confirmation.id);
                            const keys = selectedItems.map(i => i.confirmation.key);
                            console.log(ids, keys);
                            setIsResponding('confirm');
                            window.Confirmations.api.respondConfirmations(id, {
                                allow: { ids: ids, keys: keys },
                                cancel: { ids: [], keys: [] }
                            })
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

const Items = (props: { items: Item[], setItems: react.Dispatch<react.SetStateAction<Item[]>> }) => {
    const { items, setItems } = props;

    return <>{items.map((item) => {
        return <SellItem key={item.confirmation.id} item={item} onChange={(isSelected) => {
            const newItems = [...items];
            const itemFromArray = newItems.filter(i => i.confirmation.id === item.confirmation.id)[0];
            itemFromArray.selected = isSelected;
            setItems(newItems);
        }}></SellItem>;
    })}</>;
}

export default Confirmations;
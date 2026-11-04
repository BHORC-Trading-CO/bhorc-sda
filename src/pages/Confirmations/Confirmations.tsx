import react, { FC, useEffect, useState } from 'react';
import CConfirmation from 'steamcommunity/classes/CConfirmation';
import TitleBar from '../../globalComponents/TitleBar/TitleBar';
import Button from '../../globalComponents/Button/Button';
import "./Confirmation.css"
import SellItem from './SellItem/SellItem';
import LoadingIcons from 'react-loading-icons';
import { useTranslation } from 'react-i18next';
import stripLeadingEmoji from './stripLeadingEmoji';

interface Item { selected: boolean, confirmation: CConfirmation };

const Confirmations: FC = () => {
    const { t } = useTranslation();
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

    const selectedCount = items.filter(i => i.selected).length;
    const refresh = () => {
        window.Confirmations.api.getConfirmations(id);
        setIsLoading(true);
    };

    return (
        <div className='confirmation-wrapper'>
            <TitleBar platform={window.Confirmations.platform} title={t('confirmations.title')} />
            <div className='confirmation-container'>
                <div className='confirmation-info-container'>
                    <div className='info-account-name'>
                        <img src='./assets/img/User.svg' className='info-account-logo' alt='' aria-hidden='true' />
                        <span className='text-medium-white' title={name}>{name}</span>
                    </div>
                    <div className='confirmation-toolbar'>
                        <div className='sell-items-count-selected'>
                            {t('confirmations.selectedOf', { selected: selectedCount, total: items.length })}
                        </div>
                        <button type='button' className='confirmation-icon-button' title={t('confirmations.toggleAll')} aria-label={t('confirmations.toggleAll')} onClick={() => {
                            const selectedItems = items.filter(i => i.selected);
                            const newItems = [...items];
                            if (selectedItems.length === 0) {
                                setItems(newItems.map(i => { return { ...i, selected: true } }));
                            } else {
                                setItems(newItems.map(i => { return { ...i, selected: false } }));
                            }
                        }}
                            >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5zM8 8l2 2 5-4M8 15h8" /></svg>
                        </button>
                        <button type='button' className='confirmation-icon-button' disabled={isLoading} title={t('confirmations.refresh')} aria-label={t('confirmations.refresh')} onClick={refresh}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5v6h-6M20 11a8 8 0 1 0-1 7" /></svg>
                        </button>
                    </div>
                </div>
                <div className='sell-items-container'>
                    {error && !isLoading ? <div className='centered-block confirmation-state confirmation-state--error' role='alert'>
                        <svg className='confirmation-state-icon' viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01" /></svg>
                        <div className='confirmation-state-message'>{stripLeadingEmoji(String(error)) || t('confirmations.error')}</div>
                        <button type='button' className='confirmation-retry' onClick={refresh}>{t('confirmations.retry')}</button>
                    </div> : (!isLoading && !isResponding ?
                        (items.length > 0 ? <Items accountId={id} items={items} setItems={setItems} /> : <div className='centered-block confirmation-state' role='status'>
                            <svg className='confirmation-state-icon' viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5zM8 11l3 3 5-6" /></svg>
                            <div>{t('confirmations.empty')}</div>
                        </div>) :
                        <div className='centered-block confirmation-state' role='status'>
                            <LoadingIcons.Oval stroke="var(--sda-text-muted)" />
                            <div className='confirmation-state-message'>
                                {isLoading ? t('confirmations.loading') : t(isResponding === 'confirm' ? 'confirmations.confirming' : 'confirmations.declining', { count: selectedCount })}
                            </div>
                        </div>)}
                </div>

                <div className='sell-items-confirms-button-container'>
                    <Button
                        className={`confirmation-decline${selectedCount === 0 ? ' confirmation-action-inactive' : ''}`}
                        text={t('confirmations.declineSelected')}
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
                        className={`confirmation-confirm${selectedCount === 0 ? ' confirmation-action-inactive' : ''}`}
                        text={t('confirmations.confirmSelected')}
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

const Items = (props: { accountId: string, items: Item[], setItems: react.Dispatch<react.SetStateAction<Item[]>> }) => {
    const { items, setItems } = props;

    return <>{items.map((item) => {
        return <SellItem key={item.confirmation.id} accountId={props.accountId} item={item} onChange={(isSelected) => {
            const newItems = [...items];
            const itemFromArray = newItems.filter(i => i.confirmation.id === item.confirmation.id)[0];
            itemFromArray.selected = isSelected;
            setItems(newItems);
        }}></SellItem>;
    })}</>;
}

export default Confirmations;

export default interface ChangableSecondaryInterface {
    // Баланс с /market/ (SDA-38): число и валюта; error — причина для подсказки, только строкой.
    // balance и error оба null — аккаунт вошёл, но Steam не показал кошелёк: в таблице прочерк без значка.
    steam: {
        error: null | string,
        balance: number | null;
        currency: string | null;
    };
}
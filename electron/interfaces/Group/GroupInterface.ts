// Запись группы аккаунтов в хранилище (ключ 'groups' в electron-store).
export default interface GroupInterface {
    id: string;
    name: string;
    number: number;
    deleted: boolean;
}

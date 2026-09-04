import GroupInterface from './GroupInterface';

// Группа + связанные данные (id аккаунтов группы), уходит в рендерер.
export default interface CompiledGroupInterface extends GroupInterface {
    steamAccountIds: string[];
}

interface LinksInterface {
    steamAccounts: {
        [id: string]: string | null   // steamAccountId -> proxyId | null
    },
    profiles: {
        [id: string]: { steamAccountId: string | null, proxyId: string | null }
    },
    // Принадлежность аккаунта к группе: steamAccountId -> groupId | null (одна группа на аккаунт)
    groups: {
        [id: string]: string | null
    }
}

export default LinksInterface;
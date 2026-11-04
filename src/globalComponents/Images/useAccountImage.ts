import { useEffect, useState } from 'react';

/** URL — только ключ обновления/параметр IPC; в DOM попадают лишь данные от main. */
export default function useAccountImage(kind: 'avatar' | 'icon', accountId: string, url?: string, routeKey = '') {
    const key = JSON.stringify([kind, accountId, url, routeKey]);
    const [image, setImage] = useState<{ key: string, src: string | null } | null>(null);
    useEffect(() => {
        let active = true;
        setImage(null);
        if (accountId && url) {
            const result = kind === 'avatar'
                ? window.Main.steamAccounts.getAvatar(accountId)
                : window.Confirmations.api.getIcon(accountId, url);
            result.catch(() => null).then(src => {
                if (active) setImage({ key, src: src && /^data:image\/(?:jpeg|png|gif|webp);base64,/.test(src) ? src : null });
            });
        }
        return () => { active = false; };
    }, [kind, accountId, url, routeKey]);
    return {
        src: image?.key === key ? image.src : null,
        onError: () => setImage({ key, src: null }),
    };
}

import type { TFunction } from 'i18next';
import type { IconName } from '../../globalComponents/Icon/Icon';
import type { MobileConfirmation } from './confirmationState';

const TYPES: Record<number, string> = { 2: 'trade', 3: 'listing', 5: 'security', 6: 'security', 9: 'apiKey', 10: 'family', 11: 'family', 12: 'purchase', 13: 'refund' };
export const confirmationType = (type: number) => TYPES[type] || 'unknown';
export const confirmationTypeLabel = (confirmation: MobileConfirmation, t: TFunction): string => {
    const type = confirmationType(confirmation.type);
    return type === 'unknown' && confirmation.typeName ? confirmation.typeName : t(`confirmations.types.${type}`);
};

// Local lucide icon per type: the renderer never loads images from the network, and a
// confirmation without a Steam icon (API key, security) still gets a recognisable tile.
const TYPE_ICONS: Record<string, IconName> = {
    trade: 'arrowLeftRight',
    listing: 'tag',
    purchase: 'shoppingCart',
    apiKey: 'key',
    security: 'shieldAlert',
    family: 'users',
    refund: 'undo',
    unknown: 'shieldCheck',
};
export const confirmationTypeIcon = (type: number): IconName => TYPE_ICONS[confirmationType(type)];

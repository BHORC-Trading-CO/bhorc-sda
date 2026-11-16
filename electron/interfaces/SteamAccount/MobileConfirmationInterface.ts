export enum EMobileConfirmationType {
    Invalid = 0,
    Test = 1,
    Trade = 2,
    MarketListing = 3,
    FeatureOptOut = 4,
    PhoneNumberChange = 5,
    AccountRecovery = 6,
    // 7 and 8 have no named action in the protocol reference.
    RegisterApiKey = 9,
    InviteToFamilyGroup = 10,
    JoinFamilyGroup = 11,
    MarketPurchase = 12,
    RequestRefund = 13,
}

export interface MobileConfirmationRef {
    id: string;
    nonce: string;
    type: number;
    multi: boolean;
}

export interface MobileConfirmation extends MobileConfirmationRef {
    creatorId: string | null;
    typeName: string;
    headline: string;
    summary: string[];
    warn: string | null;
    icon: string;
    acceptLabel: string;
    cancelLabel: string;
    /** Unix timestamp, in seconds. Zero means Steam supplied no valid time. */
    createdAt: number;
}

export interface MobileConfirmationResult {
    id: string;
    ok: boolean;
    message?: string;
    /** A request was sent, but its outcome could not be established. */
    unknown?: boolean;
    /** The operation stopped before sending this item. */
    notSent?: boolean;
    /** Stop any remaining action groups in this IPC operation. */
    stopped?: boolean;
}

export interface MobileConfirmationResponse {
    allow: MobileConfirmationRef[];
    cancel: MobileConfirmationRef[];
}

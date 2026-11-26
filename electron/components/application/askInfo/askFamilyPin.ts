import steamAccountManager from "../../SteamAccount/steamAccountManager";
import askCode from "./askCode";

export default async (accountId: string, accountName: string, signal?: AbortSignal) => {
    const pin = await askCode(accountName, 'familyPin', signal);
    const steamAccount = steamAccountManager.getById(accountId);
    if (steamAccount) steamAccount.editParams({ familyViewPin: pin });
    return pin;
}

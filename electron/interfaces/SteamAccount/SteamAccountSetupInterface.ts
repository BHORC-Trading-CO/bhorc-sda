import MaFileInterface from "./MaFileInterface";

export default interface SteamAccountSetupInterface {
    accountName: string;
    password: string;
    maFile: MaFileInterface;
    familyViewPin: number | null;
    profileName?: string;
    mail?:string;
    mailPassword?:string;
    useSteamCookies: boolean;
}
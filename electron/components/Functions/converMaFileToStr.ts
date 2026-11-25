import MaFileInterface from "../../interfaces/SteamAccount/MaFileInterface";
import stripLegacyMarketData from "./stripLegacyMarketData";
import { getSteamID64 } from "./steamAccountSearch";
const JSONbig = require("json-bigint");

// SteamID в maFile — число, а SteamID64 не помещается в Number: пишем его цифрами через json-bigint.
// Раньше кавычки вырезались по позиции в тексте, и без SteamID портились чужие поля (SDA-62).
export default (maFile: MaFileInterface): string => {
    const clean = stripLegacyMarketData(maFile);
    const steamId = getSteamID64(clean);
    if (!/^[1-9]\d*$/.test(steamId)) return JSON.stringify(clean);
    return JSONbig.stringify({ ...clean, Session: { ...clean.Session, SteamID: JSONbig.parse(steamId) } });
}

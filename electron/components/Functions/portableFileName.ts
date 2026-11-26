/** Имя файла, допустимое на любой системе (SDA-62): логин в чужом файле может быть любой строкой. */
export default function portableFileName(name: string): string {
    const safe = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100).replace(/^[.]+|[.]+$/g, "");
    if (!safe) return "account";
    // Windows не принимает эти имена с любым расширением
    return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(safe) ? `_${safe}` : safe;
}

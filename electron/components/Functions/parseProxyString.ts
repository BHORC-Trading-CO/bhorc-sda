// Разбор строки прокси "логин:пароль@host:port". Без импортов Node: файл берут и рендерер (поля форм),
// и main (импорт списка), чтобы в окне и в хранилище был один и тот же прокси (SDA-64).
// Логин с паролем отделяет последняя "@", логин от пароля — первая ":", порт от host — последняя ":".
// Так в пароле могут быть ":" и "@": раньше он молча обрезался, и сохранялся другой пароль.
export default function parseProxyString(value: string): { host: string, port: string, username: string, password: string } {
    const at = value.lastIndexOf("@");
    const [username, password] = splitAt(at === -1 ? value : value.slice(0, at), (text) => text.indexOf(":"));
    const [host, port] = splitAt(at === -1 ? "" : value.slice(at + 1), (text) => text.lastIndexOf(":"));
    return { username, password, host, port };
}

function splitAt(text: string, find: (text: string) => number): [string, string] {
    const index = find(text);
    return index === -1 ? [text, ""] : [text.slice(0, index), text.slice(index + 1)];
}

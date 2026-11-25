/** Отправка в окно, сбой которой не должен прервать сохранение секретов и аккаунта (SDA-63). */
export default function quietly(send: () => void): void {
    try {
        send();
    } catch (err) {
        console.log(`window send failed: ${err}`);
    }
}

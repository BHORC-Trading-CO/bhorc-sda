import { App } from "electron";

// Два экземпляра на одной папке данных затирают config.json друг другу (запись идёт целиком).
// Второй экземпляр сразу выходит, а первый поднимает своё окно.
export default function ensureSingleInstance(app: Pick<App, "requestSingleInstanceLock" | "quit" | "on">, onSecondInstance: () => void): boolean {
    if (!app.requestSingleInstanceLock()) {
        console.log("BHORC SDA уже запущен: переключаемся на открытое окно и выходим.");
        app.quit();
        return false;
    }
    app.on("second-instance", onSecondInstance);
    return true;
}

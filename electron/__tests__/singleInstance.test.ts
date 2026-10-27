import ensureSingleInstance from "../components/application/singleInstance";

function fakeApp(lock: boolean) {
    return { requestSingleInstanceLock: jest.fn(() => lock), quit: jest.fn(), on: jest.fn() };
}

describe("один экземпляр приложения", () => {
    it("второй экземпляр выходит и не регистрирует обработчики", () => {
        const app = fakeApp(false);
        expect(ensureSingleInstance(app as any, () => undefined)).toBe(false);
        expect(app.quit).toHaveBeenCalled();
        expect(app.on).not.toHaveBeenCalled();
    });

    it("первый экземпляр поднимает своё окно, когда запускают второй", () => {
        const app = fakeApp(true);
        const focus = jest.fn();
        expect(ensureSingleInstance(app as any, focus)).toBe(true);
        expect(app.quit).not.toHaveBeenCalled();
        const [event, handler] = app.on.mock.calls[0];
        expect(event).toBe("second-instance");
        handler();
        expect(focus).toHaveBeenCalled();
    });
});

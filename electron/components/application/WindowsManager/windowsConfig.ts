// Рамка окна (frame, titleBarStyle) и иконка окна задаются по платформе в windowChrome.ts.
export default {
    mainWindow: {
        width: 1920,
        height: 1080,
        minWidth: 1024,
        minHeight: 768,
        maxWidth: 3840,
        maxHeight: 2160,
        resizable: true
    },
    askPinWindow: {
        width: 500,
        height: 200,
        minWidth: 500,
        minHeight: 200,
        maxWidth: 3840,
        maxHeight: 2160,
        resizable: true
    },
    confirmationsWindow: {
        width: 520,
        height: 660,
        minWidth: 520,
        minHeight: 660,
        maxWidth: 3840,
        maxHeight: 2160,
        resizable: true
    },
    authWindow: {
        width: 360,
        height: 450,
        minWidth: 360,
        minHeight: 450,
        maxWidth: 3840,
        maxHeight: 2160,
        resizable: true
    },
    errorWindow: {
        width: 400,
        height: 200,
        minWidth: 400,
        minHeight: 200,
        maxWidth: 3840,
        maxHeight: 2160,
        resizable: true
    }
}
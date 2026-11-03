// Подключается первым импортом в main.ts, в preload-мостах и в src/index.tsx.
import { installConsoleRedaction } from "./redactSecrets";

installConsoleRedaction();

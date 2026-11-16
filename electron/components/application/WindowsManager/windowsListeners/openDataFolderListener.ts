import { app, IpcMainEvent, shell } from 'electron';
import { t } from '../../../../i18n';

/**
 * Opens the data folder (the pinned userData directory) in the system file manager.
 * The path never comes from the renderer and never goes through a shell: shell.openPath gets it
 * as a single argument, so spaces ("Application Support", Windows user names) and shell
 * metacharacters are plain characters on every platform.
 */
export default async (event: IpcMainEvent) => {
    const folderPath = app.getPath('userData');
    try {
        // openPath resolves with an error message on failure and with "" on success.
        const error = await shell.openPath(folderPath);
        if (error) throw new Error(error);
    } catch (err) {
        event.reply('ERROR', t('errors.openDataFolder', { path: folderPath, error: err instanceof Error ? err.message : String(err) }));
    }
}

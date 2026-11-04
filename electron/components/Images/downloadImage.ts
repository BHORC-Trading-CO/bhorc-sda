import request from 'request';
import fs from 'fs';
import sanitizeAvatarUrl from '../Functions/sanitizeAvatarUrl';
import { sanitizeConfirmationIconUrl } from './confirmationIcon';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Контракт someFuncs/downloadImage: тот же URL/proxy и запрет редиректов,
 * но ограниченный transfer не может навсегда занять слот очереди изображений. */
export default function downloadImage(uri: string, filename: string, proxyUrl: string | null): Promise<void> {
    if (sanitizeAvatarUrl(uri) !== uri) return Promise.reject(new Error('Invalid avatar URL'));
    return download(uri, filename, proxyUrl);
}

export function downloadConfirmationIcon(uri: string, filename: string, proxyUrl: string | null): Promise<void> {
    if (sanitizeConfirmationIconUrl(uri) !== uri) return Promise.reject(new Error('Invalid confirmation icon URL'));
    return download(uri, filename, proxyUrl);
}

function download(uri: string, filename: string, proxyUrl: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
        let output: fs.WriteStream | undefined;
        let outputClosed = false;
        let settled = false;
        const req = request({ url: uri, proxy: proxyUrl || undefined, followRedirect: false, followAllRedirects: false, timeout: 15000 });
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            req.abort();
            // open() может ещё выполняться. Дождаться close перед удалением .part
            // в сервисе, иначе поздний open создаст файл уже после cleanup.
            if (output && !outputClosed) {
                output.once('close', () => reject(error));
                output.destroy();
            } else reject(error);
        };
        const deadline = setTimeout(() => fail(new Error('Image download timed out')), 15000);
        req.on('error', fail).on('response', response => {
            if (settled) return;
            if (response.statusCode !== 200) return fail(new Error('Image HTTP status rejected'));
            let bytes = 0;
            req.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > MAX_IMAGE_BYTES) fail(new Error('Image too large'));
            });
            output = fs.createWriteStream(filename, { mode: 0o600 });
            let finished = false;
            output.on('error', fail).on('finish', () => { finished = true; }).on('close', () => {
                outputClosed = true;
                if (settled) return;
                if (!finished) return fail(new Error('Image output closed early'));
                settled = true;
                clearTimeout(deadline);
                resolve();
            });
            req.pipe(output);
        });
    });
}

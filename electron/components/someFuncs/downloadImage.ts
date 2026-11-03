import request from "request";
import fs from 'fs';
import sanitizeAvatarUrl from "../Functions/sanitizeAvatarUrl";
import { t } from "../../i18n";

const download = (uri: string, filename: string, proxyUrl?: string | null): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (sanitizeAvatarUrl(uri) !== uri) return reject(new Error(t('errors.avatar.invalidUrl')));
        // Через прокси, чтобы не раскрывать реальный IP; редиректы не обходят список CDN.
        const req = request({ url: uri, proxy: proxyUrl || undefined, followRedirect: false, followAllRedirects: false });
        req.on('error', reject).on('response', response => {
            if (response.statusCode !== 200) {
                req.abort();
                return reject(new Error(t('errors.avatar.httpStatus')));
            }
            req.pipe(fs.createWriteStream(filename))
                .on('error', reject)
                .on('finish', resolve);
        });
    });
};

export default download;

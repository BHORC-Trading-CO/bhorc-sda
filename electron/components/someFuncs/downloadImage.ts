import request from "request";
import fs from 'fs';

const download = (uri: string, filename: string, proxyUrl?: string | null): Promise<void> => {
    // Через прокси, чтобы не раскрывать реальный IP при загрузке аватара с CDN Steam.
    const req = proxyUrl ? request.defaults({ proxy: proxyUrl }) : request;
    return new Promise((resolve, reject) => {
        if (!uri) return reject(new Error('downloadImage: пустой uri'));
        req.head(uri, (err, res, body) => {
            if (err) return reject(err);
            req(uri)
                .on('error', reject)
                .pipe(fs.createWriteStream(filename))
                .on('error', reject)
                .on('close', () => {
                    resolve();
                });
        });
    });
};

export default download;
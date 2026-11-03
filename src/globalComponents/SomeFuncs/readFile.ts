import i18n from '../../i18n/i18n';
const JSONbig = require('json-bigint');

const readFile = (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = () => {
            if (typeof (reader.result) !== 'string') return reject(new Error(i18n.t('files.notText')));
            // Раньше из текста вырезались все пробелы — вместе с пробелами внутри паролей и ников.
            // JSON пробелы между токенами и так допускает.
            try {
                resolve(JSONbig.parse(reader.result));
            } catch (err) {
                // json-bigint бросает простой объект { name, message, at, text }, а не Error:
                // приводим к Error, иначе обработчик не покажет причину, а промис должен завершиться.
                reject(new Error(i18n.t('files.invalidJson', { reason: (err && (err as { message?: string }).message) || err })));
            }
        }
        reader.onerror = () => {
            reject(new Error(i18n.t('files.readFailed', { name: file.name })));
        }
    });
}

export default readFile;

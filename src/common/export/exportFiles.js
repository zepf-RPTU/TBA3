/**
 * File-name building and download triggering for module exports.
 */

/** @type {Readonly<{[char: string]: string}>} */
const GERMAN_TRANSLITERATIONS = Object.freeze({
    ä: 'ae',
    ö: 'oe',
    ü: 'ue',
    ß: 'ss',
    Ä: 'Ae',
    Ö: 'Oe',
    Ü: 'Ue',
});

/**
 * Turn arbitrary text into a safe, lowercase, dash-separated file-name stem.
 * German umlauts are transliterated (ä→ae, ...) before the generic accent strip.
 * @param {unknown} value - Any value; coerced to a string first.
 * @returns {string}
 */
export function sanitizeFileStem(value) {
    const transliterated = String(value ?? '').replace(
        /[äöüßÄÖÜ]/g,
        (char) => GERMAN_TRANSLITERATIONS[char],
    );

    const normalized = transliterated
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

    return normalized || 'export';
}

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * @param {Date} date - The moment the export was taken.
 * @returns {string} `yyyyMMdd-HHmm`
 */
function formatTimestamp(date) {
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}`
    );
}

/**
 * @param {Date} date - When the export was taken.
 * @returns {string} `dd.MM.yyyy HH:mm`, the form the PDF footer prints.
 */
export function formatFooterDate(date) {
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * `tba3-{app}-{view}-{title}-{timestamp}.{ext}`
 * @param {{appId: string, title: string, view?: string, ext: string}} parts - What the name identifies: the dashboard, the module title, its source view and the extension; the current time is stamped.
 * @returns {string} The full file name, with empty segments omitted.
 */
export function buildExportFileName({ appId, title, view = '', ext }) {
    const segments = [
        'tba3',
        appId,
        view ? sanitizeFileStem(view) : '',
        sanitizeFileStem(title),
        formatTimestamp(new Date()),
    ].filter(Boolean);
    return `${segments.join('-')}.${ext}`;
}

/**
 * Encode a canvas as a Blob (promisified `canvas.toBlob`).
 * @param {HTMLCanvasElement} canvas
 * @param {'image/png'|'image/jpeg'} [mimeType='image/png']
 * @param {number} [quality] - JPEG quality 0..1
 * @returns {Promise<Blob>} The encoded image; rejects when the browser cannot encode it.
 */
export function canvasToBlob(canvas, mimeType = 'image/png', quality = undefined) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (result) =>
                result
                    ? resolve(result)
                    : reject(new Error(`[exportFiles] Could not encode ${mimeType}.`)),
            mimeType,
            quality,
        );
    });
}

/**
 * How long a download's object URL outlives the click. The browser may fetch the blob
 * only after `click()` returns, and a download whose URL is revoked first fails; 40 s is
 * what FileSaver.js waits.
 */
const DOWNLOAD_URL_LIFETIME_MS = 40_000;

/**
 * Download a blob via a temporary anchor.
 * @param {Blob} blob
 * @param {string} fileName - Name offered to the user.
 */
export function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}

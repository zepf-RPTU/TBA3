/**
 * Reading the pixels of an image the app produced: an exported PNG, a report card's
 * stored capture.
 */

/**
 * An exported image as a source the page can decode.
 * @param {Buffer} bytes
 * @param {'image/png'|'image/jpeg'} [type]
 * @returns {string} Its `data:` URL.
 */
export function imageSrc(bytes, type = 'image/png') {
    return `data:${type};base64,${bytes.toString('base64')}`;
}

/**
 * One pixel of an image, decoded in the page.
 * @param {import('@playwright/test').Page} page - A page to decode the image in.
 * @param {string} src - The image: a `data:` URL (`imageSrc`), or a URL the page can load (a report card's blob URL).
 * @param {number} x - Image pixels from the left.
 * @param {number} y - Image pixels from the top.
 * @returns {Promise<string>} The pixel as `getComputedStyle` writes a colour, `rgb(r, g, b)`.
 */
export async function pixelAt(page, src, x, y) {
    return /** @type {string} */ (await readImage(page, src, { at: { x, y } }));
}

/**
 * How much of an image is painted in a given colour, and how much is black.
 * @param {import('@playwright/test').Page} page
 * @param {string} src - The image, as for `pixelAt`.
 * @param {string} fill - The colour, as `getComputedStyle` reports it (`rgb(…)`).
 * @returns {Promise<{total: number, matching: number, black: number}>} Pixel counts.
 */
export async function fillShare(page, src, fill) {
    return /** @type {{total: number, matching: number, black: number}} */ (
        await readImage(page, src, { fill })
    );
}

/**
 * Decode an image in the page and answer one question about its pixels.
 * @param {import('@playwright/test').Page} page
 * @param {string} src
 * @param {{at?: {x: number, y: number}, fill?: string}} query - One pixel, or a colour's share.
 * @returns {Promise<string|{total: number, matching: number, black: number}>}
 */
function readImage(page, src, query) {
    return page.evaluate(
        async ({ url, at, fill }) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
            context.drawImage(image, 0, 0);
            if (at) {
                const [r, g, b] = context.getImageData(at.x, at.y, 1, 1).data;
                return `rgb(${r}, ${g}, ${b})`;
            }
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            const [r, g, b] = /** @type {RegExpMatchArray} */ (String(fill).match(/\d+/g)).map(
                Number,
            );
            let matching = 0;
            let black = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] === r && data[i + 1] === g && data[i + 2] === b) matching += 1;
                if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) black += 1;
            }
            return { total: data.length / 4, matching, black };
        },
        { url: src, ...query },
    );
}

/**
 * A canvas whose toBlob hands back a small blob of the type asked for, PNG by default.
 * @param {number} [widthPx]
 * @param {number} [heightPx]
 * @returns {HTMLCanvasElement}
 */
export function makeCanvas(widthPx = 640, heightPx = 320) {
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    canvas.toBlob = (cb, type = 'image/png') => cb(new Blob(['png'], { type }));
    return canvas;
}

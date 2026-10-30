/**
 * One capture as the cart hands it to `exportImageStore.put`, for suites that file
 * captures in the real store. Nothing here needs a DOM: the node project imports it.
 */

/**
 * @param {string} title - The module title the capture carries.
 * @param {string} [view] - The view it was captured on.
 * @returns {import('../../../src/common/export/exportImageStore.js').ExportImageRecord}
 */
export function captureRecord(title, view = 'overview') {
    return {
        title,
        view,
        blob: new Blob(['x'], { type: 'image/png' }),
        width: 10,
        height: 5,
        capturedAt: 1,
        docOrder: 0,
        datasetLabel: '8a',
    };
}

/**
 * Lazy loaders for the export-only libraries.
 *
 * html-to-image and jsPDF are npm dependencies pulled in through dynamic `import()`,
 * which the build splits into their own chunks — off the critical path (~440 kB
 * combined) and only fetched on the first export.
 */

/**
 * @returns {Promise<typeof import('html-to-image')>} The lazily loaded rasterisation library.
 */
export function loadHtmlToImage() {
    return import('html-to-image');
}

/**
 * @returns {Promise<typeof import('jspdf').jsPDF>} The lazily loaded PDF constructor.
 */
export async function loadJsPdf() {
    const { jsPDF } = await import('jspdf');
    return jsPDF;
}

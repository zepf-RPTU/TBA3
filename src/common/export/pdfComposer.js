/**
 * A4 page composition for raster captures (jsPDF).
 *
 * The page geometry comes from `pdfPagePlan.js`; `createPdfComposer()` turns
 * captures into pages of a single document — one `addCapture()` per module
 * card (sliced across pages only when `paginate` is set), or one `addBands()`
 * call for a sequence of row bands.
 */

import { loadJsPdf } from './exportLibs.js';
import { A4, planBandPages, planPdfPages } from './pdfPagePlan.js';
import { formatFooterDate } from './exportFiles.js';

/**
 * How jsPDF re-compresses each page image, in JavaScript on the main thread. Unset, it
 * takes its slowest level (zlib 9, Paeth filter): on the dashboard captures (flat chart
 * colours) FAST writes a report about 2.5 times as fast for files about a tenth larger.
 */
const IMAGE_COMPRESSION = 'FAST';

/**
 * The footer line stamped on every page.
 * @param {{appId: string, view?: string, page: number, total: number, date: Date}} meta - What the footer names: the dashboard, the source view, the page position, and the stamp date.
 * @returns {string} The footer strip, with empty parts omitted.
 */
export function formatFooterLine({ appId, view, page, total, date }) {
    return ['TBA3', appId.toUpperCase(), view, formatFooterDate(date), `Seite ${page}/${total}`]
        .filter(Boolean)
        .join(' · ');
}

/**
 * @typedef {object} PdfBand
 * @property {number} widthPx - Band width (any unit consistent with heightPx)
 * @property {number} heightPx
 * @property {() => HTMLCanvasElement} render - Builds the band canvas; called once, when its page is
 *   written. The composer owns the returned canvas and releases it (width = 0) once the band is drawn.
 */

/**
 * @param {{appId: string, title: string, view?: string}} document - The dashboard and the view it comes from, which every page footer names, and the document's title, which its properties carry.
 * @returns {Promise<{addCapture: (canvas: HTMLCanvasElement, options: {paginate: boolean}) => void,
 *                    addBands: (bands: Array<PdfBand>) => void,
 *                    save: (fileName: string) => void}>} A composer over a lazily loaded jsPDF instance.
 */
export async function createPdfComposer({ appId, title, view = '' }) {
    const jsPDF = await loadJsPdf();
    /** @type {import('jspdf').jsPDF|null} */
    let doc = null;
    let pageCount = 0;
    let imageCount = 0;

    /**
     * @param {'portrait'|'landscape'} orientation
     * @returns {import('jspdf').jsPDF} The document, now on the new page.
     */
    const ensurePage = (orientation) => {
        if (!doc) {
            doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
        } else {
            doc.addPage('a4', orientation);
        }
        pageCount++;
        return doc;
    };

    /**
     * Place one image on the current page.
     * @param {import('jspdf').jsPDF} pdf
     * @param {HTMLCanvasElement} canvas
     * @param {{x: number, y: number, w: number, h: number}} box - In mm on the page.
     */
    const addImage = (pdf, canvas, { x, y, w, h }) => {
        // Every image is new: its own alias spares jsPDF hashing the encoded image to
        // find a duplicate.
        imageCount++;
        pdf.addImage(canvas, 'PNG', x, y, w, h, `image-${imageCount}`, IMAGE_COMPRESSION);
    };

    return {
        addCapture(canvas, { paginate }) {
            // Geometry is ratio-based, so device pixels work directly and the
            // slice offsets come back in canvas pixels.
            const plan = planPdfPages(
                { widthPx: canvas.width, heightPx: canvas.height },
                { paginate },
            );

            plan.pages.forEach((page) => {
                // Whole canvas rows, each page starting at the row the previous one
                // ended on. A tail under half a row (a capture a hair taller than its
                // pages, or the float residue of the plan's sum) holds no row: no page.
                const top = Math.round(page.srcYPx);
                const bottom = Math.min(canvas.height, Math.round(page.srcYPx + page.srcHPx));
                if (bottom <= top) return;
                const pdf = ensurePage(plan.orientation);
                const slice = sliceCanvas(canvas, top, bottom - top);
                addImage(pdf, slice, {
                    x: A4.marginMm + plan.xMm,
                    y: A4.marginMm,
                    w: plan.imageWidthMm,
                    h: (bottom - top) * plan.scale,
                });
                // Release a page slice's backing store now: a tall table at pixel ratio 2
                // would otherwise hold several multi-megapixel canvases until GC.
                if (slice !== canvas) slice.width = 0;
            });
        },

        addBands(bands) {
            const plan = planBandPages(
                bands.map(({ widthPx, heightPx }) => ({ widthPx, heightPx })),
            );

            // Placements come in band order, so a one-slot cache renders each
            // band exactly once and lets the previous band's canvas go before
            // the next one is built.
            /** @type {{index: number, canvas: HTMLCanvasElement|null}} */
            const current = { index: -1, canvas: null };
            /**
             * @param {number} index - The band's index in `bands`.
             * @returns {HTMLCanvasElement}
             */
            const canvasFor = (index) => {
                if (current.index !== index) {
                    // Release the backing store now.
                    if (current.canvas) current.canvas.width = 0;
                    current.index = index;
                    current.canvas = bands[index].render();
                }
                return /** @type {HTMLCanvasElement} */ (current.canvas);
            };

            plan.pages.forEach((placements) => {
                const pdf = ensurePage('portrait');
                placements.forEach((placement) => {
                    addImage(pdf, canvasFor(placement.band), {
                        x: A4.marginMm + placement.xMm,
                        y: A4.marginMm + placement.yMm,
                        w: placement.widthMm,
                        h: placement.heightMm,
                    });
                });
            });
            if (current.canvas) current.canvas.width = 0;
        },

        save(fileName) {
            const pdf = doc;
            if (!pdf) throw new Error('[pdfComposer] Nothing to save.');
            const date = new Date();
            for (let page = 1; page <= pageCount; page++) {
                pdf.setPage(page);
                const pageW = pdf.internal.pageSize.getWidth();
                const pageH = pdf.internal.pageSize.getHeight();
                const line = formatFooterLine({ appId, view, page, total: pageCount, date });
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(110);
                pdf.text(line, A4.marginMm, pageH - A4.marginMm / 2, {
                    maxWidth: pageW - 2 * A4.marginMm,
                });
            }
            pdf.setProperties({ title: title || 'TBA3 Export', creator: 'TBA3' });
            pdf.save(fileName);
        },
    };
}

/**
 * @param {HTMLCanvasElement} source
 * @param {number} y - First row, in device pixels.
 * @param {number} height - Rows, in device pixels; at least one.
 * @returns {HTMLCanvasElement} The requested slice, or `source` itself when the slice covers the whole canvas.
 */
function sliceCanvas(source, y, height) {
    if (y === 0 && height >= source.height) return source;

    const slice = document.createElement('canvas');
    slice.width = source.width;
    slice.height = height;
    const context = slice.getContext('2d');
    if (!context) throw new Error('[pdfComposer] Canvas 2D context unavailable.');
    context.drawImage(source, 0, y, source.width, height, 0, 0, source.width, height);
    return slice;
}

/**
 * A4 page composition for raster captures (jsPDF).
 *
 * `planPdfPages()` and `planBandPages()` are pure geometry (unit-tested);
 * `createPdfComposer()` turns captures into pages of a single document — one
 * `addCapture()` per module card, or one `addBands()` call for the report
 * view's row bands (each band canvas is rendered only when its page is
 * written, so one band lives at a time).
 */

import { loadJsPdf } from './exportLibs.js';
import { formatFooterDate, getAppId } from './exportFiles.js';

/** DIN A4 in millimetres plus the layout margins used for every page. */
export const A4 = Object.freeze({ w: 210, h: 297, margin: 12, footer: 8 });

/** Vertical gutter between two bands on the same page (mm). */
export const BAND_GAP_MM = 4;

/**
 * Portrait is the default. Wide content switches to landscape only when it is
 * clearly wide *and* still fits a single landscape page — a landscape run that
 * would need slicing is worse than one taller portrait page.
 */
const LANDSCAPE_MIN_ASPECT = 1.6;

/**
 * @param {'portrait'|'landscape'} orientation - Page orientation to measure.
 * @returns {{width: number, height: number}} usable content box in mm
 */
export function contentBox(orientation) {
    const pageW = orientation === 'landscape' ? A4.h : A4.w;
    const pageH = orientation === 'landscape' ? A4.w : A4.h;
    return {
        width: pageW - 2 * A4.margin,
        height: pageH - 2 * A4.margin - A4.footer,
    };
}

/**
 * Decide orientation, scale and page slicing for a capture of the given pixel size
 * (any unit — only ratios matter; slice offsets come back in the same unit).
 * The image always fills the content width; taller captures are sliced across pages.
 * @param {{widthPx: number, heightPx: number}} size - Capture size in any unit; only the ratio matters.
 * @returns {{orientation: 'portrait'|'landscape', scale: number, imageWidthMm: number,
 *            pages: Array<{srcY: number, srcH: number, heightMm: number}>}} The chosen orientation and scale, plus one entry per page with the source slice it carries.
 */
export function planPdfPages({ widthPx, heightPx }) {
    const w = Math.max(1, widthPx);
    const h = Math.max(1, heightPx);

    const landscapeBox = contentBox('landscape');
    const fitsOneLandscapePage = h * (landscapeBox.width / w) <= landscapeBox.height;
    const orientation =
        w / h >= LANDSCAPE_MIN_ASPECT && fitsOneLandscapePage ? 'landscape' : 'portrait';

    const box = contentBox(orientation);
    const scale = box.width / w; // mm per CSS px
    const pageSrcHeight = box.height / scale; // CSS px that fit on one page

    const pages = [];
    for (let srcY = 0; srcY < h; srcY += pageSrcHeight) {
        const srcH = Math.min(pageSrcHeight, h - srcY);
        pages.push({ srcY, srcH, heightMm: srcH * scale });
    }

    return { orientation, scale, imageWidthMm: box.width, pages };
}

/**
 * @typedef {object} BandPlacement
 * @property {number} band - Index into the bands passed in
 * @property {number} xMm - Left edge inside the page content box
 * @property {number} yMm - Top edge inside the page content box
 * @property {number} widthMm - Rendered width on the page.
 * @property {number} heightMm - Rendered height on the page.
 */

/**
 * Pack a sequence of bands (the report's grid rows) onto portrait pages top to
 * bottom. A band is never cut: one that fits the content width but not the
 * remaining space moves to the next page, and one taller than a whole page is
 * scaled down until it fits and placed alone, centred. Every band therefore
 * gets exactly one placement.
 * @param {Array<{widthPx: number, heightPx: number}>} bands - in report order (any unit; ratios only)
 * @param {{gapMm?: number}} [options] - Vertical gap between bands on a page.
 * @returns {{pages: Array<Array<BandPlacement>>}} One array of placements per page; every band gets exactly one placement.
 */
export function planBandPages(bands, { gapMm = BAND_GAP_MM } = {}) {
    const box = contentBox('portrait');
    /** @type {Array<Array<BandPlacement>>} */
    const pages = [];
    /** @type {Array<BandPlacement>} */
    let page = [];
    let cursorMm = 0;
    const closePage = () => {
        if (page.length > 0) pages.push(page);
        page = [];
        cursorMm = 0;
    };

    bands.forEach((band, index) => {
        const w = Math.max(1, band.widthPx);
        const h = Math.max(1, band.heightPx);
        const heightMm = h * (box.width / w);

        if (heightMm <= box.height) {
            if (page.length > 0 && cursorMm + gapMm + heightMm > box.height) closePage();
            const yMm = page.length > 0 ? cursorMm + gapMm : 0;
            page.push({ band: index, xMm: 0, yMm, widthMm: box.width, heightMm });
            cursorMm = yMm + heightMm;
            return;
        }

        // Taller than a page even at full width: shrink it to the page height
        // and give it a page of its own rather than cutting through it.
        closePage();
        const widthMm = box.width * (box.height / heightMm);
        page.push({
            band: index,
            xMm: (box.width - widthMm) / 2,
            yMm: 0,
            widthMm,
            heightMm: box.height,
        });
        closePage();
    });
    closePage();

    return { pages };
}

/**
 * The footer line stamped on every page — and mirrored by the report preview's
 * page sheets, so the preview shows the same strip the PDF will carry.
 * @param {{view?: string, title?: string, page: number, total: number, date?: Date}} meta - What the footer names: the source view and title, the page position, and the stamp date.
 * @returns {string} The footer strip, with empty parts omitted.
 */
export function formatFooterLine({ view, title, page, total, date = new Date() }) {
    return [
        'TBA3',
        getAppId().toUpperCase(),
        view,
        title,
        formatFooterDate(date),
        `Seite ${page}/${total}`,
    ]
        .filter(Boolean)
        .join(' · ');
}

/**
 * @typedef {object} PdfBand
 * @property {number} widthPx - Band width (any unit consistent with heightPx)
 * @property {number} heightPx - Band height
 * @property {() => HTMLCanvasElement} render - Builds the band canvas; called once, when its page is
 *   written. The composer owns the returned canvas and releases it (width = 0) once the band is drawn.
 */

/**
 * @returns {Promise<{addCapture: (canvas: HTMLCanvasElement, meta: {title: string, view?: string}) => void,
 *                    addBands: (bands: Array<PdfBand>, meta: {title: string, view?: string}) => void,
 *                    save: (fileName: string) => void, pageCount: () => number}>} A composer over a lazily loaded jsPDF instance.
 */
export async function createPdfComposer() {
    const jsPDF = await loadJsPdf();
    /** @type {any} */
    let doc = null;
    /** @type {Array<{title: string, view: string}>} */
    const pageMeta = [];

    const ensurePage = (orientation) => {
        if (!doc) {
            doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
        } else {
            doc.addPage('a4', orientation);
        }
    };

    return {
        addCapture(canvas, meta) {
            // Geometry is ratio-based, so device pixels work directly and the
            // slice offsets come back in canvas pixels.
            const plan = planPdfPages({ widthPx: canvas.width, heightPx: canvas.height });

            plan.pages.forEach((page) => {
                ensurePage(plan.orientation);
                const slice = sliceCanvas(canvas, page.srcY, page.srcH);
                doc.addImage(slice, 'PNG', A4.margin, A4.margin, plan.imageWidthMm, page.heightMm);
                pageMeta.push({ title: meta?.title || '', view: meta?.view || '' });
            });
        },

        addBands(bands, meta) {
            const plan = planBandPages(
                bands.map(({ widthPx, heightPx }) => ({ widthPx, heightPx })),
            );

            // Placements come in band order, so a one-slot cache renders each
            // band exactly once and lets the previous band's canvas go before
            // the next one is built.
            /** @type {{index: number, canvas: HTMLCanvasElement|null}} */
            const current = { index: -1, canvas: null };
            const canvasFor = (index) => {
                if (current.index !== index) {
                    if (current.canvas) current.canvas.width = 0; // release the backing store now
                    current.index = index;
                    current.canvas = bands[index].render();
                }
                return /** @type {HTMLCanvasElement} */ (current.canvas);
            };

            plan.pages.forEach((placements) => {
                ensurePage('portrait');
                placements.forEach((placement) => {
                    doc.addImage(
                        canvasFor(placement.band),
                        'PNG',
                        A4.margin + placement.xMm,
                        A4.margin + placement.yMm,
                        placement.widthMm,
                        placement.heightMm,
                    );
                });
                pageMeta.push({ title: meta?.title || '', view: meta?.view || '' });
            });
            if (current.canvas) current.canvas.width = 0;
        },

        save(fileName) {
            if (!doc) throw new Error('[pdfComposer] Nothing to save.');
            const total = pageMeta.length;
            const date = new Date();
            pageMeta.forEach((meta, index) => {
                doc.setPage(index + 1);
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const line = formatFooterLine({
                    view: meta.view,
                    title: meta.title,
                    page: index + 1,
                    total,
                    date,
                });
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(110);
                doc.text(line, A4.margin, pageH - A4.margin / 2, {
                    maxWidth: pageW - 2 * A4.margin,
                });
            });
            doc.setProperties({ title: pageMeta[0]?.title || 'TBA3 Export', creator: 'TBA3' });
            doc.save(fileName);
        },

        pageCount() {
            return pageMeta.length;
        },
    };
}

/**
 * @param {HTMLCanvasElement} source - The full capture.
 * @param {number} srcY - device px
 * @param {number} srcH - device px
 * @returns {HTMLCanvasElement} The requested slice, or `source` itself when the slice covers the whole canvas.
 */
function sliceCanvas(source, srcY, srcH) {
    const y = Math.round(srcY);
    const height = Math.max(1, Math.round(srcH));
    if (y === 0 && height >= source.height) return source;

    const slice = document.createElement('canvas');
    slice.width = source.width;
    slice.height = height;
    const context = slice.getContext('2d');
    if (!context) throw new Error('[pdfComposer] Canvas 2D context unavailable.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(source, 0, y, source.width, height, 0, 0, source.width, height);
    return slice;
}

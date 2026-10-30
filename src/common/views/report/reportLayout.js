/**
 * Report geometry: where the cart's arrangement (which cards, in what order, how wide;
 * `exportCart.js`) puts each card on the preview and in the PDF.
 *
 * Cards sit on a 12-column grid with one of four width presets. Preview and PDF
 * read the same geometry: `planReportBands()` wraps the cards into row bands and
 * `planBandPages()` packs those bands onto A4 pages. `planReportPages()` composes
 * the two into per-page card rectangles, which `layoutReportPreview()` turns into the
 * preview's pixels; `exportReportPdf()` feeds the same bands to `pdfComposer.addBands()`.
 */

import { createPdfComposer } from '../../export/pdfComposer.js';
import {
    A4,
    BAND_GAP_MM,
    contentBox,
    planBandPages,
    REPORT_BAND_WIDTH_PX,
} from '../../export/pdfPagePlan.js';
import { buildExportFileName } from '../../export/exportFiles.js';

/** CSS pixels per millimetre at the 96 dpi the browser assumes for `mm`. */
const PX_PER_MM = 96 / 25.4;
/** Space between two page sheets in the preview, independent of zoom. */
const SHEET_GAP_PX = 24;

/**
 * Where a card sits on the preview's pages.
 * @typedef {object} CardPlacement
 * @property {number} page - 1-based page it is printed on.
 * @property {'start'|'end'} align - Which edge its overlay toolbar flips to.
 * @property {{[property: string]: string}} style - Its position and size as custom properties, in preview px.
 */

/**
 * The preview's geometry, computed whenever the scroll area has a box.
 * @typedef {object} PreviewLayout
 * @property {{[property: string]: string}} pagesStyle - The page stack's size and page metrics, as custom properties.
 * @property {number} columns - Sheets side by side.
 * @property {Array<{[property: string]: string}>} sheets - Each sheet's position and size as custom properties, in page order.
 * @property {Map<string, CardPlacement>} cards - Each card's placement, by item id.
 */

/** Grid columns a report card's span counts in. */
const REPORT_COLUMNS = 12;

/** The column gutter that equals the page's vertical gutter. */
const REPORT_BAND_GAP_PX = REPORT_BAND_WIDTH_PX * (BAND_GAP_MM / contentBox('portrait').widthMm);

/**
 * A card of the report, as the planners read it: its width preset and its captured
 * image's pixel size.
 * @typedef {object} ReportCardInput
 * @property {string} id - Card id, matching the report entry.
 * @property {number} span - Grid columns the card occupies (one of `SPAN_PRESETS`, `exportCart.js`).
 * @property {{width: number, height: number}} record - The stored capture's size.
 */

/**
 * @typedef {object} ReportBandItem
 * @property {string} id
 * @property {number} x - Left edge inside the band (px); every card starts at the band's top.
 * @property {number} w - Rendered width (px)
 * @property {number} h - Rendered height (px)
 */

/**
 * @typedef {object} ReportBand
 * @property {number} width - Band width in px.
 * @property {number} height - Band height in px, set by its tallest card.
 * @property {Array<ReportBandItem>} items - The cards on this row, with their positions inside it.
 */

/**
 * Lay the cards out row by row (the CSS-grid auto-placement rule: a card that
 * no longer fits on the current row starts the next one; nothing is packed
 * back into gaps). Each card is scaled to its column width, so a band is as
 * tall as its tallest card.
 * @param {Array<ReportCardInput>} items - in report order
 * @returns {Array<ReportBand>} One band per row.
 */
function planReportBands(items) {
    const width = REPORT_BAND_WIDTH_PX;
    const gap = REPORT_BAND_GAP_PX;
    const columnWidth = (width - gap * (REPORT_COLUMNS - 1)) / REPORT_COLUMNS;
    /** @type {Array<ReportBand>} */
    const bands = [];
    /** @type {ReportBand|null} */
    let band = null;
    let column = 0;

    for (const item of items) {
        const { span } = item;
        if (!band || column + span > REPORT_COLUMNS) {
            band = { width, height: 0, items: [] };
            bands.push(band);
            column = 0;
        }
        const w = columnWidth * span + gap * (span - 1);
        const { width: imageWidth, height: imageHeight } = item.record;
        const h = imageWidth > 0 ? imageHeight * (w / imageWidth) : 0;
        band.items.push({ id: item.id, x: column * (columnWidth + gap), w, h });
        band.height = Math.max(band.height, h);
        column += span;
    }

    return bands;
}

/**
 * @typedef {object} ReportPageCard
 * @property {string} id
 * @property {number} xMm - Left edge inside the page's content box
 * @property {number} yMm - Top edge inside the page's content box
 * @property {number} wMm - Rendered width on the page.
 * @property {number} hMm - Rendered height on the page.
 */

/**
 * Where every card lands on which page, in millimetres inside the page content
 * box: the bands the PDF is composed from, packed by the same page planner.
 * @param {Array<ReportCardInput>} items - in report order
 * @returns {Array<Array<ReportPageCard>>} page index → the cards on that page
 */
export function planReportPages(items) {
    const bands = planReportBands(items);
    const { pages } = planBandPages(
        bands.map((band) => ({ widthPx: band.width, heightPx: band.height })),
    );

    return pages.map((placements) =>
        placements.flatMap((placement) => {
            const band = bands[placement.band];
            const scale = placement.widthMm / band.width; // mm per band px
            return band.items.map((item) => ({
                id: item.id,
                xMm: placement.xMm + item.x * scale,
                yMm: placement.yMm,
                wMm: item.w * scale,
                hMm: item.h * scale,
            }));
        }),
    );
}

/**
 * The preview's geometry: the plan the export uses (`planReportPages`), converted from
 * millimetres to preview pixels.
 * @param {Array<Array<ReportPageCard>>} plan - page index → the cards on that page
 * @param {{width: number, height: number}} available - The area one page has to fit into.
 * @param {string} zoom - The preview zoom: `fit-page`, `fit-width`, `full` or `half`.
 * @returns {PreviewLayout}
 */
export function layoutReportPreview(plan, available, zoom) {
    // A viewport shorter than the scroll area's own padding would make the
    // fit modes return a negative width, which the browser silently drops.
    const pageWidth = Math.max(1, pageWidthPx(zoom, available));
    const pageHeight = pageWidth * (A4.heightMm / A4.widthMm);
    const perMm = pageWidth / A4.widthMm;
    // Pages sit side by side whenever the viewport is wide enough for another
    // one. Never more columns than there are pages, so a short report stays
    // centred.
    const columns = Math.max(
        1,
        Math.min(
            plan.length || 1,
            Math.floor((available.width + SHEET_GAP_PX) / (pageWidth + SHEET_GAP_PX)),
        ),
    );
    const rows = Math.ceil(plan.length / columns);
    const stackWidth = columns * pageWidth + (columns - 1) * SHEET_GAP_PX;

    /** @type {Map<string, CardPlacement>} */
    const cards = new Map();
    plan.forEach((rects, pageIndex) => {
        const originX = (pageIndex % columns) * (pageWidth + SHEET_GAP_PX) + A4.marginMm * perMm;
        const originY =
            Math.floor(pageIndex / columns) * (pageHeight + SHEET_GAP_PX) + A4.marginMm * perMm;
        rects.forEach((rect) => {
            const left = originX + rect.xMm * perMm;
            const width = rect.wMm * perMm;
            cards.set(rect.id, {
                page: pageIndex + 1,
                // Flip the overlay toolbar on cards past the middle of the whole
                // stack, so it is not clipped by the edge of the scroll area.
                align: left + width / 2 > stackWidth / 2 ? 'end' : 'start',
                style: {
                    '--report-box-left': `${left}px`,
                    '--report-box-top': `${originY + rect.yMm * perMm}px`,
                    '--report-box-width': `${width}px`,
                    '--report-box-height': `${rect.hMm * perMm}px`,
                },
            });
        });
    });

    return {
        pagesStyle: {
            '--report-page-width': `${pageWidth}px`,
            '--report-page-margin': `${A4.marginMm * perMm}px`,
            '--report-stack-width': `${stackWidth}px`,
            '--report-stack-height':
                rows === 0 ? '0px' : `${rows * pageHeight + (rows - 1) * SHEET_GAP_PX}px`,
        },
        columns,
        sheets: plan.map((_, index) => ({
            '--report-box-left': `${(index % columns) * (pageWidth + SHEET_GAP_PX)}px`,
            '--report-box-top': `${Math.floor(index / columns) * (pageHeight + SHEET_GAP_PX)}px`,
            '--report-box-width': `${pageWidth}px`,
            '--report-box-height': `${pageHeight}px`,
        })),
        cards,
    };
}

/**
 * @param {string} zoom
 * @param {{width: number, height: number}} available - Size of the area the sheets are laid out in.
 * @returns {number} width of one page sheet in px
 */
function pageWidthPx(zoom, available) {
    switch (zoom) {
        case 'fit-width':
            return available.width;
        case 'full':
            return A4.widthMm * PX_PER_MM;
        case 'half':
            return (A4.widthMm * PX_PER_MM) / 2;
        default:
            return Math.min(available.width, available.height * (A4.widthMm / A4.heightMm));
    }
}

/**
 * Draw one band's cards onto a transparent canvas at the planned positions. The
 * gutters stay transparent, so the PDF paper shows through them.
 * @param {ReportBand} band
 * @param {Map<string, CanvasImageSource>} imageById - decoded images keyed by card id
 * @returns {HTMLCanvasElement} The size of the band.
 */
function composeBandCanvas(band, imageById) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(band.width));
    canvas.height = Math.max(1, Math.round(band.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('[reportLayout] Canvas 2D context unavailable.');
    for (const item of band.items) {
        const image = imageById.get(item.id);
        if (!image) throw new Error(`[reportLayout] No image for report card "${item.id}".`);
        context.drawImage(image, item.x, 0, item.w, item.h);
    }
    return canvas;
}

/**
 * Write the report as a PDF and download it: the cards are planned into the bands the
 * preview shows, and each band is composed from the cards' stored captures, decoded while
 * the PDF library loads.
 * @param {string} appId - The dashboard the report is from, for the footer and the file name.
 * @param {Array<import('../../export/exportCart.js').ReportItem>} items - in report order
 * @param {string} title - Document title, carried in the PDF properties and used for the file name.
 */
export async function exportReportPdf(appId, items, title) {
    const bands = planReportBands(items);
    const decoding = items.map((item) => createImageBitmap(item.record.blob));
    let composer, bitmaps;
    try {
        [composer, bitmaps] = await Promise.all([
            createPdfComposer({ appId, title }),
            Promise.all(decoding),
        ]);
    } catch (error) {
        // A failed library load or decode would otherwise leave the decoded bitmaps open.
        for (const result of await Promise.allSettled(decoding)) {
            if (result.status === 'fulfilled') result.value.close();
        }
        throw error;
    }
    const imageById = new Map(items.map((item, index) => [item.id, bitmaps[index]]));
    try {
        // Bands are rendered one at a time while the pages are written (a
        // 30-card report would otherwise hold ~30 full-width canvases at once).
        // The page planner reads only the bands' ratio, from the same unrounded sizes
        // the preview was planned from; only the canvas rounds.
        composer.addBands(
            bands.map((band) => ({
                widthPx: band.width,
                heightPx: band.height,
                render: () => composeBandCanvas(band, imageById),
            })),
        );
        composer.save(buildExportFileName({ appId, title, ext: 'pdf' }));
    } finally {
        for (const bitmap of bitmaps) bitmap.close();
    }
}

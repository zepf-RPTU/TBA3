/**
 * Report layout: which cards, in what order, how wide — and the geometry that
 * turns that arrangement into row bands for the PDF.
 *
 * Cards sit on a 12-column grid with one of four width presets. Preview and PDF
 * read the same geometry: `planReportBands()` wraps the cards into row bands and
 * `planBandPages()` packs those bands onto A4 pages. `planReportPages()` composes
 * the two into per-page card rectangles for the preview; the export feeds the
 * same bands to `pdfComposer.addBands()`.
 */

import { BAND_GAP_MM, contentBox, planBandPages } from '../../export/pdfComposer.js';

const STORAGE_KEY = 'tba3_report_layout_v1';
const STORAGE_VERSION = 1;

/** Grid columns and the widths a card may take, widest first. */
const REPORT_COLUMNS = 12;
export const SPAN_PRESETS = Object.freeze([12, 8, 6, 4]);
const DEFAULT_SPAN = 12;

/**
 * Reference width the bands are planned in. Any value works — only ratios reach
 * the page — but it is also the resolution the band canvases are composed at.
 */
const REPORT_BAND_WIDTH = 1800;

/** The column gutter, in band pixels, that equals the page's vertical gutter. */
const REPORT_BAND_GAP = REPORT_BAND_WIDTH * (BAND_GAP_MM / contentBox('portrait').width);

/**
 * @typedef {object} ReportLayoutEntry
 * @property {string} id - Export target id
 * @property {number} span - Grid columns the card occupies (one of SPAN_PRESETS)
 */

/**
 * @typedef {object} ReportBandItem
 * @property {string} id - Card id, matching the report entry.
 * @property {number} x - Left edge inside the band (px)
 * @property {number} y - Top edge inside the band (px)
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
 * @param {unknown} span - A stored span value, which may be absent or out of range.
 * @returns {number} The value when it is one of the presets, otherwise the default span.
 */
function normalizeSpan(span) {
    return SPAN_PRESETS.includes(/** @type {number} */ (span))
        ? /** @type {number} */ (span)
        : DEFAULT_SPAN;
}

/**
 * @param {string} appId - Dashboard id, which scopes the storage key.
 * @returns {Array<ReportLayoutEntry>} ordered entries; empty when nothing usable is stored
 */
export function loadReportLayout(appId) {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        if (parsed?.version !== STORAGE_VERSION) return [];
        const items = parsed?.byApp?.[appId]?.items;
        if (!Array.isArray(items)) return [];
        return items
            .filter((entry) => typeof entry?.id === 'string' && entry.id.trim())
            .map((entry) => ({ id: entry.id, span: normalizeSpan(entry.span) }));
    } catch (error) {
        console.error('[reportLayout] Failed to load layout:', error);
        return [];
    }
}

/**
 * @param {string} appId - Dashboard id, which scopes the storage key.
 * @param {Array<ReportLayoutEntry>} items - ordered entries
 */
export function saveReportLayout(appId, items) {
    try {
        let byApp = {};
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
            if (
                parsed?.version === STORAGE_VERSION &&
                parsed.byApp &&
                typeof parsed.byApp === 'object'
            ) {
                byApp = parsed.byApp;
            }
        } catch {
            // Unreadable payload: overwrite it.
        }
        byApp[appId] = { items: items.map(({ id, span }) => ({ id, span: normalizeSpan(span) })) };
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, byApp }));
    } catch (error) {
        console.error('[reportLayout] Failed to save layout:', error);
    }
}

/**
 * Join the stored arrangement with the images that actually exist: stored
 * entries keep their order and width as long as their image is still there;
 * images without an entry are appended in view order (then by position in
 * the view, then capture time) at full width — so a fresh report reads
 * top-to-bottom like the sidebar.
 * @param {Array<ReportLayoutEntry>} stored - The arrangement last saved, which may name images that no longer exist.
 * @param {Array<{itemId: string, view: string, docOrder: number, capturedAt: number}>} records - The images that actually exist, with their provenance.
 * @param {Array<string>} viewOrder - view keys in sidebar order
 * @returns {Array<ReportLayoutEntry>} Stored entries that still have an image, in their saved order, then the new images appended at full width.
 */
export function mergeReportLayout(stored, records, viewOrder) {
    const recordIds = new Set(records.map((record) => record.itemId));
    const kept = stored
        .filter((entry) => recordIds.has(entry.id))
        .map((entry) => ({ id: entry.id, span: normalizeSpan(entry.span) }));
    const keptIds = new Set(kept.map((entry) => entry.id));

    const viewIndex = (view) => {
        const index = viewOrder.indexOf(view);
        return index === -1 ? viewOrder.length : index;
    };
    const added = records
        .filter((record) => !keptIds.has(record.itemId))
        .sort(
            (a, b) =>
                viewIndex(a.view) - viewIndex(b.view) ||
                (a.docOrder ?? 0) - (b.docOrder ?? 0) ||
                (a.capturedAt ?? 0) - (b.capturedAt ?? 0),
        )
        .map((record) => ({ id: record.itemId, span: DEFAULT_SPAN }));

    return [...kept, ...added];
}

// ============================================================================
// GEOMETRY
// ============================================================================

/**
 * Lay the cards out row by row (the CSS-grid auto-placement rule: a card that
 * no longer fits on the current row starts the next one; nothing is packed
 * back into gaps). Each card is scaled to its column width, so a band is as
 * tall as its tallest card.
 * @param {Array<{id: string, span: number, width: number, height: number}>} items - in report order
 * @param {{columns?: number, gap?: number, width?: number}} [options] - Column count, gap and total width; each defaults to the report constant.
 * @returns {Array<ReportBand>} One band per rendered row, each as tall as its tallest card.
 */
export function planReportBands(
    items,
    { columns = REPORT_COLUMNS, gap = REPORT_BAND_GAP, width = REPORT_BAND_WIDTH } = {},
) {
    const columnWidth = (width - gap * (columns - 1)) / columns;
    /** @type {Array<ReportBand>} */
    const bands = [];
    /** @type {ReportBand|null} */
    let band = null;
    let column = 0;

    for (const item of items) {
        const span = Math.min(columns, Math.max(1, normalizeSpan(item.span)));
        if (!band || column + span > columns) {
            band = { width, height: 0, items: [] };
            bands.push(band);
            column = 0;
        }
        const w = columnWidth * span + gap * (span - 1);
        const h = item.width > 0 ? item.height * (w / item.width) : 0;
        band.items.push({ id: item.id, x: column * (columnWidth + gap), y: 0, w, h });
        band.height = Math.max(band.height, h);
        column += span;
    }

    return bands;
}

/**
 * @typedef {object} ReportPageCard
 * @property {string} id - Card id, matching the report entry.
 * @property {number} xMm - Left edge inside the page's content box
 * @property {number} yMm - Top edge inside the page's content box
 * @property {number} wMm - Rendered width on the page.
 * @property {number} hMm - Rendered height on the page.
 */

/**
 * Where every card lands on which page, in millimetres inside the page content
 * box. This is what the preview draws — the same bands the PDF is composed
 * from, packed by the same page planner, so preview and export cannot drift.
 * @param {Array<{id: string, span: number, width: number, height: number}>} items - in report order
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
                yMm: placement.yMm + item.y * scale,
                wMm: item.w * scale,
                hMm: item.h * scale,
            }));
        }),
    );
}

/**
 * Draw one band's cards onto a white canvas at the planned positions.
 * @param {ReportBand} band - The planned row, with each card’s position and size.
 * @param {Map<string, CanvasImageSource>} imageById - decoded images keyed by card id
 * @returns {HTMLCanvasElement} A white canvas the size of the band, with every card drawn at its planned position.
 */
export function composeBandCanvas(band, imageById) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(band.width));
    canvas.height = Math.max(1, Math.round(band.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('[reportLayout] Canvas 2D context unavailable.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const item of band.items) {
        const image = imageById.get(item.id);
        if (!image) throw new Error(`[reportLayout] No image for report card "${item.id}".`);
        context.drawImage(image, item.x, item.y, item.w, item.h);
    }
    return canvas;
}

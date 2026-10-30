/**
 * A4 page geometry for PDF exports — pure, no jsPDF.
 *
 * `planPdfPages()` lays one capture out (sliced across pages, or shrunk onto
 * one), `planBandPages()` packs the report's row bands onto pages; whatever draws a
 * page reads the same page box.
 */

/** DIN A4 plus the layout margins used for every page. */
export const A4 = Object.freeze({ widthMm: 210, heightMm: 297, marginMm: 12, footerMm: 8 });

/** Vertical gutter between two bands on the same page. */
export const BAND_GAP_MM = 4;

/**
 * Reference width the report's bands are planned in. Any value works — only ratios
 * reach the page — but it is also the resolution the band canvases are composed at, so
 * a report card captured wider is downsampled anyway.
 */
export const REPORT_BAND_WIDTH_PX = 1800;

/**
 * @param {'portrait'|'landscape'} orientation
 * @returns {{widthMm: number, heightMm: number}} usable content box
 */
export function contentBox(orientation) {
    const pageWidthMm = orientation === 'landscape' ? A4.heightMm : A4.widthMm;
    const pageHeightMm = orientation === 'landscape' ? A4.widthMm : A4.heightMm;
    return {
        widthMm: pageWidthMm - 2 * A4.marginMm,
        heightMm: pageHeightMm - 2 * A4.marginMm - A4.footerMm,
    };
}

/**
 * Decide orientation, scale and page slicing for a capture of the given pixel size
 * (any unit — only ratios matter; slice offsets come back in the same unit).
 * Portrait is the default: content switches to landscape when it fits a single landscape
 * page at full width, where it always prints larger than on a portrait page — a
 * landscape run that would need slicing is worse than one taller portrait page, so
 * nothing taller switches. The image fills the content width;
 * a taller capture is sliced across pages when `paginate` is set (a table, read row
 * by row), and otherwise shrunk onto one page, centred, as the report treats a band
 * taller than a page.
 * @param {{widthPx: number, heightPx: number}} size
 * @param {{paginate: boolean}} options
 * @returns {{orientation: 'portrait'|'landscape', scale: number, imageWidthMm: number, xMm: number,
 *            pages: Array<{srcYPx: number, srcHPx: number}>}} The chosen orientation and scale, the image's width and left edge inside the content box, plus one entry per page with the source slice it carries.
 */
export function planPdfPages({ widthPx, heightPx }, { paginate }) {
    const w = Math.max(1, widthPx);
    const h = Math.max(1, heightPx);

    const landscapeBox = contentBox('landscape');
    const fitsOneLandscapePage = h * (landscapeBox.widthMm / w) <= landscapeBox.heightMm;
    const orientation = fitsOneLandscapePage ? 'landscape' : 'portrait';

    const box = contentBox(orientation);
    const fullWidthScale = box.widthMm / w; // mm per source unit
    if (!paginate && h * fullWidthScale > box.heightMm) {
        const scale = box.heightMm / h;
        const imageWidthMm = w * scale;
        return {
            orientation,
            scale,
            imageWidthMm,
            xMm: (box.widthMm - imageWidthMm) / 2,
            pages: [{ srcYPx: 0, srcHPx: h }],
        };
    }

    const pageSrcHeight = box.heightMm / fullWidthScale; // source units that fit on one page
    const pages = [];
    for (let srcYPx = 0; srcYPx < h; srcYPx += pageSrcHeight) {
        const srcHPx = Math.min(pageSrcHeight, h - srcYPx);
        pages.push({ srcYPx, srcHPx });
    }

    return { orientation, scale: fullWidthScale, imageWidthMm: box.widthMm, xMm: 0, pages };
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
 * scaled down until it fits and placed alone, centred.
 * @param {Array<{widthPx: number, heightPx: number}>} bands - in report order (any unit; ratios only)
 * @returns {{pages: Array<Array<BandPlacement>>}} One array of placements per page; every band gets exactly one placement.
 */
export function planBandPages(bands) {
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
        const heightMm = h * (box.widthMm / w);

        if (heightMm <= box.heightMm) {
            if (page.length > 0 && cursorMm + BAND_GAP_MM + heightMm > box.heightMm) closePage();
            const yMm = page.length > 0 ? cursorMm + BAND_GAP_MM : 0;
            page.push({ band: index, xMm: 0, yMm, widthMm: box.widthMm, heightMm });
            cursorMm = yMm + heightMm;
            return;
        }

        // Taller than a page even at full width: shrink it to the page height
        // and give it a page of its own rather than cutting through it.
        closePage();
        const widthMm = box.widthMm * (box.heightMm / heightMm);
        page.push({
            band: index,
            xMm: (box.widthMm - widthMm) / 2,
            yMm: 0,
            widthMm,
            heightMm: box.heightMm,
        });
        closePage();
    });
    closePage();

    return { pages };
}

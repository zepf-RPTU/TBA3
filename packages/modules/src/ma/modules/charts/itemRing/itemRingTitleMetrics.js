/**
 * Everything about an item ring's title and font: the ring-size-driven font size, whether
 * a title fits one line, the vertical space the title lines reserve above the ring, and
 * where the ring then sits. Pure over the grid's measurements, so the grid layout reserves
 * the same space the ring draws in. Every length is in px.
 */

import { measureTextWidth } from '@tba3/module-base';
import { fontWeightToken } from '../../../../common/utils/fontTokens.js';
import { LABEL_LINE_HEIGHT_EM } from '../../../../common/charts/chartLabelFit.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { formatCount } from '../../../../common/utils/numberFormat.js';
import { RING_REACH } from './itemRingGeometry.js';

/** Gap between the title and the edges of the band it reserves. */
export const TITLE_PADDING_PX = 2;
/** Room each side of a title before it wraps. */
const TITLE_HORIZONTAL_PADDING_PX = 8;
/** The item count's size under a grid ring's title, as a share of the ring text size. */
export const COUNT_FONT_RATIO = 0.85;
/** Baseline distance from the title's last line to the count, in count font sizes. */
const COUNT_LINE_HEIGHT_EM = 1.4;
/** Breathing room below the ring. */
const BOTTOM_BUFFER_PX = 8;
/** Ring text size as a fraction of the ring diameter. */
const FONT_RING_SIZE_RATIO = 0.075;
/** Below this the level labels stop being readable. */
const FONT_MIN_PX = 11;
/**
 * The largest ring text: `--fs-base`, the size every ring at or above the knee
 * (~213px across) renders at.
 */
export const FONT_MAX_PX = 16;

/**
 * Text size for a ring of the given diameter. The grid needs this before the ring elements
 * exist (to wrap titles), writes it onto the cells' CSS and hands the same value to each
 * ring — so both must derive it from one place.
 *
 * Ring text is sized from a CSS token and would not shrink with the ring; above ~213px
 * across this returns the token size unchanged.
 * @param {number} ringDiameter - Not the grid cell, which is larger.
 * @returns {number} In px.
 */
export function getItemRingFontSizeForRing(ringDiameter) {
    if (!Number.isFinite(ringDiameter) || ringDiameter <= 0) return FONT_MAX_PX;
    return Math.min(FONT_MAX_PX, Math.max(FONT_MIN_PX, ringDiameter * FONT_RING_SIZE_RATIO));
}

/**
 * Width a title may occupy before it wraps.
 * @param {number} chartWidth - The chart's full width.
 * @returns {number} Never negative.
 */
export function getItemRingTitleWrapWidth(chartWidth) {
    return Math.max(0, chartWidth - TITLE_HORIZONTAL_PADDING_PX * 2);
}

/**
 * A test of whether a title fits one line, measured before any ring exists, at the
 * size the grid solved for the cell (titles scale with the ring) and the weight
 * `.item-ring-svg-title` renders at.
 * @param {number} maxWidth - A non-positive width fits anything.
 * @param {{fontFamily: string, fontSize: number}} font
 * @returns {(title: string) => boolean}
 */
export function titleFitsOneLine(maxWidth, { fontFamily, fontSize }) {
    const fontWeight = fontWeightToken('bold');
    return (title) =>
        !title ||
        !(maxWidth > 0) ||
        measureTextWidth(title, {
            font: { size: fontSize, weight: fontWeight, family: fontFamily },
        }) <= maxWidth;
}

/**
 * Height the title band reserves above the ring: the title lines, then the item count's.
 * @param {number} fontSize
 * @param {number} lineCount - Title lines to reserve; `0` reserves no band at all.
 * @returns {number} In px, padding included.
 */
export function titleBandHeight(fontSize, lineCount) {
    if (!lineCount) return 0;
    return titleCountBaseline(fontSize, lineCount) + TITLE_PADDING_PX;
}

/**
 * The baseline of the item-count line, below the band's top: right under the title's
 * last line, so title and count read as one label. The band reserves it under the most
 * title lines any cell takes; a shorter title leaves the room below its count.
 * @param {number} fontSize
 * @param {number} lineCount - Title lines above the count.
 * @returns {number}
 */
export function titleCountBaseline(fontSize, lineCount) {
    const lastTitleBaseline =
        TITLE_PADDING_PX + fontSize + (lineCount - 1) * fontSize * LABEL_LINE_HEIGHT_EM;
    return lastTitleBaseline + fontSize * COUNT_FONT_RATIO * COUNT_LINE_HEIGHT_EM;
}

/**
 * Everything a ring cell must hold besides the ring circle itself: the title band and the
 * breathing room under the ring. The grid sizes its cells with this so the ring ends up
 * exactly `diameter` across; `ringFrame` is its inverse.
 * @param {number} fontSize
 * @param {number} lineCount - Title lines the cell reserves (0, 1 or 2)
 * @returns {number} In px.
 */
export function getItemRingVerticalOverhead(fontSize, lineCount) {
    return titleBandHeight(fontSize, lineCount) + BOTTOM_BUFFER_PX;
}

/**
 * Where a ring sits in the area it draws in: the largest radius whose figure (the ring
 * plus the reach of its tick icons) fits below the title band and above the breathing
 * room, centred in that space. The inverse of the cell the grid sized with
 * `getItemRingVerticalOverhead`.
 * @param {{y: number, width: number, height: number}} area - The ring's drawing area.
 * @param {number} titleSpace - The title band above the ring (`titleBandHeight`); 0 without a title.
 * @returns {{radius: number, centerY: number}} In px; `centerY` from the area's top edge, the area's `y` included.
 */
export function ringFrame(area, titleSpace) {
    const ringHeight = area.height - titleSpace - BOTTOM_BUFFER_PX;
    return {
        radius: Math.min(area.width, ringHeight) / 2 / RING_REACH,
        centerY: area.y + titleSpace + ringHeight / 2,
    };
}

/**
 * A ring's item count with its unit.
 * @param {number} count
 * @returns {string} E.g. "1 Teilaufgabe", "12 Teilaufgaben".
 */
export function itemCountText(count) {
    return `${formatCount(count)} ${count === 1 ? TERM_CONSTANTS.SUBTASK : TERM_CONSTANTS.SUBTASKS}`;
}

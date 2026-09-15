/**
 * Column Width Constants
 *
 * Standardized configuration for responsive Tabulator column widths.
 * Uses widthGrow ratios with auto-calculated minWidth from header titles.
 *
 * Visual columns (progress bars, charts) have fixed minWidth values since
 * their content is graphical rather than text-based.
 */

import { resolveCssLengthToPx } from '@tba3/module-base/utils/textMeasurement.js';

// ============================================================================
// VISUAL COLUMN MINIMUM WIDTHS
// ============================================================================

/**
 * Fixed minimum widths for visual/graphical columns
 * These don't depend on text content and need specific minimum space to render properly
 */
export const VISUAL_COLUMN_MIN_WIDTHS = {
    /** Stacked progress bar showing correct/incorrect/not attempted */
    progressBar: 104,
    /**
     * "Nr." cell: preview trigger, gap and an unwrapped "H-1.1", plus the data-tree
     * indent of a child row (createItemNumberColumn; the title alone sizes it too narrow).
     */
    itemNumber: 120,
    /** Result icon (check/x/block) */
    resultIcon: 50,
    /** Gender sub-column (M/W/D) - minimum width for narrow columns */
    genderSubColumn: 64,
    /** Trait sub-column (Kw/F/S/etc.) - minimum width for narrow columns */
    traitSubColumn: 64,
};

// ============================================================================
// HEADER PADDING CONFIGURATION
// ============================================================================

/**
 * Inline sort indicator: a 1em Material glyph at the header's --fs-sm
 * (internal/tabulatorIcons.js, table-base.css). Resolved per call like the padding
 * below, since the token is rem with a 12px floor.
 * @returns {number} The glyph's width in px.
 */
function sortIndicatorWidth() {
    return Math.max(12, resolveCssLengthToPx('0.8125rem', 13));
}

/** Canvas measureText lands up to a pixel under real layout. */
const MEASUREMENT_SLACK = 2;

/**
 * Non-text width of a column header, added to the measured title width when
 * calculating minWidth. Must stay in step with the header CSS
 * (src/styles/), otherwise titles wrap mid-word inside
 * columns that are exactly as wide as their own minWidth:
 *   0.5rem x 2  .tabulator-col horizontal padding (table-base.css)
 *   0.25rem     title/sorter gap (--control-gap, table-header-layout.css)
 *   1em (--fs-sm) sort glyph — only when the column renders one
 *
 * Resolved per call rather than frozen as a px constant: those CSS lengths are
 * rem, and the root font-size is fluid (clamp, responsive.css), so the real
 * chrome is ~28px on a narrow viewport and ~35px on a wide one.
 * @param {boolean} hasSortIndicator - Whether the column renders a sort arrow
 *   (Tabulator only builds one when `headerSort !== false`).
 * @returns {number} Non-text header width in px, resolved against the current root font size.
 */
export function headerChromeWidth(hasSortIndicator) {
    const columnPadding = 2 * resolveCssLengthToPx('0.5rem', 8);
    const sorter = hasSortIndicator ? resolveCssLengthToPx('0.25rem', 4) + sortIndicatorWidth() : 0;

    return Math.ceil(columnPadding + sorter + MEASUREMENT_SLACK);
}

/**
 * Typography a column title is actually rendered with (.tabulator-col-title in
 * table-base.css), for measureHeaderWidth. Measuring at the wrong weight or
 * without the tracking underestimates a title by several pixels, which shows up
 * as a header breaking mid-word inside a column sized to its own minWidth.
 */
export const HEADER_TITLE_FONT = {
    fontWeight: '600' /* --fw-semibold */,
    letterSpacing: '0',
};

// ============================================================================
// WIDTH GROW RATIOS
// ============================================================================

/**
 * Standard widthGrow ratios for different column types
 * Higher values = column gets more of the available space
 *
 * With fitColumns layout, remaining space after minWidths is distributed
 * proportionally based on widthGrow values.
 *
 * Example: If 3 columns have widthGrow of 1, 2, 3, they get 1/6, 2/6, 3/6
 * of the remaining space respectively.
 */
export const COLUMN_GROW_RATIOS = {
    /** ID columns - minimal growth */
    id: 1,
    /** Short text columns */
    text: 1,
    /** Name columns - moderate growth */
    name: 2,
    /** Long name columns - more growth */
    nameLong: 3,
    /** Task/item description columns */
    description: 3,
    /** Progress bar columns - significant growth */
    progressBar: 4,
    /** KS/Level columns - minimal growth */
    ks: 2,
    /** Level columns (same as ks) */
    level: 2,
    /** Percentage number columns */
    percentage: 1,
    /** Gender columns */
    gender: 1,
    /** Traits column (plural - larger) */
    traits: 2,
    /** Domain columns */
    domain: 2,
    /** Style columns */
    style: 2,
    /** GER level columns */
    gerLevel: 1,
    /** Result columns (Richtig/count) */
    result: 2,
    /** Count columns (Anzahl) */
    count: 1,
};

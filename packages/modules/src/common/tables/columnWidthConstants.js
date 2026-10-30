/**
 * Tabulator column widths: widthGrow ratios over a minWidth auto-derived from the
 * header title, and fixed minimum widths for the visual columns.
 */

/** Fixed minimum widths of the visual columns, whose content is no text to measure. */
export const VISUAL_COLUMN_MIN_WIDTHS = {
    progressBar: 104,
    /**
     * "Nr." cell: preview trigger, gap and an unwrapped "H-1.1" (createItemNumberColumn;
     * the title alone sizes it too narrow).
     */
    itemNumber: 100,
};

/**
 * Height of a table bar, for the SVG box-plot cell that sits beside the DOM bars:
 * those take it from `--stacked-bar-height` (stacked-bar.css), which this mirrors. Kept
 * below --table-row-content-min so the bar sits within the shared row-content floor
 * that also governs trait cells.
 */
export const TABLE_BAR_HEIGHT_PX = 18;

/**
 * The widthGrow tiers. The fitColumns layout shares the whole table width out in
 * proportion to widthGrow (1, 2, 3 get 1/6, 2/6, 3/6); a column whose share falls
 * below its minWidth is held there, and the rest is shared out again; a fixed-width
 * column (`tableMeta.fitContent`) takes no share. Tabulator reads a widthGrow of 0 as 1.
 */
export const COLUMN_GROW_RATIOS = {
    /** Ids, numbers, counts, short text */
    narrow: 1,
    /** Names, levels, traits, domains */
    medium: 2,
    /** Long names and exercise names */
    wide: 3,
    /** The progress bars */
    bar: 4,
};

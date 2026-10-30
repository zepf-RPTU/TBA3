/**
 * Header geometry of a TableModule's Tabulator table: the column `minWidth` floors
 * derived from header titles, kept correct (with Tabulator's pinned header heights)
 * across viewport resizes and hidden/shown transitions. Everything it measures is
 * relative (rem title font, rem header chrome), so a floor is only right at the root
 * font size it was measured at and is re-derived when the inputs move.
 */

import { measureTextWidth, probeRootLengthPx, rootFontSizePx } from '@tba3/module-base';
import { fontFamilyToken, fontWeightToken } from '../../utils/fontTokens.js';

/** Canvas measureText lands up to a pixel under real layout. */
const MEASUREMENT_SLACK_PX = 2;

/**
 * Non-text width of a column header, added to the measured title width for the
 * minWidth (a title would otherwise wrap mid-word in a column at its minWidth):
 *   2 x --table-cell-padding-inline   the header's inline padding (table-base.css)
 *   for a sortable column, the indicator beside the title:
 *     --control-gap                   title/sorter gap
 *     1em (--fs-sm)                   sort glyph
 * @param {boolean} sortable - Whether the header shows a sort indicator.
 * @param {HeaderChrome} chrome - The header's font size, inline padding and gap in px.
 * @returns {number} In px.
 */
function headerChromeWidth(sortable, { fontSize, paddingInline, gap }) {
    const sorter = sortable ? gap + fontSize : 0;
    return Math.ceil(2 * paddingInline + sorter + MEASUREMENT_SLACK_PX);
}

/**
 * A column whose `minWidth` a floor pass derived from its header title. Kept per
 * table so the floor can be re-derived when the root font size moves: the floor is
 * `text` measured with its chrome, but never below `minimum`. `text` is the whole
 * title for a column that left its floor to the pass, and the title's longest word
 * for one that set its own `minWidth` (which becomes `minimum`). `bold` when `text` is a
 * sort-step label, which the header paints at `--fw-bold` while its step is in force.
 * @typedef {{field: string, text: string, bold: boolean, sortable: boolean, minimum: number}} HeaderSizedColumn
 */

/**
 * @typedef {object} TableGeometryRecord
 * @property {GeometryTable} table
 * @property {HTMLElement} container - The element Tabulator was mounted on
 * @property {() => void} unobserve - Releases the container's resize observation and the root font size subscription
 * @property {number} rootFontSize - Root font size the recorded floors were last measured at
 * @property {HeaderSizedColumn[]} columns - The header-sized columns of the last floor pass
 * @property {{width: number, rootFontSize: number}} lastRealign - Geometry the headers were last realigned against
 */

/**
 * Debounce for the post-resize header realign, which has to land after Tabulator's
 * own autoResize redraw (see TableHeaderGeometry#attach).
 */
const RESIZE_REALIGN_DEBOUNCE_MS = 150;

/**
 * The header's non-text lengths in px, read from the tokens the header CSS uses.
 * @typedef {{fontSize: number, paddingInline: number, gap: number}} HeaderChrome
 */

/**
 * What a header title is measured with, resolved once per pass, not per column. The
 * title font is the header's own: `--fs-sm` (a `max()` of rem and px, so probed, not
 * parsed), `--fw-semibold` and the page family; `boldFont` is the same at `--fw-bold`,
 * the weight of an active sort-step label (progressBarColumn.css). The chrome lengths are rem, so they
 * are probed too, once per root font size.
 * @typedef {{font: import('@tba3/module-base').MeasureFont, boldFont: import('@tba3/module-base').MeasureFont, chrome: HeaderChrome}} HeaderMetrics
 * @param {number} rootFontSize - The root font size in force, in px.
 * @returns {HeaderMetrics}
 */
function resolveHeaderMetrics(rootFontSize) {
    const fontSize = probeRootLengthPx('var(--fs-sm, 12px)', rootFontSize);
    const font = {
        size: fontSize,
        weight: fontWeightToken('semibold'),
        family: fontFamilyToken(),
    };
    const chrome = {
        fontSize,
        paddingInline: probeRootLengthPx('var(--table-cell-padding-inline, 0.5rem)', rootFontSize),
        gap: probeRootLengthPx('var(--control-gap, 0.25rem)', rootFontSize),
    };
    return { font, boldFont: { ...font, weight: fontWeightToken('bold') }, chrome };
}

/**
 * A text a header floor may be sized by, and whether the header paints it bold.
 * @typedef {{text: string, bold: boolean}} FloorCandidate
 */

/**
 * The px width a header text needs at the current root font size, chrome included.
 * @param {FloorCandidate} candidate
 * @param {boolean} sortable - Whether the header shows a sort indicator.
 * @param {HeaderMetrics} metrics
 * @returns {number} In px.
 */
function measureHeaderFloor(candidate, sortable, metrics) {
    return measureTextWidth(candidate.text, {
        font: fontOf(candidate, metrics),
        padding: headerChromeWidth(sortable, metrics.chrome),
    });
}

/**
 * The font a candidate is painted in.
 * @param {FloorCandidate} candidate
 * @param {HeaderMetrics} metrics
 * @returns {import('@tba3/module-base').MeasureFont}
 */
function fontOf({ bold }, { font, boldFont }) {
    return bold ? boldFont : font;
}

/**
 * The candidate that needs the most width in the header font.
 * @param {ReadonlyArray<FloorCandidate>} candidates
 * @param {HeaderMetrics} metrics
 * @returns {FloorCandidate} The earliest on a tie.
 */
function widestText(candidates, metrics) {
    let widest = { text: '', bold: false };
    let widestWidth = -1;
    for (const candidate of candidates) {
        const width = measureTextWidth(candidate.text, {
            font: fontOf(candidate, metrics),
            padding: 0,
        });
        if (width > widestWidth) {
            widest = candidate;
            widestWidth = width;
        }
    }
    return widest;
}

/**
 * Texts as floor candidates at one weight.
 * @param {ReadonlyArray<string>} texts
 * @param {boolean} bold
 * @returns {FloorCandidate[]}
 */
function candidatesOf(texts, bold) {
    return texts.map((text) => ({ text, bold }));
}

/**
 * The distinct words of some texts: the units a header may wrap between but never
 * inside. Each is measured once, however many cells repeat it. Only the white space
 * CSS breaks at separates them: a no-break space (`62,1 %`) holds its word together.
 * @param {ReadonlyArray<string>} texts
 * @returns {string[]}
 */
function wordsOf(texts) {
    return [...new Set(texts.flatMap((text) => text.split(/[ \t\n\r\f]+/)))];
}

/**
 * The floor of one recorded column at the current metrics.
 * @param {Omit<HeaderSizedColumn, 'field'>} entry
 * @param {HeaderMetrics} metrics
 * @returns {number} Its minWidth in px.
 */
function recordedFloor(entry, metrics) {
    return Math.max(entry.minimum, measureHeaderFloor(entry, entry.sortable, metrics));
}

/**
 * One derivation pass over column definitions (a `processColumnDefinitions` run). For
 * every titled column, `apply` does one of two things (no table column sets a fixed
 * `width`):
 * - without a `minWidth`, it derives one from the whole title on one line, or from
 *   the widest word of the column's labels when that is wider;
 * - a `minWidth` the caller set (a bar column, which needs room for the bar) is kept,
 *   but raised to the widest word of the title and of its labels, since a header may
 *   wrap between words and never inside one.
 * A `tableMeta.fitContent` column also gets that floor as its fixed `width`.
 *
 * The labels are the words the column must fit unbroken beside its title: the texts
 * its cells show, measured in the header font, which is no narrower than the cell's,
 * and the sort-step labels, measured bold, as the header paints the step in force.
 *
 * Fielded columns with a derived or raised floor are collected in `headerSized`, so
 * the floor can be re-derived later (TableHeaderGeometry#refresh). Fieldless
 * columns cannot be looked up on the live table, so they keep their build-time floor.
 * @returns {{apply(columnDef: import('../columnFactories.js').TableColumnDefinition, sortable: boolean, words?: {cellWords?: ReadonlyArray<string>, sortLabels?: ReadonlyArray<string>}): void, headerSized: HeaderSizedColumn[]}} An `apply` to run over each column definition (whether its header sorts, its cell words and its sort-step labels), and the fielded columns whose floor can be re-derived later.
 */
export function createHeaderFloorPass() {
    const headerMetrics = resolveHeaderMetrics(rootFontSizePx());
    /** @type {HeaderSizedColumn[]} */
    const headerSized = [];

    return {
        headerSized,
        apply(columnDef, sortable, { cellWords = [], sortLabels = [] } = {}) {
            if (!columnDef.title) return;

            const minimum = columnDef.minWidth ?? 0;
            const title =
                columnDef.minWidth === undefined ? [columnDef.title] : wordsOf([columnDef.title]);
            const widest = widestText(
                [
                    ...candidatesOf(title, false),
                    ...candidatesOf(wordsOf(cellWords), false),
                    ...candidatesOf(wordsOf(sortLabels), true),
                ],
                headerMetrics,
            );
            const entry = { ...widest, sortable, minimum };
            columnDef.minWidth = recordedFloor(entry, headerMetrics);
            if (columnDef.tableMeta?.fitContent) columnDef.width = columnDef.minWidth;
            if (columnDef.field) headerSized.push({ field: columnDef.field, ...entry });
        },
    };
}

/**
 * What the geometry reads of a table: its lifecycle flags, its redraw, the destroy event,
 * and each live column's internal floor (`_getSelf()`, see `#refresh`).
 * @typedef {object} GeometryTable
 * @property {boolean} initialized - Whether `tableBuilt` has fired.
 * @property {boolean} destroyed
 * @property {(force?: boolean) => void} redraw
 * @property {(event: 'tableDestroyed', callback: () => void) => void} on
 * @property {() => Array<{getField(): string, getDefinition(): import('tabulator-tables').ColumnDefinition, _getSelf(): ReturnType<import('tabulator-tables').ColumnComponent['_getSelf']>}>} getColumns
 */

export class TableHeaderGeometry {
    /**
     * The module's one table, or null between a destroy and the next build.
     * @type {TableGeometryRecord|null}
     */
    #current = null;
    /** @type {import('@tba3/module-base').ResizeObserving} */
    #resizeService;

    /**
     * @param {import('@tba3/module-base').ResizeObserving} resizeService - The owning
     *   module's resize service.
     */
    constructor(resizeService) {
        this.#resizeService = resizeService;
    }

    /**
     * Take over a freshly built table: its header-derived column sizes, and the
     * re-alignment of its column headers once its container has finished resizing.
     * Released on `tableDestroyed`, which every table goes through; otherwise the
     * resize callback would keep the dead instance and its detached DOM reachable
     * from the resizeService singleton.
     *
     * Tabulator measures header heights before it re-lays out the columns:
     * `ColumnManager.redraw()` calls `verticalAlignHeaders()`, which pins the
     * tallest header's height as an inline style on `.tabulator-headers` and every
     * `.tabulator-col`, and only then calls `layoutRefresh()` to assign the new
     * `fitColumns` widths. Because the headers wrap (`white-space: normal`,
     * `@tba3/modules/styles/table-header-layout.css`), that measurement wraps the
     * titles at the stale column widths. A title that wraps in that
     * transient state pins an extra line of height that nothing clears: the same
     * window size renders a different header height depending on which width it was
     * resized from.
     *
     * Tabulator's own autoResize redraw leaves the stale value behind, so the
     * correction comes after it: hence the debounce, and the observation here, not
     * through Tabulator's ResizeObserver.
     *
     * The redraw is not forced: `table.redraw(true)` calls
     * `rowManager.resetScroll()`, which would jump every table to the top on each
     * window resize. A non-forced redraw re-runs `verticalAlignHeaders()` against
     * the settled widths and is idempotent.
     * @param {GeometryTable} table
     * @param {HTMLElement} container - The element Tabulator was mounted on
     * @param {HeaderSizedColumn[]} headerSized - The `headerSized` half of the build's floor pass
     */
    attach(table, container, headerSized) {
        this.#release();
        const rootFontSize = rootFontSizePx();
        /** @type {TableGeometryRecord} */
        const record = {
            table,
            container,
            unobserve: () => {},
            rootFontSize,
            columns: headerSized,
            // The geometry the table was just laid out at. observe() always delivers
            // one initial entry, which without this seed would cost a redraw per
            // table build.
            lastRealign: { width: container.offsetWidth, rootFontSize },
        };
        this.#current = record;
        table.on('tableDestroyed', () => {
            if (this.#current === record) this.#release();
        });
        record.unobserve = this.#resizeService.observe(
            container,
            {
                measure: () => this.#realignDue(record),
                draw: () => this.#realign(record),
            },
            // Busy from the resize until the realign has drawn, as a chart is: the
            // header heights in between are the stale ones.
            { debounceMs: RESIZE_REALIGN_DEBOUNCE_MS, busy: true },
        );
    }

    /**
     * Replace the header-derived column sizes after an in-place column swap: the new
     * definitions carry new auto-derived floors.
     * @param {GeometryTable} table - The attached table
     * @param {HeaderSizedColumn[]} headerSized - The `headerSized` half of that pass's result
     */
    register(table, headerSized) {
        const record = this.#current;
        if (record?.table !== table) return;
        record.rootFontSize = rootFontSizePx();
        record.columns = headerSized;
    }

    /**
     * Re-derive the header floors of the attached table. A table still building is
     * skipped: it measures its own floors from the current font size as part of the
     * build.
     */
    refresh() {
        const record = this.#current;
        if (!record || record.table.destroyed || !record.table.initialized) return;
        this.#refresh(record, rootFontSizePx());
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    #release() {
        this.#current?.unobserve();
        this.#current = null;
    }

    /**
     * Whether a resize calls for a realign, read before anything of the same flush
     * draws. See attach() for why the realign exists.
     * @param {TableGeometryRecord} record
     * @returns {boolean} True when the width or the root font size moved.
     */
    #realignDue(record) {
        const { table, container } = record;
        if (table.destroyed) return false;

        // Tabulator's own initGuard() only warns and then runs the redraw anyway,
        // against half-built managers, and a resize can land inside the build
        // window (the debounce is shorter than a slow first paint).
        if (!table.initialized) return false;

        // A zero-size container means the table is in a hidden view. Tabulator
        // skips verticalAlignHeaders() while the header is not visible, and
        // _onShow() redraws the table.
        if (container.offsetWidth === 0 || container.offsetHeight === 0) return false;

        // Only the width and the root font size can invalidate the pinned
        // header heights or the header-derived floors. A height-only resize (a
        // chart above the table reflowing, a section collapsing, rows being added)
        // cannot, and a redraw on one would re-enter this observer through the
        // height it changes.
        const width = container.offsetWidth;
        const rootFontSize = rootFontSizePx();
        const lastRealign = record.lastRealign;
        if (lastRealign.width === width && lastRealign.rootFontSize === rootFontSize) {
            return false;
        }
        record.lastRealign = { width, rootFontSize };
        return true;
    }

    /**
     * The realign itself, at the geometry `#realignDue` just recorded.
     * @param {TableGeometryRecord} record
     */
    #realign(record) {
        const { table } = record;

        // Before the redraw, so the layout pass it triggers already sees the new
        // floors.
        const floorsChanged = this.#refresh(record, record.lastRealign.rootFontSize);

        table.redraw(false);

        // A changed floor redistributes width across every column, and
        // ColumnManager.redraw() pins the header heights in verticalAlignHeaders()
        // before layoutRefresh() applies that redistribution, so the pass above
        // measured the headers against the widths before it. The columns whose
        // titles wrap (those pinning an explicit minWidth) are
        // the ones a floor change squeezes, so a second pass follows.
        if (floorsChanged) table.redraw(false);
    }

    /**
     * Re-derive the header-based column floors against the current root font size
     * and push the changed ones onto the live columns.
     *
     * A minWidth the caller supplied stays the lower bound: only the widest word
     * of its title can raise it.
     *
     * A `fitContent` column's fixed width follows its floor: on the live column, and
     * in its definition, which the fitColumns layout reads on the next redraw.
     *
     * `Column.setMinWidth()`/`setWidth()` are Tabulator-internal, reached through
     * the component's `_getSelf()`: the public `updateDefinition()` replaces the
     * column (add + delete), losing cell state, sort and selection, and is async. A
     * Tabulator upgrade that drops them throws here.
     * @param {TableGeometryRecord} record
     * @param {number} rootFontSize - In px.
     * @returns {boolean} True when at least one floor changed, i.e. the layout is
     *   about to redistribute width (see #realign).
     */
    #refresh(record, rootFontSize) {
        if (record.columns.length === 0) return false;

        // Every input to the measurement scales with the root font size.
        if (rootFontSize === record.rootFontSize) return false;

        const columnsByField = new Map(
            record.table.getColumns().map((component) => [component.getField(), component]),
        );

        const headerMetrics = resolveHeaderMetrics(rootFontSize);

        let changed = false;
        for (const entry of record.columns) {
            const component = columnsByField.get(entry.field);
            if (!component) continue;

            const column = component._getSelf();

            const floor = recordedFloor(entry, headerMetrics);

            if (floor === column.minWidth) continue;
            column.setMinWidth(floor);
            // Only a fitContent column is recorded with a fixed width (apply).
            const definition = component.getDefinition();
            if (definition.width !== undefined) {
                definition.width = floor;
                column.setWidth(floor);
            }
            changed = true;
        }

        // Only once the pass has completed: a pass that threw runs again at this
        // font size, which the guard above would otherwise skip.
        record.rootFontSize = rootFontSize;
        return changed;
    }
}

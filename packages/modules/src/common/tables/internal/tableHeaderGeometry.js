/**
 * Header geometry of a module's Tabulator tables.
 *
 * A collaborator the TableModule *has*, not *is*. It owns one physical concern:
 * the column `minWidth` floors derived from header titles, and keeping them —
 * plus Tabulator's pinned header heights — correct across viewport resizes and
 * hidden/shown transitions. Everything it measures is relative (rem title font,
 * rem header chrome, a fluid root font size), so a floor is only right at the
 * viewport it was measured at; this class re-derives them when the inputs move.
 *
 * Per-table state lives in one record per table (container, header-derived
 * floors and the font size they were measured at, last realign geometry), so a
 * multi-table module (see SlBaseTableModule) keeps its tables apart. The module
 * owns one instance and the records are keyed by table — this map is also the
 * module's only registry of live tables.
 *
 * Owner-specific state is injected as thin accessors: the DI-resolved resize
 * service and scope id (observations must be released by the owner's
 * removeByScope), whether the owner was destroyed, and a label for the latched
 * Tabulator-API warning.
 */

import { measureHeaderWidth, rootFontSizePx } from '@tba3/module-base/utils/textMeasurement.js';
import { headerChromeWidth, HEADER_TITLE_FONT } from '../columnWidthConstants.js';

/**
 * A column whose `minWidth` a floor pass derived from its header title. Kept per
 * table so the floor can be re-derived when the root font size moves.
 * @typedef {{field: string, title: string, hasSorter: boolean}} HeaderSizedColumn
 */

/**
 * @typedef {object} TableGeometryRecord
 * @property {HTMLElement|null} container - The element Tabulator was mounted on (set by observe())
 * @property {number} rootFontSize - Root font size the recorded floors were last measured at
 * @property {HeaderSizedColumn[]} columns - The header-sized columns of the last floor pass
 * @property {{width: number, rootFontSize: number}|null} lastRealign - Geometry the headers were last realigned against
 */

/**
 * Debounce for the post-resize header realign. Tabulator's own autoResize
 * redraw is the pass that leaves stale header heights behind, so the correction
 * has to land after it — see TableHeaderGeometry#observe.
 */
const RESIZE_REALIGN_DEBOUNCE_MS = 150;

/**
 * Header chrome for both column shapes, resolved once per pass rather than per
 * column: headerChromeWidth reads the root font size out of the live computed
 * style, and that cannot change while a synchronous pass runs.
 * @returns {{sorted: number, plain: number}} Chrome width in px for a sortable and a plain header, resolved once per pass.
 */
function resolveHeaderChrome() {
    return { sorted: headerChromeWidth(true), plain: headerChromeWidth(false) };
}

/**
 * The one measurement the whole subsystem is built on: the px width a header
 * title needs at the current root font size, chrome included.
 * @param {string} title - The header text to measure.
 * @param {boolean} hasSorter - Whether the column renders a sort indicator
 * @param {{sorted: number, plain: number}} headerChrome - Chrome widths from `resolveHeaderChrome`.
 * @returns {number} The px width the header needs at the current root font size, chrome included.
 */
function measureHeaderFloor(title, hasSorter, headerChrome) {
    return measureHeaderWidth(title, {
        padding: hasSorter ? headerChrome.sorted : headerChrome.plain,
        ...HEADER_TITLE_FONT,
    });
}

/**
 * One derivation pass over column definitions (a TableModule#processColumns
 * run). For every titled column, `apply` either validates a fixed `width`
 * against the header text (bumping it, with a warning, when too narrow) or
 * auto-derives `minWidth` from the title when the caller supplied neither —
 * a minWidth the caller supplied is their decision and stays put.
 *
 * Fielded auto-sized columns are collected in `headerSized` so their floor can
 * be re-derived later (TableHeaderGeometry#register). Fieldless columns cannot
 * be looked up on the live table, so they keep their build-time floor.
 * @returns {{apply(columnDef: object): void, headerSized: HeaderSizedColumn[]}} An `apply` to run over each column definition, and the fielded columns whose floor can be re-derived later.
 */
export function createHeaderFloorPass() {
    const headerChrome = resolveHeaderChrome();
    /** @type {HeaderSizedColumn[]} */
    const headerSized = [];

    return {
        headerSized,
        apply(columnDef) {
            if (!columnDef.title) return;

            // Same predicate as Tabulator's sorter rendering; read before any
            // headerSort default is applied by the caller.
            const hasSorter = columnDef.headerSort !== false;
            const measuredWidth = measureHeaderFloor(columnDef.title, hasSorter, headerChrome);

            if (columnDef.width !== undefined) {
                // Fixed-width column: validate that width can fit the header text
                if (columnDef.width < measuredWidth) {
                    console.warn(
                        `Column "${columnDef.title}": fixed width ${columnDef.width}px is smaller than header text needs (${measuredWidth}px). Bumping to ${measuredWidth}px.`,
                    );
                    columnDef.width = measuredWidth;
                }
            } else if (columnDef.minWidth === undefined) {
                // No fixed width and no explicit minWidth: auto-calculate from header text.
                columnDef.minWidth = measuredWidth;

                if (columnDef.field) {
                    headerSized.push({ field: columnDef.field, title: columnDef.title, hasSorter });
                }
            }
        },
    };
}

export class TableHeaderGeometry {
    /** @type {Map<any, TableGeometryRecord>} */
    #records = new Map();
    /** Latches the Tabulator-API warning in #refresh to one per owner. */
    #apiWarned = false;
    /** @type {typeof import('@tba3/module-base/services/resizeService.js').resizeService} */
    #resizeService;
    /** @type {string} */
    #scopeId;

    /**
     * @param {object} deps - The resize service to observe through, and the scope its observations are tied to.
     * @param {typeof import('@tba3/module-base/services/resizeService.js').resizeService} deps.resizeService -
     *   The owner's DI-resolved resize service, not the imported singleton:
     *   BaseModule.destroy() calls removeByScope on that one only.
     * @param {string} deps.scopeId - Owner module id; ties every observation to its lifetime
     */
    constructor({ resizeService, scopeId }) {
        this.#resizeService = resizeService;
        this.#scopeId = scopeId;
    }

    /**
     * Hand the header-derived column sizes of a floor pass to `table`. Called on
     * build and again on an in-place column swap (the new definitions carry new
     * auto-derived floors, replacing the old record).
     * @param {any} table - Tabulator instance
     * @param {HeaderSizedColumn[]} headerSized - The `headerSized` half of that pass's result
     */
    register(table, headerSized) {
        if (!table) return;

        const record = this.#recordFor(table);
        record.rootFontSize = rootFontSizePx();
        record.columns = headerSized;
    }

    /**
     * Re-align the column headers once the container has finished resizing.
     *
     * Tabulator measures header heights BEFORE it re-lays out the columns:
     * `ColumnManager.redraw()` calls `verticalAlignHeaders()` — which pins the
     * tallest header's height as an inline style on `.tabulator-headers` and every
     * `.tabulator-col` — and only then calls `layoutRefresh()` to assign the new
     * `fitColumns` widths. Because our headers wrap (`white-space: normal`, see
     * `@tba3/modules/styles/table-header-layout.css`) and the root
     * font-size is fluid (`clamp()`, see src/styles/foundation/responsive.css),
     * that measurement pass sees the NEW font size inside the OLD column widths.
     * A title that wraps in that transient state pins an extra line of height that
     * nothing ever clears, so the header keeps a height belonging to the previous
     * viewport width: the same window size renders a different header height
     * depending on which width it was resized from.
     *
     * Tabulator's own autoResize redraw is the pass that leaves the stale value
     * behind, so the correction has to come after it — hence the debounce, and
     * hence observing here rather than relying on Tabulator's ResizeObserver.
     *
     * The redraw is deliberately NOT forced: `table.redraw(true)` calls
     * `rowManager.resetScroll()`, which would jump every table to the top on each
     * window resize. A non-forced redraw re-runs `verticalAlignHeaders()` against
     * the settled widths — which is the whole fix — and is idempotent.
     *
     * Observed per table rather than per module: a multi-table module (see
     * SlBaseTableModule) calls createTable() once per instance and only
     * the last one is `this.table`, so the realign has to be bound to the table
     * that owns the resized container.
     * @param {any} table - The table mounted on that element
     * @param {HTMLElement} tableContainer - The element Tabulator was mounted on
     */
    observe(table, tableContainer) {
        if (!tableContainer || !table) return;

        // Every createTable() mounts a brand-new .table-container, so drop the
        // registrations whose container has since left the DOM — otherwise a
        // module that rebuilds its table (class switch, mode switch) accumulates
        // one dead observation per rebuild. Scope-wide cleanup is not an option:
        // the sibling tables of a multi-table module share this scopeId.
        for (const [observed, record] of this.#records) {
            if (record.container && !record.container.isConnected) this.#untrack(observed);
        }

        const record = this.#recordFor(table);
        record.container = tableContainer;
        // The realign geometry the table was just laid out at. observe() always
        // delivers one initial entry, and without this seed that entry would cost
        // an extra full redraw per table build, ~150ms after the view settled.
        record.lastRealign = {
            width: tableContainer.offsetWidth,
            rootFontSize: rootFontSizePx(),
        };

        // scopeId ties the observation to the owner's lifetime: BaseModule's
        // destroy() calls resizeService.removeByScope(id).
        this.#resizeService.observe(tableContainer, () => this.#realignAfterResize(table), {
            scopeId: this.#scopeId,
            debounceMs: RESIZE_REALIGN_DEBOUNCE_MS,
        });
    }

    /**
     * Re-derive the header floors of every table this owner currently has.
     *
     * The root font size is a property of the viewport, so the floors of a
     * multi-table module's tables all go stale together — refreshing only the
     * most recently created table would leave the siblings at their build-time
     * values.
     *
     * Tables still building are skipped: they measure their own floors from the
     * current font size as part of the build.
     * @returns {boolean} True when at least one floor on any table changed.
     */
    refreshAll() {
        let changed = false;
        const rootFontSize = rootFontSizePx();
        for (const table of this.#records.keys()) {
            if (table.destroyed || !table.initialized) continue;
            if (this.#refresh(table, rootFontSize)) changed = true;
        }
        return changed;
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * The record for `table`, created empty on first sight. `rootFontSize` is
     * seeded by register(); until then the record has no columns and #refresh
     * never reads it.
     *
     * The isConnected sweep in observe() only runs on the next observe(), so on
     * its own it would let a torn-down table linger: clear() and
     * _destroyActiveTables() destroy the Tabulator instance and detach the
     * container without building a replacement, and safeReplaceData()'s recovery
     * path destroys the table outright. Until something re-observed, the resize
     * callback would keep the dead instance and its detached DOM reachable from
     * the resizeService singleton. Tabulator dispatches `tableDestroyed` at the
     * end of destroy(), which covers all three — hooked here, on first sight,
     * so a table that was registered but never observed is released too.
     * @param {any} table - The Tabulator instance the record belongs to.
     * @returns {TableGeometryRecord} Its record, created empty on first sight and hooked to release on `tableDestroyed`.
     */
    #recordFor(table) {
        let record = this.#records.get(table);
        if (!record) {
            record = { container: null, rootFontSize: 0, columns: [], lastRealign: null };
            this.#records.set(table, record);
            table.on('tableDestroyed', () => this.#untrack(table));
        }
        return record;
    }

    /**
     * Release one table's resize observation and forget its record.
     * @param {any} table - The Tabulator instance the record belongs to.
     */
    #untrack(table) {
        const record = this.#records.get(table);
        if (record?.container) this.#resizeService.unobserve(record.container);
        this.#records.delete(table);
    }

    /**
     * The realign itself. See observe() for why it exists.
     * @param {any} table - The Tabulator instance the record belongs to.
     */
    #realignAfterResize(table) {
        if (table.destroyed) return;

        const record = this.#records.get(table);
        if (!record?.container) return;
        const tableContainer = record.container;

        // Tabulator's own initGuard() only warns and then runs the redraw anyway,
        // against half-built managers. A resize inside the build window (the
        // debounce is shorter than a slow first paint) would land exactly there.
        if (!table.initialized) return;

        // A zero-size container means the table is in a hidden view. Tabulator
        // skips verticalAlignHeaders() while the header is not visible, so the
        // realign would be a no-op; show() redraws the table anyway.
        if (tableContainer.offsetWidth === 0 || tableContainer.offsetHeight === 0) return;

        // Width and the fluid root font size are the only inputs that can
        // invalidate the pinned header heights or the header-derived floors. A
        // height-only resize — a chart above the table reflowing, a section
        // collapsing, rows being added — cannot, and redrawing on one both wastes
        // a layout pass and re-enters this observer through the height it changes.
        const width = tableContainer.offsetWidth;
        const rootFontSize = rootFontSizePx();
        const lastRealign = record.lastRealign;
        if (
            lastRealign &&
            lastRealign.width === width &&
            lastRealign.rootFontSize === rootFontSize
        ) {
            return;
        }
        record.lastRealign = { width, rootFontSize };

        // Before the redraw, so the layout pass it triggers already sees the new
        // floors.
        const floorsChanged = this.#refresh(table, rootFontSize);

        table.redraw(false);

        // A changed floor redistributes width across *every* column, and
        // ColumnManager.redraw() pins the header heights in verticalAlignHeaders()
        // BEFORE layoutRefresh() applies that redistribution — so the pass above
        // measured the headers against the pre-redistribution widths. The columns
        // whose titles actually wrap are the ones pinning an explicit minWidth
        // (e.g. the 104px progress-bar columns), and those are exactly the ones a
        // floor change squeezes; without a second pass they keep a height
        // belonging to the previous layout, which is the staleness this realign
        // exists to remove. The second redraw is a no-op when nothing moved, and
        // is skipped entirely when no floor changed.
        if (floorsChanged) table.redraw(false);
    }

    /**
     * Re-derive the header-based column floors against the current root font size
     * and push the changed ones onto the live columns.
     *
     * These floors are px numbers, but everything they are measured from is
     * relative: the title is rendered at a rem font size and the header chrome is
     * rem padding, both resolved against a root font size that is fluid across the
     * viewport (see rootFontSizePx). Measured once at build time, a floor is ~18%
     * too small after a 900px → 1900px resize, and a column sized to its own stale
     * floor wraps its header mid-word.
     *
     * Only the auto `minWidth` a floor pass derived itself is re-derived; a
     * minWidth the caller supplied is their decision and is never touched.
     *
     * `Column.setMinWidth()` is Tabulator-internal, reached through the component's
     * `_getSelf()`. It is the only non-destructive way in: the public
     * `updateDefinition()` replaces the column (add + delete), losing cell state,
     * sort and selection, and is async. A missing method is reported rather than
     * silently skipped so a Tabulator upgrade cannot quietly disable this.
     * @param {any} table - The Tabulator instance the record belongs to.
     * @param {number} rootFontSize - Current root font size in px (a viewport
     *   property, so callers resolve it once per pass rather than per table)
     * @returns {boolean} True when at least one floor changed, i.e. the layout is
     *   about to redistribute width (see #realignAfterResize).
     */
    #refresh(table, rootFontSize) {
        const record = this.#records.get(table);
        if (!record || record.columns.length === 0) return false;

        // Every input to the measurement scales with this, so nothing can have
        // changed while it holds still.
        if (rootFontSize === record.rootFontSize) return false;

        if (typeof table.getColumns !== 'function') return false;
        const columnsByField = new Map();
        for (const component of table.getColumns()) {
            if (typeof component?.getField === 'function') {
                columnsByField.set(component.getField(), component);
            }
        }

        const headerChrome = resolveHeaderChrome();

        let changed = false;
        for (const entry of record.columns) {
            const component = columnsByField.get(entry.field);
            if (!component) continue;

            const column = typeof component._getSelf === 'function' ? component._getSelf() : null;
            if (!column || typeof column.setMinWidth !== 'function') {
                // Latched: this fires from a resize callback, so an unlatched warn
                // would repeat for every frame of a window drag, forever.
                if (!this.#apiWarned) {
                    this.#apiWarned = true;
                    console.warn(
                        `TableHeaderGeometry[${this.#scopeId}]: cannot re-derive the header floor of "${entry.field}" — ` +
                            'Tabulator no longer exposes Column#setMinWidth via ColumnComponent#_getSelf(). ' +
                            'Header-derived column floors will stay at their build-time value.',
                    );
                }
                return changed;
            }

            const measuredWidth = measureHeaderFloor(entry.title, entry.hasSorter, headerChrome);

            if (measuredWidth === column.minWidth) continue;
            column.setMinWidth(measuredWidth);
            changed = true;
        }

        // Only once the pass has run to completion: an aborted pass must stay
        // eligible to run again at this font size, otherwise the guard above
        // short-circuits every later realign and its half-applied floors are
        // never reconciled.
        record.rootFontSize = rootFontSize;
        return changed;
    }
}

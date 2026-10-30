/**
 * Keeps keyboard focus on its table control across Tabulator's own re-renders.
 *
 * A forced redraw (`ColumnManager.redraw(true)` → `RowManager.reinitialize()`) deletes
 * and rebuilds every cell, so the focused control leaves the document and focus falls
 * to `<body>`. Tabulator forces one such redraw by itself the first time a table built
 * below the fold scrolls into view (ResizeTable's visibility observer), which is what
 * a Tab onto a control in that table does. A group toggle goes the same way: every
 * toggle rebuilds the group headers, more than once (the regroup, then the resize of an
 * auto-height table, after `renderComplete`), and a pass may detach a header and attach
 * it again. So the focused position (a row, a cell's row, column and control, or a
 * group's key) is remembered, and once a render has taken the control away, the control
 * rendered there is focused a frame later.
 *
 * Only a focus a render took is restored: a control that never left the page, or focus
 * that has moved on (into a dialog, elsewhere in the page), is left alone.
 */

import { ROW_CONTROLS } from './tabulatorAria.js';

/**
 * Where focus was: the control, and how to find the one rendered in its place.
 * @typedef {object} FocusedPosition
 * @property {HTMLElement} element - The control that had focus.
 * @property {() => HTMLElement | null | undefined} relocate - The control now rendered there.
 */

/**
 * The position of a focused row (the row keyboard walks rows, tabulatorAria.js).
 * @param {import('tabulator-tables').Tabulator} table
 * @param {HTMLElement} element - The focused element.
 * @returns {FocusedPosition | null} Null for anything but a row.
 */
function rowPosition(table, element) {
    if (!element.matches('.tabulator-row')) return null;
    const row = table.getRows().find((r) => r.getElement() === element);
    if (!row) return null;
    return {
        element,
        relocate: () => (row.getElement()?.isConnected ? row.getElement() : null),
    };
}

/**
 * The position of a control in a body cell: its row, column and place among the cell's
 * controls, the ones the row keyboard reaches (`tabindex="-1"` among them).
 * @param {import('tabulator-tables').Tabulator} table
 * @param {HTMLElement} element - The focused control.
 * @returns {FocusedPosition | null} Null outside a body cell.
 */
function cellPosition(table, element) {
    const cellElement = element.closest('.tabulator-cell');
    const rowElement = cellElement?.closest('.tabulator-row');
    const row = rowElement ? table.getRows().find((r) => r.getElement() === rowElement) : undefined;
    const cell = row?.getCells().find((c) => c.getElement() === cellElement);
    if (!cellElement || !row || !cell) return null;
    const column = cell.getColumn();
    const index =
        element === cellElement
            ? -1
            : Array.from(cellElement.querySelectorAll(ROW_CONTROLS)).indexOf(element);
    return {
        element,
        relocate: () => {
            if (!row.getElement()?.isConnected) return null;
            // `false`, not null, when the column is gone (a column swap in `setRows`).
            const found = row.getCell(column);
            const replacement = found ? found.getElement() : undefined;
            return index < 0
                ? replacement
                : /** @type {HTMLElement | undefined} */ (
                      replacement?.querySelectorAll(ROW_CONTROLS)[index]
                  );
        },
    };
}

/**
 * The position of a group row's toggle (TableModule's `groupHeader`), by its group's key.
 * @param {HTMLElement} tableElement - The Tabulator root.
 * @param {HTMLElement} element - The focused control.
 * @returns {FocusedPosition | null} Null for anything but a group toggle.
 */
function groupPosition(tableElement, element) {
    const key = element.closest('.tabulator-group') ? element.dataset.groupKey : undefined;
    if (key === undefined) return null;
    return {
        element,
        relocate: () =>
            tableElement.querySelector(
                `.tabulator-group .table-group-toggle[data-group-key="${CSS.escape(key)}"]`,
            ),
    };
}

/**
 * Track focus inside `table`'s body and restore it after a render that took it.
 * @param {import('tabulator-tables').Tabulator} table
 * @param {object} deps
 * @param {(callback: () => void) => void} deps.scheduleFrame - Runs a callback on the next
 *     frame; wire it to the owner's tracked rAF, so a teardown cancels it.
 */
export function keepTableFocus(table, { scheduleFrame }) {
    /** @type {FocusedPosition | null} */
    let focused = null;
    /**
     * A pointer press since focus last landed: focus then leaves because the user
     * clicked elsewhere, which is no loss to restore. A render takes focus from the
     * keyboard user too, with no press before it.
     */
    let pressed = false;
    const listeners = new AbortController();

    const restore = () => {
        if (!focused || pressed) return;
        if (document.activeElement && document.activeElement !== document.body) return;
        // A pass either rebuilt the control or detached and re-attached it.
        const target = focused.element.isConnected ? focused.element : focused.relocate();
        target?.focus({ preventScroll: true });
    };

    document.addEventListener('pointerdown', () => (pressed = true), {
        capture: true,
        signal: listeners.signal,
    });

    table.element.addEventListener(
        'focusin',
        (/** @type {FocusEvent} */ event) => {
            const element = /** @type {HTMLElement} */ (event.target);
            focused =
                groupPosition(table.element, element) ??
                rowPosition(table, element) ??
                cellPosition(table, element);
            pressed = false;
        },
        { signal: listeners.signal },
    );

    // A render blurs the control it removes or detaches; the frame after lets the
    // pass that follows (an auto-height table's resize after `renderComplete`) finish.
    table.element.addEventListener(
        'focusout',
        (/** @type {FocusEvent} */ event) => {
            if (focused && event.target === focused.element) scheduleFrame(restore);
        },
        { signal: listeners.signal },
    );

    // Engines that fire no blur on removal: the render that removed it has completed.
    table.on('renderComplete', () => {
        if (focused && !focused.element.isConnected) scheduleFrame(restore);
    });

    table.on('tableDestroyed', () => listeners.abort());
}

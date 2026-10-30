/**
 * ARIA repairs for the grid tree Tabulator emits.
 *
 * Tabulator stamps `role="grid"` on the table root and roles down the tree, but three
 * of them do not survive the ARIA grid contract that the two `aria-required-*` axe rules
 * check on every scan of every dashboard (tests/e2e/support/axe.js). Each repair
 * below is hooked to the Tabulator event that creates the DOM it corrects, not to a
 * redraw, so a node that renders late (a group header Tabulator rebuilds on a toggle)
 * carries the corrected role from the moment it exists.
 *
 * The tree as of tabulator-tables 6.5.2, with the three repaired nodes marked:
 *
 *   .tabulator                           role=grid            Tabulator.js:234
 *   ├── .tabulator-header                role=rowgroup        ColumnManager.js:104
 *   │   └── .tabulator-header-contents   no role              ColumnManager.js:95
 *   │       └── .tabulator-headers       role=row             ColumnManager.js:87
 *   │           ├── .tabulator-col       role=columnheader    Column.js:79
 *   │           └── .tabulator-col-group role=columngroup     Column.js:324         ← 2
 *   ├── .tabulator-tableholder           tabindex=0, no role  RowManager.js:53      ← 1
 *   │   └── .tabulator-table             role=rowgroup        RowManager.js:63
 *   │       ├── .tabulator-row           role=row             Row.js:42
 *   │       └── .tabulator-row.tabulator-group role=rowgroup  Group.js:69           ← 3
 *   └── .tabulator-footer                                     (no role)
 *
 * Upstream issue #4555 tracks the roles. On a Tabulator upgrade, check the tree above
 * against the new ColumnManager.js / RowManager.js / Group.js;
 * tests/e2e/accessibility.spec.js and this file's unit test say whether the repairs
 * still land, and one that has become a no-op is deleted. Repairs 2 and 3 land
 * only on a table with column groups and row groups;
 * tests/e2e/accessibility-surfaces.spec.js switches one into view.
 *
 * One more gap is a keyboard one: Tabulator sorts on a header click only and never
 * makes a header focusable, so applyHeaderTabStops and
 * installHeaderKeyboard give the sortable headers a tab stop and the Enter/Space
 * activation a `columnheader` needs. installRowKeyboard gives every table one tab stop
 * and arrow-key rows whose controls are reached from their row; applyRowSelectionAria and
 * applyRowSelectableAria tell assistive tech which rows of a selectable table are selected.
 */

import { createElement, isActivationKey, queryEl } from '@tba3/module-base';
import { stampGlossaryTermTabStop } from '@tba3/module-base/glossary';

/**
 * Move the body's tab stop off `.tabulator-tableholder`.
 *
 * The holder is a role-less div with `tabindex="0"` (RowManager.js:53, with the matching
 * `role="rowgroup"` commented out on the next line), and a focusable role-less element
 * counts as an owned child of the `grid`, one whose role is neither `row` nor `rowgroup`,
 * so `aria-required-children` fails on every table. Moving the tab stop one level in, onto
 * the `.tabulator-table[role="rowgroup"]` it wraps, empties the holder out of the
 * accessibility tree while keeping the scrollable body reachable: `scrollable-region-focusable`
 * is satisfied by focusable content inside the scroller, and a browser scrolls the
 * nearest scrollable ancestor of whatever holds focus.
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function applyBodyAria(tableElement) {
    const holder = tableElement.querySelector('.tabulator-tableholder');
    const body = tableElement.querySelector('.tabulator-table');
    if (!holder || !body) return;

    holder.removeAttribute('tabindex');
    body.setAttribute('tabindex', '0');
}

/**
 * Empty column groups out of the header row, so every header-row cell has a data cell
 * under it.
 *
 * A grouped column definition renders `.tabulator-col-group` with `role="columngroup"` and
 * `aria-title` (Column.js:324-325); neither exists in ARIA. Marking the wrapper
 * presentational promotes its sub-`.tabulator-col[role="columnheader"]` elements to the
 * `.tabulator-headers[role="row"]` above it, the closest the nested DOM gets to a valid
 * header row. The group's own title must not come along as one more header: a screen
 * reader pairs cells with headers by position, and every cell after the group would be
 * read under the wrong one. So the title is hidden from assistive tech (its glossary term
 * stays a pointer target and no tab stop: hidden content may hold nothing focusable), and
 * each of its columns says it instead, in a visually hidden prefix ("Hören – Richtig").
 *
 * `aria-sort` goes with it: every `.tabulator-col` is stamped with one (Column.js:80), the
 * group wrapper included, and a presentational element may carry no ARIA attribute at all.
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function applyColumnGroupAria(tableElement) {
    for (const group of tableElement.querySelectorAll('.tabulator-col-group')) {
        group.setAttribute('role', 'presentation');
        group.removeAttribute('aria-title');
        group.removeAttribute('aria-sort');
        const title = group.querySelector(':scope > .tabulator-col-content');
        if (!title) continue;
        title.setAttribute('aria-hidden', 'true');
        const prefix = `${title.textContent?.trim() ?? ''} – `;
        // Beside the title, not in it: a sortable column's title is repainted on every
        // sort (progressBarSorting.js), its content wrapper is not.
        const leafContents = group.querySelectorAll(
            ':scope > .tabulator-col-group-cols > .tabulator-col > .tabulator-col-content',
        );
        for (const content of leafContents) {
            content.querySelector(':scope > .column-group-prefix')?.remove();
            content.prepend(
                createElement('span', {
                    className: 'column-group-prefix visually-hidden',
                    textContent: prefix,
                }),
            );
        }
    }
}

/**
 * Put every sortable column header in the tab order, and every glossary term in the
 * title of a header that is not one; a header that is not one carries no `aria-sort`.
 *
 * Tabulator binds its sort to a `click` on `.tabulator-col` (Sort.js) and leaves the
 * header out of the tab order, so without this a sort is pointer-only. The title
 * formatters stamp header terms unfocusable, since a sortable header is a tab stop
 * itself. Stamped on `columnsLoaded`, because a column swap builds new header cells.
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function applyHeaderTabStops(tableElement) {
    // A group's title is hidden (applyColumnGroupAria): its term is no tab stop.
    for (const column of tableElement.querySelectorAll(
        '.tabulator-header .tabulator-col:not(.tabulator-col-group)',
    )) {
        // The column's own title, not a sub-column's under a group.
        const terms = column.querySelectorAll(
            ':scope > .tabulator-col-content [data-glossary-key]',
        );
        if (column.classList.contains('tabulator-sortable')) {
            column.setAttribute('tabindex', '0');
            // A term in the title is no second tab stop: the header's own keyboard focus
            // opens its popup, after the hover delay (tooltipService).
            column.toggleAttribute('data-glossary-focus', terms.length > 0);
        } else {
            // Tabulator stamps `aria-sort="none"` on every column; on one that cannot
            // sort it claims a sort the header does not offer.
            column.removeAttribute('aria-sort');
            // A header that is no control leaves its terms the tab stops they are elsewhere.
            for (const term of terms) stampGlossaryTermTabStop(term);
        }
    }
}

/**
 * Sort from the keyboard: Enter or Space on a focused sortable header clicks it. The
 * click takes the pointer's path (Tabulator's own sort, or the progress-bar sort cycle
 * that takes a cycle column's click first), so the keyboard sorts exactly like the pointer. Keys
 * from a descendant are left alone; only the header itself is the control.
 *
 * Installed once on `tableBuilt`: the listener is delegated to `.tabulator-header`,
 * which Tabulator keeps across a column swap.
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function installHeaderKeyboard(tableElement) {
    queryEl(tableElement, '.tabulator-header')?.addEventListener('keydown', (event) => {
        if (!isActivationKey(event)) return;
        const column = event.target;
        if (!(column instanceof HTMLElement)) return;
        if (!column.matches('.tabulator-col.tabulator-sortable')) return;
        // Space would otherwise scroll the page.
        event.preventDefault();
        column.click();
    });
}

/** The keys a focused row or row control answers to; every other key passes untouched. */
const ROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape']);

/** What a row holds that the keyboard can reach: its buttons, links and glossary terms. */
export const ROW_CONTROLS = 'button, a[href], .glossary-term';

/**
 * Make a row's control focusable from script only: the row, not each control in it,
 * is the stop. A cell's glossary term becomes the button its popup opens from.
 * @param {HTMLElement} control
 */
function makeRowControlFocusable(control) {
    if (control.matches('.glossary-term') && !control.hasAttribute('role')) {
        stampGlossaryTermTabStop(control, '-1');
    } else if (!control.hasAttribute('tabindex')) {
        control.tabIndex = -1;
    }
}

/**
 * The keyboard model of every table: the body is one tab stop, the rows are what the
 * arrow keys walk, and a row's controls (buttons, links, glossary terms) are reached
 * from their row, not by Tab, so getting past a table takes one Tab whatever its length.
 *
 * - Down/Up move focus row by row, from the body's tab stop, a row or a control in one.
 * - Right (or Enter, on a table whose rows are no controls) moves into the focused row's
 *   controls; Right and Left step through them; Left from the first, or Escape, goes
 *   back to the row.
 * - Enter or Space on a focused row of a table whose rows are controls (`activates`: a
 *   selectable table, whose `rowClick` may open something) clicks it, which runs
 *   Tabulator's own selection toggle and `rowClick` listeners, so the keyboard acts
 *   exactly like the pointer.
 *
 * A control keeps its own Enter and Space; an Escape something else claimed (an open
 * glossary popup) is left alone. Installed once on `tableBuilt`: the listener is
 * delegated to `.tabulator-table`, which Tabulator keeps across redraws and data swaps.
 * @param {import('tabulator-tables').Tabulator} table
 * @param {{activates: boolean}} options
 */
export function installRowKeyboard(table, { activates }) {
    const body = queryEl(table.element, '.tabulator-table');
    body?.addEventListener('keydown', (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const current = /** @type {HTMLElement|null} */ (target.closest('.tabulator-row'));

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            // The rows on display: a row in a collapsed group is active but has no place.
            const rows = table.getRows('active').filter((row) => row.getElement().isConnected);
            if (rows.length === 0) return;
            event.preventDefault();
            const index = rows.findIndex((row) => row.getElement() === current);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next =
                rows[index === -1 ? 0 : Math.min(Math.max(index + step, 0), rows.length - 1)];
            void table.scrollToRow(next, 'nearest', false).then(() => {
                const element = next.getElement();
                element.tabIndex = -1;
                element.focus();
            });
            return;
        }
        if (!current || event.defaultPrevented || !ROW_KEYS.has(event.key)) return;

        const controls = /** @type {HTMLElement[]} */ ([...current.querySelectorAll(ROW_CONTROLS)]);
        /** @param {HTMLElement|undefined} control */
        const focusControl = (control) => {
            if (!control) return;
            event.preventDefault();
            makeRowControlFocusable(control);
            control.focus();
        };

        if (target === current) {
            if (event.key === 'ArrowRight' || (event.key === 'Enter' && !activates)) {
                focusControl(controls[0]);
            } else if (activates && isActivationKey(event)) {
                // Space would otherwise scroll the page.
                event.preventDefault();
                current.click();
            }
            return;
        }

        const at = controls.indexOf(target);
        if (at === -1) return;
        if (event.key === 'ArrowRight') {
            focusControl(controls[at + 1]);
        } else if (event.key === 'ArrowLeft' && at > 0) {
            focusControl(controls[at - 1]);
        } else if (event.key === 'ArrowLeft' || event.key === 'Escape') {
            event.preventDefault();
            current.focus();
        }
    });
}

/**
 * Mirror a selection change onto the rows' `aria-selected`, from the deltas of
 * Tabulator's `rowSelectionChanged`: the row element survives a redraw, so the state
 * stays on it.
 * @param {import('tabulator-tables').RowComponent[]} selected
 * @param {import('tabulator-tables').RowComponent[]} deselected
 */
export function applyRowSelectionAria(selected, deselected) {
    for (const row of selected) row.getElement().setAttribute('aria-selected', 'true');
    for (const row of deselected) row.getElement().setAttribute('aria-selected', 'false');
}

/**
 * Say of every row of a selectable table that it is selectable before the first
 * change: a row with no `aria-selected` reads as one that cannot be. Run on
 * `renderComplete`, after which every row has its element; a row already stamped
 * keeps its state.
 * @param {import('tabulator-tables').Tabulator} table
 */
export function applyRowSelectableAria(table) {
    for (const row of table.getRows()) {
        const element = row.getElement();
        if (!element.hasAttribute('aria-selected')) {
            element.setAttribute('aria-selected', String(row.isSelected()));
        }
    }
}

/**
 * Re-role group header rows.
 *
 * `GroupRows/Group.js:69` gives a group header `role="rowgroup"`, which inside the body's
 * own rowgroup is both an unallowed child and a rowgroup without its required grid context.
 * It is a row of the grid, so that is what it is stamped as; the cell it needs comes from
 * the `groupHeader` `TableModule.createTable` defaults to, which wraps the label in a `gridcell`.
 * @param {import('tabulator-tables').GroupComponent[]} groups - From Tabulator's `dataGrouped` event.
 */
export function applyGroupRowAria(groups) {
    for (const group of groups) {
        group.getElement().setAttribute('role', 'row');
        applyGroupRowAria(group.getSubGroups());
    }
}

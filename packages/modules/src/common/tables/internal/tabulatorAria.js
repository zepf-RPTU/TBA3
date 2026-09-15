/**
 * ARIA repairs for the grid tree Tabulator emits.
 *
 * Tabulator stamps `role="grid"` on the table root and roles down the tree, but four
 * of them do not survive the ARIA grid contract, so the two `aria-required-*` axe rules
 * used to be disabled for every scan of every dashboard (tests/e2e/support/axe.js) — and
 * a `role="tablist"` holding no tabs sat unnoticed behind that exemption. Each repair
 * below is hooked to the Tabulator event that *creates* the DOM it corrects, not to a
 * redraw, so a node that renders late (a group header the virtual renderer only attaches
 * on scroll) carries the corrected role from the moment it exists.
 *
 * The tree as of tabulator-tables 6.3.1, with the four repaired nodes marked:
 *
 *   .tabulator                           role=grid            Tabulator.js:234
 *   ├── .tabulator-header                role=rowgroup        ColumnManager.js:105
 *   │   └── .tabulator-header-contents   role=rowgroup        ColumnManager.js:96   ← 1
 *   │       └── .tabulator-headers       role=row             ColumnManager.js:87
 *   │           ├── .tabulator-col       role=columnheader    Column.js:79
 *   │           └── .tabulator-col-group role=columngroup     Column.js:324         ← 3
 *   ├── .tabulator-tableholder           tabindex=0, no role  RowManager.js:52      ← 2
 *   │   └── .tabulator-table             role=rowgroup        RowManager.js:63
 *   │       ├── .tabulator-row           role=row             Row.js:42
 *   │       └── .tabulator-row.tabulator-group role=rowgroup  Group.js:69           ← 4
 *   └── .tabulator-footer / .tabulator-calcs-holder           (no role)
 *
 * One rule of axe's decides most of it: collecting what an element owns, it walks
 * *through* a role-less child, and through a `group`/`rowgroup` child only when that role
 * is one the parent itself requires. A `grid` requires `row` **or** `rowgroup`, so a
 * rowgroup under it is walked through; a `rowgroup` requires `row` alone, so a rowgroup
 * under *it* is a child that should not be there. That asymmetry is repair 1, and it is
 * easy to read the wrong way round — reading the source alone got it backwards, the scan
 * settled it.
 *
 * Upgrading will not make this unnecessary: 6.5.2 stamps the same roles in the same
 * places and upstream issue #4555 has been open since August 2024. Check the tree above
 * against the new ColumnManager.js / RowManager.js / Group.js, and let
 * tests/e2e/accessibility.spec.js and the unit test beside this file say whether the
 * repairs still land — one that has become a no-op should be deleted, not left standing.
 * Repairs 3 and 4 have a single target in the whole app, SL's overview in Tabellen mode,
 * which is why tests/e2e/accessibility-surfaces.spec.js switches into that mode rather
 * than trusting the view sweep to reach it.
 */

/**
 * Unnest the header's two rowgroups.
 *
 * `.tabulator-header[role="rowgroup"]` wraps `.tabulator-header-contents[role="rowgroup"]`,
 * which wraps the `.tabulator-headers[role="row"]` (ColumnManager.js:87-105). A rowgroup
 * requires `row` children and nothing else, so the inner one is an unallowed child of the
 * outer — and, needing a grid for its own context, it has a rowgroup instead. Dropping the
 * inner role leaves a plain wrapper, which the accessibility tree walks straight through to
 * the header row.
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function applyHeaderAria(tableElement) {
    tableElement.querySelector('.tabulator-header-contents')?.removeAttribute('role');
}

/**
 * Move the body's tab stop off `.tabulator-tableholder`.
 *
 * The holder is a role-less div with `tabindex="0"` (RowManager.js:52, with the matching
 * `role="rowgroup"` commented out on the next line), and a focusable role-less element
 * counts as an owned child of the `grid` — one whose role is neither `row` nor `rowgroup`,
 * so `aria-required-children` fails on every table. Moving the tab stop one level in, onto
 * the `.tabulator-table[role="rowgroup"]` it wraps, empties the holder out of the
 * accessibility tree while keeping the scrollable body reachable: `scrollable-region-focusable`
 * is satisfied by focusable content *inside* the scroller, and a browser scrolls the
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
 * Empty column groups out of the header.
 *
 * A grouped column definition renders `.tabulator-col-group` with `role="columngroup"` and
 * `aria-title` (Column.js:324-325) — neither exists in ARIA. Marking the wrapper
 * presentational promotes its sub-`.tabulator-col[role="columnheader"]` elements to the
 * `.tabulator-headers[role="row"]` above it, which is the closest the nested DOM gets to a
 * valid header row; the group's own title stays visible and readable as text.
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
    }
}

/**
 * Re-role group header rows.
 *
 * `GroupRows/Group.js:69` gives a group header `role="rowgroup"`, which inside the body's
 * own rowgroup is both an unallowed child and a rowgroup without its required grid context.
 * It is a row of the grid, so that is what it is stamped as — the cell it needs comes from
 * the owning module's `groupHeader`, which wraps its label in a `gridcell`.
 * @param {Array<{getElement: () => HTMLElement, getSubGroups: () => Array<any>}>} groups -
 *     The group components from Tabulator's `dataGrouped` event.
 */
export function applyGroupRowAria(groups) {
    for (const group of groups) {
        group.getElement().setAttribute('role', 'row');
        applyGroupRowAria(group.getSubGroups());
    }
}

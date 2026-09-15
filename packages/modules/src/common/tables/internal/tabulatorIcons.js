/**
 * The Material glyphs Tabulator's own CSS-border triangles are replaced with.
 *
 * Tabulator draws its sort indicator, its group-row toggle and its data-tree toggle as
 * empty `<div>`s shaped by borders. The app has one icon source (`utils/icons.js`), so
 * each of those boxes gets a glyph from it instead and the border paint is switched off
 * in `@tba3/modules/styles/table-base.css`. The DOM stays Tabulator's: the glyph goes *inside* the
 * element Tabulator listens on, so clicks, `aria-sort` and the open/closed classes keep
 * working untouched, and CSS keyed on those attributes decides which glyph shows.
 *
 * Every pass is idempotent (a box that already carries a glyph is skipped) because
 * Tabulator rebuilds some of these nodes on its own: the data-tree control is regenerated
 * on every expand/collapse (`DataTree.js` `generateControlElement`) and the virtual
 * renderer attaches rows as they scroll into view. `applyTableIcons` therefore runs on
 * every event that may have created one of them (see `TableModule#createTable`).
 */

import { createIcon } from '@tba3/module-base/utils/icons.js';

/** Stamped on the glyphs so a re-run can tell a decorated box from a fresh one. */
const ICON_CLASS = 'tabulator-glyph';

/**
 * Whether a Tabulator box already carries its glyph.
 * @param {Element} box - The sorter, group-arrow or tree-control element.
 * @returns {boolean} True when a previous pass decorated it.
 */
function hasGlyph(box) {
    return box.querySelector(`.${ICON_CLASS}`) !== null;
}

/**
 * Sort indicators: all three glyphs go in at once and `table-base.css` shows the one
 * matching the column's `aria-sort`, so a sort never needs a DOM update.
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function applySortIcons(tableElement) {
    for (const sorter of tableElement.querySelectorAll('.tabulator-col-sorter')) {
        if (hasGlyph(sorter)) continue;
        sorter.append(
            createIcon('swap_vert', { className: `${ICON_CLASS} tabulator-glyph--unsorted` }),
            createIcon('arrow_upward', { className: `${ICON_CLASS} tabulator-glyph--asc` }),
            createIcon('arrow_downward', { className: `${ICON_CLASS} tabulator-glyph--desc` }),
        );
    }
}

/**
 * Group-row and data-tree toggles: one chevron each, rotated by CSS when the row is open
 * (`.tabulator-group-visible` on the group row, `.tabulator-data-tree-control-collapse`
 * inside the tree control).
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function applyToggleIcons(tableElement) {
    const toggles = tableElement.querySelectorAll(
        '.tabulator-group .tabulator-arrow, .tabulator-data-tree-control',
    );
    for (const toggle of toggles) {
        if (hasGlyph(toggle)) continue;
        toggle.append(createIcon('chevron_right', { className: ICON_CLASS }));
    }
}

/**
 * Both passes, for the events that may have (re)built any of the boxes.
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function applyTableIcons(tableElement) {
    applySortIcons(tableElement);
    applyToggleIcons(tableElement);
}

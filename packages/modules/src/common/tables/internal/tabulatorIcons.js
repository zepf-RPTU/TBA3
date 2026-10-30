/**
 * The Material glyphs Tabulator's own CSS-border triangles are replaced with.
 *
 * Tabulator draws its sort indicator and its group-row toggle as empty `<div>`s shaped
 * by borders. The app has one icon source (`utils/icons.js`), so each of those boxes
 * gets a glyph from it instead (`@tba3/modules/styles/table-base.css` styles them).
 * `headerSortElement` is a Tabulator option, handed in with every build: it is set as
 * each sorter's content when the column is built; all three glyphs go in, and CSS keyed
 * on the column's `aria-sort` shows one, so a sort never needs a DOM update.
 *
 * The group-row arrow has no option (GroupRows/Group.js builds a bare
 * `.tabulator-arrow`, once per group, and attaches it when the group header renders),
 * so `applyGroupIcons` adds its chevron after each render of a grouped table.
 */

import { createIcon, iconSvg } from '@tba3/module-base';

const ICON_CLASS = 'tabulator-glyph';

/** Tabulator's `headerSortElement`: the three sort glyphs, one per `aria-sort` state. */
export const SORT_GLYPHS_HTML = [
    iconSvg('swap_vert', { className: `${ICON_CLASS} tabulator-glyph--unsorted` }),
    iconSvg('arrow_upward', { className: `${ICON_CLASS} tabulator-glyph--asc` }),
    iconSvg('arrow_downward', { className: `${ICON_CLASS} tabulator-glyph--desc` }),
].join('');

/**
 * Group-row toggles: one chevron each, rotated by CSS while the group is open
 * (`.tabulator-group-visible`). Idempotent, because each render passes the arrows it
 * decorated before.
 * @param {HTMLElement} tableElement - The Tabulator root (`.tabulator`).
 */
export function applyGroupIcons(tableElement) {
    for (const arrow of tableElement.querySelectorAll('.tabulator-group .tabulator-arrow')) {
        if (arrow.firstElementChild) continue;
        arrow.append(createIcon('chevron_right', { className: ICON_CLASS }));
    }
}

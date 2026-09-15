/**
 * Column-visibility toolbar menu.
 *
 * A self-contained header-action dropdown widget: it lists every toggleable
 * column (title + field, minus the excluded ones) and flips a column's
 * visibility on click. It carries no table *state* of its own — the owning
 * TableModule supplies a lazy table accessor (so the button survives table
 * recreations), the excluded-field set, and the toggle behavior.
 */

import { glossaryAnnotator } from '../../glossary/glossaryAnnotator.js';
import { ensureHeaderActionCheckboxDropdownControl } from '@tba3/module-base/modules/header/headerActionDropdown.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';

/** DOM selector identifying the column-visibility control wrapper in a header-actions toolbar. */
export const COLUMN_VISIBILITY_CONTROL_SELECTOR = '[data-header-action-control="table-columns"]';

const COLUMN_VISIBILITY_ICON_HTML = iconSvg('visibility');

/**
 * Creates the column-visibility dropdown button inside a header-actions toolbar.
 * Lists all columns with title+field (excluding `excludedFields`) and lets the
 * user toggle each column's visibility.
 *
 * Idempotent: if the control already exists in `headerActions`, it is left
 * untouched (the dropdown reads the current table lazily via `getTable`, so it
 * keeps working across table recreations without being rebuilt).
 * @param {object} params - Where to mount the control, and how it reaches the live table.
 * @param {HTMLElement|null} params.headerActions - The header-actions container to mount into
 * @param {() => (object | null)} params.getTable - Returns the current Tabulator table instance
 * @param {Set<string>} params.excludedFields - Column fields to omit from the menu
 * @param {(column: object) => void} params.onToggleColumn - Called with the Tabulator column to toggle
 */
export function createColumnVisibilityMenu({
    headerActions,
    getTable,
    excludedFields,
    onToggleColumn,
}) {
    if (!headerActions || !getTable()) return;

    // Skip if already created (the dropdown uses getTable() lazily, so it
    // works across table recreations without being rebuilt)
    if (headerActions.querySelector(COLUMN_VISIBILITY_CONTROL_SELECTOR)) return;

    const tableSelectorTooltip = glossaryAnnotator.getRequiredEntryText(
        'general.buttons.element_texts.table-selector.tooltip',
    );

    ensureHeaderActionCheckboxDropdownControl(headerActions, {
        wrapperSelector: COLUMN_VISIBILITY_CONTROL_SELECTOR,
        wrapperAttributes: {
            'data-header-action-control': 'table-columns',
        },
        buttonAttributes: {
            'data-header-action-button': 'table-columns',
        },
        ariaLabel: tableSelectorTooltip,
        tooltipText: tableSelectorTooltip,
        buttonHTML: COLUMN_VISIBILITY_ICON_HTML,
        dropdownClass: 'header-action-dropdown header-action-dropdown--scrollable',
        getItems: () => {
            const table = getTable();
            if (!table) return [];
            const columns = table.getColumns();
            const toggleable = columns.filter((col) => {
                const def = col.getDefinition();
                return def.title && def.field && !excludedFields.has(def.field);
            });

            return toggleable.map((col) => {
                const def = col.getDefinition();
                return {
                    id: def.field,
                    label: def.title,
                    checked: col.isVisible(),
                    column: col,
                };
            });
        },
        onToggle: (item) => onToggleColumn(item.column),
    });
}

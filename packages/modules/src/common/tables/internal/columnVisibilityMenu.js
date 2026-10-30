/**
 * The column-visibility toolbar menu. It carries no table state: the owning
 * TableModule supplies a table accessor (read on every open, so the menu follows table
 * recreations), the excluded-field set and the toggle behavior.
 */

import { headerActionCheckboxDropdown, renderIcon } from '@tba3/module-base';
import { nothing } from 'lit';

/**
 * The column-visibility dropdown of a table's header toolbar: one checkbox per column
 * with a title and a field, `excludedFields` left out.
 * @param {object} params
 * @param {import('../../glossary/glossaryAnnotator.js').GlossaryAnnotator} params.glossary
 * @param {() => import('tabulator-tables').Tabulator | null} params.getTable
 * @param {Set<string>} params.excludedFields
 * @param {(column: import('tabulator-tables').ColumnComponent) => void} params.onToggleColumn
 * @param {(columns: import('tabulator-tables').ColumnComponent[]) => void} params.onShowAll - Called with every toggleable column, to show them all
 * @returns {unknown} The control, or `nothing` before a table exists.
 */
export function columnVisibilityMenu({
    glossary,
    getTable,
    excludedFields,
    onToggleColumn,
    onShowAll,
}) {
    if (!getTable()) return nothing;

    const tableSelectorTooltip = glossary.getRequiredEntryText(
        'general.buttons.element_texts.table-selector.tooltip',
    );
    const showAllLabel = glossary.getRequiredEntryText(
        'general.buttons.element_texts.table-selector-show-all.label',
    );
    const otherColumnsLabel = glossary.getRequiredEntryText(
        'general.buttons.element_texts.table-selector-other-columns.label',
    );

    /** @returns {import('tabulator-tables').ColumnComponent[]} The live table's columns the menu offers, in display order. */
    const getToggleableColumns = () =>
        (getTable()?.getColumns() ?? []).filter((col) => {
            const def = col.getDefinition();
            return def.title && def.field && !excludedFields.has(def.field);
        });

    return headerActionCheckboxDropdown({
        name: 'table-columns',
        ariaLabel: tableSelectorTooltip,
        buttonContent: renderIcon('view_column'),
        dropdownClass: 'header-action-dropdown--scrollable styled-scrollbar',
        /** @returns {Array<import('@tba3/module-base').HeaderActionMenuItem & {column: import('tabulator-tables').ColumnComponent}>} */
        getItems: () => {
            let afterGroup = false;
            return getToggleableColumns().map((col) => {
                const def = col.getDefinition();
                // A grouped column ("Hörverstehen" › "Verteilung") sits under its group's
                // section label. An ungrouped one after a group gets a section of its
                // own, or it would read as the last group's member. `getParentColumn()`
                // is `false` at the top level.
                const parent = col.getParentColumn();
                const parentTitle = parent ? parent.getDefinition().title : null;
                afterGroup ||= Boolean(parentTitle);
                return {
                    id: def.field,
                    label: def.title,
                    group: parentTitle ?? (afterGroup ? otherColumnsLabel : null),
                    checked: col.isVisible(),
                    column: col,
                };
            });
        },
        onToggle: (item) => onToggleColumn(item.column),
        getActions: () => [
            {
                id: 'show-all',
                label: showAllLabel,
                icon: 'view_column',
                disabled: getToggleableColumns().every((col) => col.isVisible()),
            },
        ],
        onAction: () => onShowAll(getToggleableColumns()),
    });
}

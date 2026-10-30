/**
 * The MA item columns, one definition so every item table shows them alike: the naming columns before a table's result columns, the
 * classifying ones after.
 */

import {
    createColumnDef,
    createExerciseColumn,
    createItemCompetenceLevelColumn,
    createItemNumberColumn,
    createMultiValueListColumn,
    toItemPreview,
} from '../../../common/tables/columnFactories.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';
import { TableModeController } from '../../../common/tables/tableModeController.js';
import { MA_DOMAIN_TERM } from '../../maTerms.js';

/**
 * The option a table with competence columns takes on top of its base's: whether they
 * show — a signal, or a fixed value; shown when left out.
 * @typedef {{showCompetences?: boolean | import('@preact/signals-core').Signal<boolean>}} CompetenceColumnsOptions
 */

/**
 * The competence columns' visibility, following a table's `showCompetences` option. A
 * change resets them, over a choice made in the column-visibility menu; the controller's
 * `value` is what a table builds its columns with.
 * @param {import('../../../common/tables/tableModeController.js').TableModeHost & {options: CompetenceColumnsOptions}} host
 * @param {() => import('../../utils/maCompetenceGroupings.js').MaCompetenceGrouping[]} groupings - The columns' groupings, read when a change applies.
 * @param {(getShouldShow: (column: import('tabulator-tables').ColumnComponent) => boolean | undefined) => void} applyColumnVisibility - The table's `_applyColumnVisibility`.
 * @returns {TableModeController<boolean>}
 */
export function competenceColumnsController(host, groupings, applyColumnVisibility) {
    return new TableModeController(host, {
        mode: host.options.showCompetences ?? true,
        key: 'showCompetences',
        apply: (show) => {
            /** @type {Set<string>} */
            const fields = new Set(groupings().map(({ field }) => field));
            applyColumnVisibility((column) => (fields.has(column.getField()) ? show : undefined));
        },
    });
}

/**
 * The columns that name an item: Nr., Aufgabe and Aufgabenniveau, each with a list
 * filter over the rows the table shows. A table places its result columns after them.
 * @param {import('../../../common/context/moduleContext.js').ModuleContext} context - Its `itemPreview` adds the preview button to the number.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]}
 */
export function createMaItemColumns(context) {
    const { itemPreview } = context;
    return [
        createItemNumberColumn(context.glossary, {
            onShowItem: itemPreview ? (rowData) => itemPreview(toItemPreview(rowData)) : null,
        }),
        createExerciseColumn(COLUMN_GROW_RATIOS.wide),
        createItemCompetenceLevelColumn(context.palette),
    ];
}

/**
 * The columns that classify an item, after its result columns: Leitidee and one per
 * competence type the items carry (Allgemeine Kompetenz, Anforderungsbereich;
 * `MA_DATASETS.COMPETENCE_GROUPINGS`), each with a list filter.
 * @param {import('../../utils/maCompetenceGroupings.js').MaCompetenceGrouping[]} groupings - One column each.
 * @param {boolean} [showCompetences] - Whether the competence columns start visible.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]}
 */
export function createMaClassificationColumns(groupings, showCompetences = true) {
    return [
        createColumnDef(MA_DOMAIN_TERM, 'domainLabel', {
            hozAlign: 'left',
            widthGrow: COLUMN_GROW_RATIOS.medium,
            headerFilter: 'list',
        }),
        // Titled by the payload's type, so the glossary term of the dimension marks it.
        ...groupings.map(({ type, field, values }) =>
            createMultiValueListColumn(type, field, { order: values, visible: showCompetences }),
        ),
    ];
}

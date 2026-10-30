/**
 * EN table column builders: the item columns and the per-domain result columns.
 */

import {
    createColumnDef,
    createExerciseColumn,
    createItemCompetenceLevelColumn,
    createItemNumberColumn as createSharedItemNumberColumn,
    createCompetenceLevelColumn,
    toItemPreview,
} from '../../../common/tables/columnFactories.js';
import { DOMAIN_FIELD_PREFIXES } from './enDomainModeRules.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';
import { createProgressBarColumns } from '../../../common/tables/progressBarColumn.js';
import { compareNumbers } from '../../../common/utils/compare.js';
import { EN_TERMS } from '../../enTerms.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { itemNumberLabel, withDomainPrefix } from '../../utils/enDomainPrefix.js';
import { formatPercent } from '../../../common/utils/numberFormat.js';
import { formatDownloadNumber } from '../../../common/tables/downloadNumberFormat.js';

/** @typedef {import('../../../common/overlays/itemPreviewOverlay.js').ItemPreview} ItemPreview */

/** @typedef {import('../../../common/tables/columnFactories.js').RowData} RowData */

/** @typedef {import('./enDomainModeRules.js').DomainFieldPrefix} DomainFieldPrefix */

/**
 * Creates the mode-aware EN "Nr." (item number) column. In 'all' mode the value is prefixed with the domain
 * abbreviation; otherwise it is shown as-is. Sorting follows the displayed value, so
 * in 'all' mode the column clusters by domain rather than interleaving Hören and
 * Lesen items by number.
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary, which labels the preview button.
 * @param {() => string} getMode - The live mode, `'all'` or a domain id.
 * @param {((item: ItemPreview) => void) | undefined} onItemPreview - When provided, a "show
 *   item" button is added to the number that hands the row's preview payload to this handler.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition}
 */
function createItemNumberColumn(glossary, getMode, onItemPreview) {
    return createSharedItemNumberColumn(glossary, {
        getDisplayName: (name, rowData) => itemNumberLabel(name, rowData.domainLabel, getMode()),
        // The preview always names the domain-prefixed number, whatever the mode.
        onShowItem: onItemPreview
            ? (rowData) =>
                  onItemPreview({
                      ...toItemPreview(rowData),
                      number: withDomainPrefix(rowData.name, rowData.domainLabel),
                  })
            : null,
    });
}

/**
 * The three columns that name an item, identical in the EN item and student-data
 * tables: Nr. (domain-prefixed in `all`), Aufgabe and Aufgabenniveau, each with a list
 * filter over the rows the table shows. A table places its result columns after them.
 * @param {import('../../../common/context/moduleContext.js').ModuleContext} context - Its `itemPreview` adds the preview button to the number.
 * @param {{mode: string}} domain - A `DomainModeController` fits; `mode` is read on every format.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]}
 */
export function createEnItemColumns(context, domain) {
    return [
        createItemNumberColumn(context.glossary, () => domain.mode, context.itemPreview),
        createExerciseColumn(COLUMN_GROW_RATIOS.medium, { lang: 'en' }),
        createItemCompetenceLevelColumn(context.palette),
    ];
}

/**
 * The GER level column of one domain. Its header reads "GER" under the domain's
 * group; the download and the filter menu, which flatten the groups, prefix the
 * group's name.
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {DomainFieldPrefix} domainKey
 * @param {boolean} filterable - Whether the filter menu offers the levels.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition}
 */
function createGerColumn(palette, domainKey, filterable) {
    return createCompetenceLevelColumn(palette, {
        title: EN_TERMS.SCALE,
        field: `${domainKey}Ger`,
        headerFilter: filterable,
    });
}

/**
 * One domain's result columns, the same in the group and student info tables: a
 * column group named after the domain, holding the distribution bar, the export
 * columns behind it, and the GER level. A download has no group row, so each column's
 * download title carries the domain (`processColumnDefinitions`). The group title
 * links the entry that claims the domain's id, never a term its name would match.
 * @param {import('../../../common/context/moduleContext.js').ModuleContext} context
 * @param {DomainFieldPrefix} domainKey
 * @param {string} domainId
 * @param {string} domainLabel
 * @param {boolean} filterable - Whether the filter menu offers the GER levels.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition} A column group.
 */
function createDomainResultColumns(context, domainKey, domainId, domainLabel, filterable) {
    const headerGlossaryKey = context.glossary.resolveDomainEntryKey(domainId);
    return {
        title: domainLabel,
        tableMeta: headerGlossaryKey ? { headerGlossaryKey } : { skipGlossaryAnnotation: true },
        columns: [
            ...createProgressBarColumns(context, {
                fieldPrefix: domainKey,
                countLabel: TERM_CONSTANTS.ITEM_COUNT,
            }),
            createGerColumn(context.palette, domainKey, filterable),
        ],
    };
}

/**
 * The hidden style-share columns, one per style category; a single-domain mode shows
 * them. Each reads the row's style shares of the domain in force (`rowData[mode]`),
 * so a mode switch rewrites no row.
 * @param {Array<{value: string, fieldName: string, label: string}>} styleCategories
 * @param {() => string} getMode - The domain mode in force, read on every format.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]}
 */
function createStyleShareColumns(styleCategories, getMode) {
    return styleCategories.map((cat) => {
        /**
         * @param {RowData} rowData
         * @returns {number|null}
         */
        const shareOf = (rowData) => rowData[getMode()]?.[cat.value] ?? null;
        return createColumnDef(cat.label, cat.fieldName, {
            widthGrow: COLUMN_GROW_RATIOS.narrow,
            visible: false,
            formatter: (cell) => formatPercent(shareOf(cell.getRow().getData())),
            sorter: (_a, _b, aRow, bRow) =>
                compareNumbers(shareOf(aRow.getData()), shareOf(bRow.getData())),
            // The cell is German prose; the download wants the figure.
            accessorDownload: (_value, rowData) => formatDownloadNumber(shareOf(rowData)),
            tableMeta: { skipCellGlossaryAnnotation: true },
        });
    });
}

/**
 * The domain columns the group and student info tables share: both domains' result
 * columns (the layout holds exactly two), then the style shares of the domain in force.
 * @param {import('../../../common/context/moduleContext.js').ModuleContext} context
 * @param {{enConfig: import('../../enConfig.js').EnConfig, mode: string}} domain - A `DomainModeController` fits; `mode` is read on every format.
 * @param {object} [options]
 * @param {boolean} [options.filterable=false] - Whether the filter menu offers each
 *   domain's GER levels (the group table; a one-row table has nothing to filter).
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]}
 */
export function createDomainColumns(context, domain, { filterable = false } = {}) {
    const { enConfig } = domain;
    return [
        ...DOMAIN_FIELD_PREFIXES.map((domainKey, index) =>
            createDomainResultColumns(
                context,
                domainKey,
                enConfig.domainIds[index],
                enConfig.domainLabels[index],
                filterable,
            ),
        ),
        ...createStyleShareColumns(enConfig.styleCategories, () => domain.mode),
    ];
}

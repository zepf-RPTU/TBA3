/**
 * MaItemTableModule - Composite module for item/task overview table
 * Combines table with filtering and export capabilities
 */

import {
    BaseItemTableModule,
    createItemTablePresets,
} from '../../../common/tables/baseItemTableModule.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { MA_TERM_CONSTANTS } from '../../maTerms.js';
import { createListFilter } from '../../../common/tables/tableDataUtils.js';
import { compareLevelLabels } from '../../../common/domain/levels.js';
import { createKsColumn, createColumnDef } from '../../../common/tables/columnFactories.js';
import { createDistributionDownloadColumns } from '../../../common/tables/tableExport.js';
import {
    createProgressBarColumn,
    createPilotierungColumn,
    createPilotierungDownloadColumns,
} from '../../../common/tables/progressBarColumn.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';
import { createMaItemNumberColumn } from './maTableColumns.js';

/**
 * MaItemTableModule - Reusable item table component
 * Encapsulates the item overview table with filtering and export
 * @augments BaseItemTableModule
 */
export class MaItemTableModule extends BaseItemTableModule {
    /**
     * Creates a new MaItemTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        this.setDefaults({
            enableModuleExport: true,
        });
    }

    // ========================================================================
    // BASE CLASS HOOK IMPLEMENTATIONS
    // ========================================================================

    /** @override */
    _getColumns(processedData) {
        return [
            createColumnDef(MA_TERM_CONSTANTS.DOMAIN, 'domainLabel', {
                widthGrow: COLUMN_GROW_RATIOS.domain,
                headerFilter: 'list',
                headerFilterParams: createListFilter(processedData, 'domainLabel'),
            }),
            createMaItemNumberColumn(this.getOption('onItemPreview')),
            createColumnDef('Aufgabe', 'exerciseName', {
                widthGrow: COLUMN_GROW_RATIOS.description,
                headerFilter: 'list',
                headerFilterParams: createListFilter(processedData, 'exerciseName'),
            }),
            createKsColumn({
                title: TERM_CONSTANTS.ITEM_LEVEL,
                field: 'competenceLevel',
                headerFilter: true,
                headerSort: true,
                headerFilterParams: createListFilter(
                    processedData,
                    'competenceLevel',
                    null,
                    compareLevelLabels,
                ),
            }),
            createProgressBarColumn(
                {
                    showCounts: true,
                    correctCountField: 'correctCount',
                    incorrectCountField: 'incorrectCount',
                    notAttemptedCountField: 'notAttemptedCount',
                    benchmarkField: 'pilotierungswert',
                },
                'Verteilung: Richtig | Unbearbeitet | Falsch',
                'percentageCombined',
                {
                    headerFilter: false,
                },
            ),
            ...createDistributionDownloadColumns({ follows: 'percentageCombined' }),
            createPilotierungColumn(),
            ...createPilotierungDownloadColumns(),
        ];
    }

    /**
     * Presets for MA item table.
     * @override
     */
    _getPresets() {
        return createItemTablePresets('ma.items.item-table.interface');
    }

    // ========================================================================
    // EXPORT FUNCTIONALITY
    // ========================================================================
}

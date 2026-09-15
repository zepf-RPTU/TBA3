/**
 * MaStudentInfoTableModule (MA) - Displays student summary information for MA
 * Includes KS level, correct answers count, and traits columns.
 */

import { BaseStudentInfoTableModule } from '../../../common/tables/baseStudentInfoTableModule.js';
import {
    createRichtigColumn,
    createKsColumn,
    createTraitsColumn,
} from '../../../common/tables/columnFactories.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';

/**
 * MaStudentInfoTableModule - MA-specific student info table
 * @augments BaseStudentInfoTableModule
 */
export class MaStudentInfoTableModule extends BaseStudentInfoTableModule {
    // Fed exclusively through the render/update payloads (see the hooks below);
    // the "Richtig (von N)" column title reads it at column-build time.
    #totalItems = 0;

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /** @override */
    _onBeforeRender(data) {
        if (data.totalItems !== undefined) {
            this.#totalItems = data.totalItems;
        }
    }

    /** @override */
    _getColumns() {
        return [
            {
                title: 'Geschlecht',
                field: 'gender',
                hozAlign: 'center',
                widthGrow: COLUMN_GROW_RATIOS.gender,
                headerSort: false,
            },
            createRichtigColumn({
                totalItems: this.#totalItems,
                headerFilter: false,
                headerSort: false,
            }),
            createKsColumn({
                headerFilter: false,
                headerSort: false,
            }),
            createTraitsColumn('Merkmale'),
        ];
    }

    /** @override */
    _buildTableData(studentData, _schuelerId) {
        // studentData.summedResult is already pre-aggregated by buildStudentRecords;
        // no need to re-filter _rawStudentArray on every render.
        return [
            {
                gender: studentData.gender || 'N/A',
                summedResult: studentData.summedResult ?? 0,
                ks: studentData.ks || 'N/A',
                traits: studentData.traits,
            },
        ];
    }
}

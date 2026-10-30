import { describe, expect, it } from 'vitest';
import { filterByCategory } from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js';
import {
    getUniqueValuesForCategory,
    resolveDefaultGroups,
} from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonControlModel.js';
import { COMPARISON_ROWS } from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js';
import { SL_DATASETS } from '../../../../../src/sl/index.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

/**
 * A comparison by Geschlecht on data without gender values has nothing to compare:
 * no invented pair, and no pair left over from the category before.
 */

const records = [
    { studentId: 's1', groupName: '8a', gender: null, mean: 3 },
    { studentId: 's2', groupName: '8b', gender: null, mean: 2 },
];

describe('gender groups without gender data', () => {
    it('splits into no groups', () => {
        expect(filterByCategory(records, 'gender', null, null)).toBeNull();
    });

    it('clears the Lerngruppe pair on a switch to Geschlecht', async () => {
        const results = [
            {
                subjectName: 'Deutsch',
                domainId: 'LV',
                studentResults: [
                    { studentId: 's1', groupName: '8a', gender: null },
                    { studentId: 's2', groupName: '8b', gender: null },
                ],
            },
        ];
        /** @type {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js').GroupComparisonSelection} */
        const selection = {
            chartType: 'competenceLevel',
            subjectIndex: 0,
            category: 'gender',
            scopeFilter: null,
            group1: '8a',
            group2: '8b',
        };
        const { documents: store } = await createSubjectContext('sl', {
            datasets: [[SL_DATASETS.DOMAIN_RESULTS, results]],
        });

        const uniqueValues = getUniqueValuesForCategory(
            store.getDataset(COMPARISON_ROWS, selection),
            selection.category,
        );

        expect(uniqueValues).toEqual([]);
        // No default pair: the chart clears both groups instead of keeping 8a/8b.
        expect(resolveDefaultGroups(uniqueValues, { category: 'gender' })).toBeNull();
    });
});

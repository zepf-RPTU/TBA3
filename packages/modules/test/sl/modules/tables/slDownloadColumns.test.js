// @vitest-browser
// slColumnBuilders pulls in the chart/theme layer at import time, which reads
// computed styles off document.documentElement.

import { describe, it, expect, afterEach } from 'vitest';
import { createSurveyMeasureColumns } from '../../../../src/sl/modules/tables/slColumnBuilders.js';
import { setDownloadFormat } from '../../../../src/common/tables/downloadNumberFormat.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';

afterEach(() => setDownloadFormat('csv'));

const STATS = { mean: 3.42, standardDeviation: 0.8163, median: 3.5, q1: 3, q3: 4, count: 22 };

describe('the export columns of createSurveyMeasureColumns', () => {
    const columns = () =>
        createSurveyMeasureColumns({
            title: 'Unterrichtsqualität',
            dataField: 'teachingQuality',
            vizModeGetter: () => 'stacked_bar',
            glossary: createTestContext('sl').glossary,
        }).slice(1);

    it('reads each statistic off the row and rounds it', () => {
        // The raw field is the whole statistics object, which the download
        // would otherwise dump as JSON — a garbage cell.
        const values = columns().map((c) =>
            required(c.accessorDownload)(undefined, { teachingQuality: STATS }),
        );
        expect(values).toEqual(['3,42', '0,82', '3,5', '3', '4', '22']);
    });

    it('exports empty cells for a row that has no such measure', () => {
        // The SL domain table's state comparison rows carry no statistics.
        // A zero there would read as a real measured value.
        for (const row of [{}, { teachingQuality: null }]) {
            expect(columns().map((c) => required(c.accessorDownload)(undefined, row))).toEqual([
                '',
                '',
                '',
                '',
                '',
                '',
            ]);
        }
    });

    it('follows the visual column so a hidden box plot takes its numbers with it', () => {
        const table = {
            getColumn: (/** @type {string} */ f) =>
                f === 'teachingQuality' ? { isVisible: () => false } : false,
        };
        expect(columns()[0].download.call(table)).toBe(false);
    });
});

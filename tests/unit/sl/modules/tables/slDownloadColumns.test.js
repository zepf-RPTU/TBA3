// @vitest-browser
// slColumnBuilders pulls in the chart/theme layer at import time, which reads
// computed styles off document.documentElement.

import { describe, it, expect, afterEach } from 'vitest';
import { createSurveyMeasureDownloadColumns } from '@tba3/modules/sl/modules/tables/slColumnBuilders.js';
import { setDownloadFormat } from '@tba3/modules/common/tables/downloadNumberFormat.js';

afterEach(() => setDownloadFormat('csv'));

const STATS = { mean: 3.42, standardDeviation: 0.8163, median: 3.5, q1: 3, q3: 4, count: 22 };

describe('createSurveyMeasureDownloadColumns', () => {
    const columns = () =>
        createSurveyMeasureDownloadColumns({
            dataField: 'teachingQuality',
            label: 'Unterrichtsqualität',
            follows: 'teaching_quality',
        });

    it('splits the box plot into the statistics it is drawn from', () => {
        expect(columns().map((c) => c.title)).toEqual([
            'Unterrichtsqualität – Mittelwert',
            'Unterrichtsqualität – SD',
            'Unterrichtsqualität – Median',
            'Unterrichtsqualität – Q1',
            'Unterrichtsqualität – Q3',
            'Unterrichtsqualität – n',
        ]);
        expect(columns().map((c) => c.field)).toEqual([
            'teachingQualityMean',
            'teachingQualitySd',
            'teachingQualityMedian',
            'teachingQualityQ1',
            'teachingQualityQ3',
            'teachingQualityCount',
        ]);
    });

    it('reads each statistic off the row and rounds it', () => {
        // WHY: the raw field is the whole statistics object, which the download
        // would otherwise dump as JSON — the "garbage cell" this change removes.
        const values = columns().map((c) =>
            c.accessorDownload(undefined, { teachingQuality: STATS }),
        );
        expect(values).toEqual(['3,42', '0,82', '3,5', '3', '4', '22']);
    });

    it('exports empty cells for a row that has no such measure', () => {
        // WHY: the SL domain table's state comparison rows carry no statistics.
        // A zero there would read as a real measured value.
        for (const row of [{}, { teachingQuality: null }]) {
            expect(columns().map((c) => c.accessorDownload(undefined, row))).toEqual([
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
            getColumn: (f) => (f === 'teaching_quality' ? { isVisible: () => false } : false),
        };
        expect(columns()[0].download.call(table)).toBe(false);
    });
});

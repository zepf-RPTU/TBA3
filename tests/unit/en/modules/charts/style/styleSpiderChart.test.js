// @vitest-browser
// (renders the real chart into a live container)

import { afterEach, describe, expect, it } from 'vitest';
import { StyleSpiderChart } from '@tba3/modules/en/modules/charts/style/styleSpiderChart.js';
import { FakeResizeService, makeVisibleChartContainer } from '../../../../support/chartHarness.js';

const enConfig = {
    domainIds: ['ho', 'le'],
    domainLabels: ['Hörverstehen', 'Leseverstehen'],
    styleCategories: [
        { value: 'global', fieldName: 'globalPercent', label: 'Global' },
        { value: 'detailliert', fieldName: 'detailliertPercent', label: 'Detailliert' },
    ],
    comparisonModeIds: [],
    assertExactlyTwoDomains() {},
};

const classStyleAverages = {
    className: '8a',
    classAverages: { ho_global: 60, ho_detailliert: 50, le_global: 70, le_detailliert: 40 },
    comparisonGroups: [],
};

// The student's row carries only the Hören `global` style.
const studentData = [
    {
        id: 's1',
        domain: { id: 'ho' },
        aggregations: [
            { type: 'Hör-/Lesestil', value: 'global', descriptiveStatistics: { mean: 0.5 } },
        ],
    },
];

afterEach(() => {
    document.body.innerHTML = '';
});

describe('StyleSpiderChart', () => {
    it("puts no student point on a spoke the student's row has no value for", async () => {
        // WHY: a missing value was drawn as 0 % — a point in the web's centre and a ring
        // collapsing onto it, read as a student who scored nothing there.
        const container = makeVisibleChartContainer('style-spider');
        container.style.width = '640px';
        container.style.height = '520px';
        const chart = new StyleSpiderChart('style-spider', studentData, 's1', 'L, A', {
            resizeService: new FakeResizeService(),
            autoResize: false,
            enConfig,
            classStyleAverages,
        });

        await chart.create();

        expect(chart.svg.selectAll('.student-point').size()).toBe(1);
        expect(chart.svg.selectAll('.class-point').size()).toBe(4);
    });
});

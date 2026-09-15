// @vitest-browser
// (renders the real chart into a live container)

import { afterEach, describe, expect, it } from 'vitest';
import { StyleLollipopChart } from '@tba3/modules/en/modules/charts/style/styleLollipopChart.js';
import { FakeResizeService, makeVisibleChartContainer } from '../../../../support/chartHarness.js';

const enConfig = {
    domainIds: ['ho', 'le'],
    domainLabels: ['Hörverstehen', 'Leseverstehen'],
    styleCategories: [
        { value: 'global', fieldName: 'globalPercent', label: 'Global' },
        { value: 'detailliert', fieldName: 'detailliertPercent', label: 'Detailliert' },
        { value: 'selektiv', fieldName: 'selektivPercent', label: 'Selektiv' },
    ],
    comparisonModeIds: ['hb'],
    assertExactlyTwoDomains() {},
};

// The class and a Landesschnitt, neither of which carries a `detailliert` value.
const styleAverages = {
    className: '8a',
    classAverages: { ho_global: 60, ho_selektiv: 70 },
    comparisonGroups: [
        {
            id: 'hb',
            type: 'state',
            name: 'Landesschnitt',
            typeIndex: 0,
            shortLabel: null,
            averages: { ho_global: 55, ho_selektiv: 65 },
        },
    ],
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('StyleLollipopChart', () => {
    it('draws no class pill and no marker for a category without a value', async () => {
        // WHY: a missing value was drawn as 0 % — a class pill and a Landesschnitt marker
        // at the axis origin, which a reader takes for a real result.
        const container = makeVisibleChartContainer('style-lollipop');
        container.style.width = '640px';
        container.style.height = '420px';
        const chart = new StyleLollipopChart('style-lollipop', [{}], null, 'ho', {
            resizeService: new FakeResizeService(),
            autoResize: false,
            enConfig,
            styleAverages,
        });

        await chart.create();

        expect(chart.svg.selectAll('.lollipop-head').size()).toBe(2);
        expect(chart.svg.selectAll('.hb-average-marker').size()).toBe(2);
    });
});

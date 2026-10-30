// @vitest-browser

import { signal } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';
import { selfEfficacyConfig } from '../../../../../src/sl/modules/charts/selfEfficacy/selfEfficacyConfig.js';
import { ChartHostModule } from '../../../../../src/common/charts/host/chartHostModule.js';
import { SelfEfficacyBoxPlot } from '../../../../../src/sl/modules/charts/selfEfficacy/selfEfficacyBoxPlot.js';
import { SelfEfficacyStackedBar } from '../../../../../src/sl/modules/charts/selfEfficacy/selfEfficacyStackedBar.js';
import { StripBarChart } from '../../../../../src/common/charts/stripBar/stripBarChart.js';
import { SL_DATASETS } from '../../../../../src/sl/slDatasets.js';
import { calculateDetailedBoxPlotStats } from '../../../../../src/sl/utils/slBoxPlotStats.js';
import {
    calculateRatingDistribution,
    getRatingCategoryDescription,
} from '../../../../../src/sl/utils/slRatingDistribution.js';
import { TERM_CONSTANTS } from '../../../../../src/common/domain/terms.js';
import { formatDecimal } from '../../../../../src/common/utils/numberFormat.js';
import { makeVisibleChartContainer, mountChart } from '../../../../support/chartHarness.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';
import { required } from '../../../../support/required.js';

const ROW = {
    groupName: '8a',
    count: 4,
    values: [1.5, 2.5, 3.5, 3.8],
    statistics: required(calculateDetailedBoxPlotStats([1.5, 2.5, 3.5, 3.8])),
    distribution: calculateRatingDistribution([1.5, 2.5, 3.5, 3.8]),
};

/**
 * The card's options for the group `8a`, over a store whose Selbstwirksamkeit index holds it.
 * @param {{thumbnail?: boolean, vizMode?: string | import('@preact/signals-core').Signal<string>}} [options]
 */
async function cardOptions({ thumbnail = false, vizMode = 'stacked_bar' } = {}) {
    return {
        context: await createSubjectContext('sl', {
            datasets: [[SL_DATASETS.SELF_EFFICACY_INDEX, new Map([['8a', ROW]])]],
        }),
        groupName: '8a',
        thumbnail,
        vizMode,
    };
}

/**
 * The card for `8a`, drawn.
 * @param {{thumbnail?: boolean, vizMode?: string}} [options]
 */
async function mountCard(options) {
    return mountChart(selfEfficacyConfig, await cardOptions(options), {
        id: 'self-efficacy-card',
        widthPx: 600,
        heightPx: 120,
    });
}

describe('selfEfficacyConfig vizMode', () => {
    it('draws the mode switched to while its first render still runs', async () => {
        // The SL overview's viz-mode switch can land on a preview while it hydrates; the
        // render that is still running must not leave the old mode drawn.
        const vizMode = signal('stacked_bar');
        const host = ChartHostModule.createChart(
            'self-efficacy-hydrating',
            selfEfficacyConfig,
            await cardOptions({ vizMode }),
        );
        makeVisibleChartContainer('self-efficacy-hydrating-frame', {
            widthPx: 600,
            heightPx: 120,
        }).append(host);

        vizMode.value = 'boxplot';
        await host.updateComplete;

        expect(host.state.vizMode.value).toBe('boxplot');
        expect(host.chart).toBeInstanceOf(SelfEfficacyBoxPlot);
    });
});

describe('selfEfficacyConfig — a single row', () => {
    it('draws a strip of named bands, each with its headcount and the group mean', async () => {
        const { chart } = await mountCard();

        expect(chart).toBeInstanceOf(StripBarChart);
        const segments = /** @type {StripBarChart} */ (chart).segments;
        expect(segments.map((segment) => segment.label)).toEqual(
            segments.map((segment) => getRatingCategoryDescription(segment.field)),
        );
        expect(segments.reduce((sum, segment) => sum + (segment.count ?? 0), 0)).toBe(4);
        expect(segments.every((segment) => segment.tooltip.title === segment.label)).toBe(true);
        expect(required(segments[0]).tooltip.footer).toEqual([
            { label: TERM_CONSTANTS.MEAN, value: formatDecimal(ROW.statistics.mean) },
        ]);
    });

    it('keeps the stacked bar as a thumbnail, and the box plot in box-plot mode', async () => {
        expect((await mountCard({ thumbnail: true })).chart).toBeInstanceOf(SelfEfficacyStackedBar);
        expect((await mountCard({ vizMode: 'boxplot' })).chart).toBeInstanceOf(SelfEfficacyBoxPlot);
    });
});

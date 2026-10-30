// @vitest-browser
// (the card draws a real SVG into a live container)

import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals-core';

import { groupDeviationConfig } from '../../../../../src/sl/modules/charts/groupDeviation/groupDeviationConfig.js';
import { ChartHostModule } from '../../../../../src/common/charts/host/chartHostModule.js';
import { buildSummaryMetricsFixture } from '../../../../support/slSchoolSummaryFixture.js';
import { makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { mountModule } from '../../../../support/dom.js';

describe('groupDeviationConfig', () => {
    it('keeps its renderer across a metric change and redraws it for the new metric', async () => {
        // A host that rebuilt the renderer per metric would re-enter every bar, drop
        // keyboard focus and re-measure a card whose size has not changed.
        const { context } = await buildSummaryMetricsFixture();
        const metricId = signal('ge_medium');
        const host = await mountModule(
            ChartHostModule.createChart('deviation-card', groupDeviationConfig, {
                context,
                subjectName: 'Deutsch',
                domainId: 'le',
                metricId,
            }),
            undefined,
            makeVisibleChartContainer('deviation-frame'),
        );
        const renderer = host.chart;
        const caption = () => host.querySelector('.school-value-caption')?.textContent;
        const before = caption();
        expect(before).toBeTruthy();

        metricId.value = 'le_low';
        await host.updateComplete;

        expect(host.chart).toBe(renderer);
        expect(caption()).toBeTruthy();
        expect(caption()).not.toBe(before);
    });

    it('draws the key that says what the bar colours mean', async () => {
        // Without it a rising orange bar and a rising blue one read alike.
        const { context } = await buildSummaryMetricsFixture();
        const host = await mountModule(
            ChartHostModule.createChart('deviation-key-card', groupDeviationConfig, {
                context,
                subjectName: 'Deutsch',
                domainId: 'le',
                metricId: signal('ge_medium'),
            }),
            undefined,
            makeVisibleChartContainer('deviation-key-frame'),
        );

        expect(host.chart?.legendPanel?.textContent).toContain('Ungünstig für die Schule');
    });
});

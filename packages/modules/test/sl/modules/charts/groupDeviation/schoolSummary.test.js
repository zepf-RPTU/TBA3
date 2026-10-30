// @vitest-browser
// The summary sizes its cards with the renderer's label geometry, whose module touches
// `window` at load.
import { describe, expect, it } from 'vitest';
import { getSchoolSummary } from '../../../../../src/sl/modules/charts/groupDeviation/schoolSummary.js';
import { DEFAULT_SUMMARY_METRIC_ID } from '../../../../../src/sl/index.js';
import { buildSummaryMetricsFixture } from '../../../../support/slSchoolSummaryFixture.js';
import { signal } from '@preact/signals-core';

/**
 * Every Überblick card and the view read the same summary for a selection, so the shared
 * y domain and label band come from one computation. The memo key is the selection,
 * normalised: an unknown metric id must not fork it.
 */
/**
 * A comparison state with these averages on.
 * @param {string[]} ids
 * @returns {any} The state, as far as the summary reads it.
 */
const activeModes = (ids) => ({ activeModes: signal(ids) });

describe('getSchoolSummary', () => {
    it('folds an unknown metric id onto the default, and every-average onto its own key', async () => {
        const { documents } = await buildSummaryMetricsFixture();

        const byDefault = getSchoolSummary(documents, {
            metricId: 'gibt-es-nicht',
        });

        expect(byDefault.metric.id).toBe(DEFAULT_SUMMARY_METRIC_ID);
        expect(getSchoolSummary(documents, { metricId: DEFAULT_SUMMARY_METRIC_ID })).toBe(
            byDefault,
        );
        expect(
            getSchoolSummary(documents, {
                metricId: DEFAULT_SUMMARY_METRIC_ID,
                comparisonState: activeModes([]),
            }),
        ).not.toBe(byDefault);
    });
});

describe('getSchoolSummary — the ⌀ toggles', () => {
    it('builds the rows once per metric and only filters them per selection', async () => {
        const { documents } = await buildSummaryMetricsFixture();

        const all = getSchoolSummary(documents, {
            metricId: DEFAULT_SUMMARY_METRIC_ID,
        });
        const none = getSchoolSummary(documents, {
            metricId: DEFAULT_SUMMARY_METRIC_ID,
            comparisonState: activeModes([]),
        });

        expect(none.rows.map((row) => row.rowLabel)).toEqual(all.rows.map((row) => row.rowLabel));
        expect(none.rows.flatMap((row) => row.entries).every((e) => e.kind === 'group')).toBe(true);
        // The ⌀ menu still offers every delivered average.
        expect(none.averages).toBe(all.averages);
    });
});

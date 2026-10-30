// @vitest-browser

import { describe, expect, it } from 'vitest';
import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { itemSuccessLollipopConfig } from '../../../../src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopConfig.js';
import { ItemSuccessLollipopChart } from '../../../../src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopChart.js';
import { itemRecord } from '../../../support/groupDocumentStoreFixture.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
    mountChart,
} from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

/**
 * An MA group context whose items.json carries a Landesschnitt with a mean for one item.
 * @returns {Promise<import('../../../../src/common/context/index.js').ModuleContext>}
 */
async function contextWithStateAverage() {
    return createSubjectContext('ma', {
        documents: {
            'items.json': [
                {
                    id: 'state',
                    type: 'state',
                    name: 'Landesschnitt',
                    domain: { id: 'zahlen', name: 'Zahlen und Operationen' },
                    items: [itemRecord('i1', 0.5, { name: '1.1', exercise: 'Aufgabe 1' })],
                },
            ],
        },
    });
}

class QueuedRefreshProbeChart extends ChartRenderer {
    renderCalls = 0;

    /** @override */
    validateData() {
        return true;
    }

    /** @override */
    renderChart() {
        this.renderCalls += 1;
        // A render that changes state asks for another pass while this one runs.
        if (this.renderCalls === 1) this.refresh();
    }
}

describe('chart average refresh lifecycle', () => {
    it('queues a refresh requested during an active render', async () => {
        const container = makeVisibleChartContainer('queued-refresh-chart');
        const chart = new QueuedRefreshProbeChart(container, {
            context: createTestContext('en'),
        });

        chart.create();

        // The request made mid-pass runs exactly one follow-up pass, rather than
        // being dropped (stale chart) or re-entering the active one.
        expect(chart.renderCalls).toBe(2);
    });

    it('MA item-success renderer reads the comparison state, now and after a toggle', async () => {
        const comparisonState = comparisonStateShowing(['state']);
        const host = await mountChart(
            itemSuccessLollipopConfig,
            { comparisonState, context: await contextWithStateAverage() },
            { id: 'ma-item-lollipop' },
        );
        const chart = /** @type {ItemSuccessLollipopChart} */ (host.chart);
        expect(chart).toBeInstanceOf(ItemSuccessLollipopChart);

        // A renderer reads the comparison state — a recreated one (theme change) shows
        // what the app shows — and follows a toggle, keyed like the competence-level chart's groups.
        expect(chart.visibilityState.state).toBe(true);
        comparisonState.setActive('state', false);
        expect(chart.visibilityState.state).toBe(false);
        await host.rerender();
        expect(host.chart).not.toBe(chart);
        expect(/** @type {ItemSuccessLollipopChart} */ (host.chart).visibilityState.state).toBe(
            false,
        );
    });
});

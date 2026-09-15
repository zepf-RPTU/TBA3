// @vitest-browser

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartHostModule } from '@tba3/modules/common/charts/host/chartHostModule.js';
import { ChartRenderer } from '@tba3/modules/common/charts/renderers/chartRenderer.js';
import { itemSuccessLollipopConfig } from '@tba3/modules/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopConfig.js';

function makeVisibleChartContainer(id = 'chart') {
    const container = document.createElement('div');
    container.id = id;
    document.body.appendChild(container);
    Object.defineProperty(container, 'offsetParent', {
        configurable: true,
        get: () => document.body,
    });
    return container;
}

class QueuedRefreshProbeChart extends ChartRenderer {
    renderCalls = 0;
    /** Settles when the refresh requested during pass 1 resolves. */
    queuedRefreshSettled = Promise.resolve();
    /** renderCalls at the moment that request's `await refresh()` resumed. */
    renderCallsWhenQueuedResolved = 0;

    validateData() {
        return true;
    }

    async renderChart() {
        this.renderCalls += 1;

        if (this.renderCalls === 1) {
            // Deliberately not awaited. A mid-render refresh request comes from
            // outside the pass (a state change, a resize callback, a legend
            // toggle); refresh() resolves only once the pass it queued behind has
            // finished, so awaiting it *here* would make the pass wait on itself.
            this.queuedRefreshSettled = this.refresh().then(() => {
                this.renderCallsWhenQueuedResolved = this.renderCalls;
            });
        }
    }
}

describe('chart average refresh lifecycle', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('queues a refresh requested during an active render', async () => {
        makeVisibleChartContainer('queued-refresh-chart');
        const chart = new QueuedRefreshProbeChart('queued-refresh-chart');

        await chart.create();

        // The request made mid-pass runs exactly one follow-up pass, rather than
        // being dropped (stale chart) or re-entering the active one.
        expect(chart.renderCalls).toBe(2);

        // ...and it resolves only once that follow-up has actually rendered:
        // callers await refresh() to read the re-rendered chart (min-height
        // measurement, export, ChartHostModule.refreshCharts).
        await chart.queuedRefreshSettled;
        expect(chart.renderCallsWhenQueuedResolved).toBe(2);
    });

    it('MA item-success renderer reads average visibility from the comparison state, live', () => {
        makeVisibleChartContainer('ma-item-lollipop');
        const active = { state: true };
        const comparisonState = {
            getActiveModes: () => Object.keys(active).filter((id) => active[id]),
            isActive: (id) => Boolean(active[id]),
            setActive: vi.fn(),
            subscribe: () => () => {},
        };
        const options = {
            comparisonState,
            averages: [
                {
                    id: 'state',
                    label: 'Landesschnitt',
                    color: 'state',
                    shape: 'square',
                    generator: () => [],
                },
            ],
        };
        const host = {
            id: 'ma-item-lollipop',
            configState: {},
            getOption: (key) => options[key],
        };

        const chart = itemSuccessLollipopConfig.createRenderer(host, { itemArray: [] });

        // The comparison state is the only owner of "is this average drawn?" — the KS
        // chart's groups follow the same keys. A recreated renderer (theme change,
        // resize) answers from it rather than from a copy taken at construction, so a
        // later write must show through without a re-register.
        expect(chart.isAverageVisible('state')).toBe(true);
        active.state = false;
        expect(chart.isAverageVisible('state')).toBe(false);
    });

    it('MA item-success renderer draws every average when the host supplies no state', () => {
        // WHY: no state is no opinion, so a consumer that passes averages and nothing
        // else sees them. tba3 always supplies one, so only this pins the branch.
        makeVisibleChartContainer('ma-item-lollipop-stateless');
        const options = {
            averages: [
                {
                    id: 'state',
                    label: 'Landesschnitt',
                    color: 'state',
                    shape: 'square',
                    generator: () => [],
                },
            ],
        };
        const host = {
            id: 'ma-item-lollipop-stateless',
            configState: {},
            getOption: (key) => options[key],
        };

        const chart = itemSuccessLollipopConfig.createRenderer(host, { itemArray: [] });

        expect(chart.isAverageVisible('state')).toBe(true);
    });

    it('refreshes initialized chart hosts when an already-rendered module is expanded', async () => {
        const container = document.createElement('section');
        container.id = 'expand-refresh-host';
        document.body.appendChild(container);
        const chart = {
            create: vi.fn(),
            destroy: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
        };

        const host = new ChartHostModule(
            'expand-refresh-host',
            container,
            {
                createRenderer: () => chart,
            },
            {
                showModuleTitle: true,
                title: 'Chart',
                collapsible: true,
                startCollapsed: true,
                waitForStableLayout: false,
            },
        );

        host.mount({});
        await host.hydrate({});
        expect(chart.refresh).not.toHaveBeenCalled();

        host.expand();

        expect(chart.refresh).toHaveBeenCalledTimes(1);
        host.destroy();
    });
});

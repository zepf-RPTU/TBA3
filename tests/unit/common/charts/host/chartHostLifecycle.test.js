// @vitest-browser

/**
 * ChartHostModule render-cycle contract — pins the staleness ladder in
 * _doRenderContent and the deferred-hydration retry path:
 *
 *  - a renderer resolved for a superseded render cycle is destroyed exactly
 *    once and never create()d (the leak class behind the multi-chart
 *    whenSettled fixes)
 *  - a renderer resolving after host.destroy() is likewise torn down
 *  - a failed deferred first hydrate re-arms, so a later expand retries
 *
 * Fake renderers are plain spy objects per the chartAverageRefresh.test.js
 * recipe; `waitForStableLayout: false` short-circuits the rAF/font plumbing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartHostModule } from '@tba3/modules/common/charts/host/chartHostModule.js';

function makeFakeRenderer() {
    return {
        create: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
    };
}

function makeHostContainer(id) {
    const container = document.createElement('section');
    container.id = id;
    document.body.appendChild(container);
    return container;
}

const HOST_OPTIONS = {
    showModuleTitle: true,
    title: 'Chart',
    waitForStableLayout: false,
};

describe('ChartHostModule render-cycle staleness', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('destroys a renderer resolved for a superseded cycle exactly once and keeps the current one', async () => {
        const container = makeHostContainer('stale-cycle-host');
        const staleChart = makeFakeRenderer();
        const freshChart = makeFakeRenderer();
        let resolveFirstCreate;
        const createRenderer = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveFirstCreate = resolve;
                    }),
            )
            .mockImplementationOnce(() => freshChart);

        const host = new ChartHostModule(
            'stale-cycle-host',
            container,
            { createRenderer },
            HOST_OPTIONS,
        );
        host.mount({});

        const firstRender = host.hydrate({}); // cycle 1 — blocked in createRenderer
        const secondRender = host.rerender({}); // cycle 2 — supersedes cycle 1
        await secondRender;
        resolveFirstCreate(staleChart);
        await firstRender;

        // The stale result was never stored in the host, so the host must tear
        // it down itself — exactly once — and must never create() it.
        expect(staleChart.destroy).toHaveBeenCalledTimes(1);
        expect(staleChart.create).not.toHaveBeenCalled();
        expect(freshChart.create).toHaveBeenCalledTimes(1);
        expect(freshChart.destroy).not.toHaveBeenCalled();

        host.destroy();
        // Host teardown destroys the live chart once and never re-touches the stale one.
        expect(freshChart.destroy).toHaveBeenCalledTimes(1);
        expect(staleChart.destroy).toHaveBeenCalledTimes(1);
    });

    it('destroys a renderer that resolves after host.destroy() and never create()s it', async () => {
        const container = makeHostContainer('destroyed-host');
        const staleChart = makeFakeRenderer();
        let resolveCreate;
        const createRenderer = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveCreate = resolve;
                }),
        );

        const host = new ChartHostModule(
            'destroyed-host',
            container,
            { createRenderer },
            HOST_OPTIONS,
        );
        host.mount({});

        const render = host.hydrate({});
        host.destroy();
        resolveCreate(staleChart);
        await render;

        expect(staleChart.destroy).toHaveBeenCalledTimes(1);
        expect(staleChart.create).not.toHaveBeenCalled();
    });

    it('re-arms deferred hydration after a failed first expand so the next expand retries', async () => {
        const container = makeHostContainer('deferred-retry-host');
        const chart = makeFakeRenderer();
        const createRenderer = vi
            .fn()
            .mockImplementationOnce(() => {
                throw new Error('first hydrate fails');
            })
            .mockImplementationOnce(() => chart);

        const host = new ChartHostModule(
            'deferred-retry-host',
            container,
            { createRenderer },
            {
                ...HOST_OPTIONS,
                collapsible: true,
                startCollapsed: true,
                deferHydrationUntilExpand: true,
            },
        );

        host.mount({});
        await host.hydrate({});
        // Deferred: the expensive first render waits for the first expand.
        expect(createRenderer).not.toHaveBeenCalled();

        // The failed hydrate is fired-and-logged by expand(); silence the log.
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        host.expand();
        await vi.waitFor(() => expect(createRenderer).toHaveBeenCalledTimes(1));
        // The rejection propagates through the retry re-arm asynchronously —
        // flush a macrotask so the failure has fully settled before re-expanding.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(host.initialized).toBe(false);
        expect(chart.create).not.toHaveBeenCalled();
        errorSpy.mockRestore();

        // Collapse and expand again: the pending flag must have been re-armed,
        // otherwise the module stays permanently empty after one bad fetch.
        host.collapse();
        host.expand();
        await vi.waitFor(() => expect(chart.create).toHaveBeenCalledTimes(1));

        expect(createRenderer).toHaveBeenCalledTimes(2);
        expect(host.initialized).toBe(true);
        host.destroy();
    });
});

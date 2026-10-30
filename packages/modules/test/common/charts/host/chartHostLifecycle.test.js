// @vitest-browser

/**
 * ChartHostModule render-cycle contract — pins the staleness ladder of its render
 * cycles, the settle promise and the collapsed first render:
 *
 *  - a superseded cycle never tears down the renderers of the cycle that
 *    replaced it
 *  - updateComplete waits for the newest cycle, and a rerender that succeeds clears
 *    the failure of the cycle it replaced
 *  - a collapsed host still runs its whole cycle and repaints on expand
 *
 * Fake renderers are plain spy objects; a test holds a cycle in its layout wait by
 * stubbing the host's `_whenLaidOut()`.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeFakeRenderer } from '../../../support/chartHarness.js';
import { ChartHostModule } from '../../../../src/common/charts/host/chartHostModule.js';
import { ChartRenderer as ChartRendererClass } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { renderChartMessage } from '../../../../src/common/charts/chartMessage.js';
import { mountModule } from '../../../support/dom.js';
import { required } from '../../../support/required.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { batch, signal } from '@preact/signals-core';
import { html } from 'lit';

/** @typedef {import('../../../../src/common/charts/renderers/chartRenderer.js').ChartRenderer} ChartRenderer */

// No config here reads a document, so the context's store is empty.
const HOST_OPTIONS = {
    // The ⌀ dropdown names itself from the glossary.
    context: createTestContext(),
    showModuleTitle: true,
    title: 'Chart',
};

/**
 * Hold the host's layout wait: the calls numbered in `held` (1-based) wait until
 * released, every other call returns at once.
 * @param {ChartHostModule} host
 * @param {number[]} [held]
 * @returns {{layoutWait: import('vitest').MockInstance, release: (call?: number) => void}} `release` frees one held call, the first by default.
 */
function heldLayoutWait(host, held = [1]) {
    /** @type {Map<number, () => void>} */
    const releases = new Map();
    let calls = 0;
    const layoutWait = vi.spyOn(host, '_whenLaidOut').mockImplementation(() => {
        calls += 1;
        if (!held.includes(calls)) return null;
        const call = calls;
        return new Promise((resolve) => {
            releases.set(call, () => resolve(undefined));
        });
    });
    return { layoutWait, release: (call = held[0]) => releases.get(call)?.() };
}

describe('ChartHostModule render-cycle staleness', () => {
    it('leaves the newer cycle renderers alive when a superseded cycle bails after its layout wait', async () => {
        const firstChart = makeFakeRenderer();
        const secondChart = makeFakeRenderer();
        const createRenderer = vi
            .fn()
            .mockImplementationOnce(() => firstChart)
            .mockImplementationOnce(() => secondChart);
        const host = ChartHostModule.createChart('overlap-host', { createRenderer }, HOST_OPTIONS);
        const { layoutWait, release } = heldLayoutWait(host);

        // Cycle 1 holds in its layout wait while cycle 2 installs and creates its renderer.
        const firstRender = mountModule(host, {});
        await vi.waitFor(() => expect(layoutWait).toHaveBeenCalled());
        await host.rerender();
        release();
        await firstRender;

        expect(host.charts).toEqual([secondChart]);
        expect(firstChart.create).not.toHaveBeenCalled();
        expect(secondChart.destroy).not.toHaveBeenCalled();
        expect(firstChart.destroy).toHaveBeenCalledTimes(1);
    });

    it('keeps the drawn renderer until the next one is created, and is busy meanwhile', async () => {
        // Destroying the old chart before the new cycle's layout wait blanks the card
        // for those frames.
        const drawnChart = makeFakeRenderer();
        const nextChart = makeFakeRenderer();
        const createRenderer = vi
            .fn()
            .mockImplementationOnce(() => drawnChart)
            .mockImplementationOnce(() => nextChart);
        const host = ChartHostModule.createChart('handover-host', { createRenderer }, HOST_OPTIONS);
        const { layoutWait, release } = heldLayoutWait(host, [2]);
        await mountModule(host, {});
        expect(host.hasAttribute('aria-busy')).toBe(false);

        const rerender = host.rerender();
        await vi.waitFor(() => expect(layoutWait).toHaveBeenCalledTimes(2));
        expect(drawnChart.destroy).not.toHaveBeenCalled();
        expect(host.getAttribute('aria-busy')).toBe('true');

        release();
        await rerender;
        await host.updateComplete;
        expect(vi.mocked(drawnChart.destroy).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(nextChart.create).mock.invocationCallOrder[0],
        );
        expect(host.hasAttribute('aria-busy')).toBe(false);
    });

    it('tells a renderer built for another rebuildOn result before its own effect runs', async () => {
        // The renderers check it from their state effect, which may run before the host's
        // rebuildOn effect: the answer must not wait for the rebuild.
        const mode = signal('ho');
        const createRenderer = vi.fn(() => makeFakeRenderer());
        const host = await mountModule(
            ChartHostModule.createChart(
                'build-host',
                { createRenderer, rebuildOn: () => mode.value === 'all' },
                HOST_OPTIONS,
            ),
            {},
        );
        const drawn = required(host.chart);

        batch(() => {
            mode.value = 'le';
            expect(host.isCurrentBuild(drawn)).toBe(true);
            mode.value = 'all';
            expect(host.isCurrentBuild(drawn)).toBe(false);
        });
        await vi.waitFor(() => expect(host.chart).not.toBe(drawn));
        expect(host.isCurrentBuild(required(host.chart))).toBe(true);
    });

    it('shows the failure sentence, not the replaced renderer, when the newest cycle fails', async () => {
        // A renderer left standing would keep showing what the failed cycle replaced.
        const drawnChart = makeFakeRenderer();
        const nextChart = makeFakeRenderer();
        const createRenderer = vi
            .fn()
            .mockImplementationOnce(() => drawnChart)
            .mockImplementationOnce(() => {
                throw new Error('createRenderer exploded');
            })
            .mockImplementationOnce(() => nextChart);
        const host = await mountModule(
            ChartHostModule.createChart('failing-host', { createRenderer }, HOST_OPTIONS),
            {},
        );
        const failure = () => host.contentContainer.querySelector('.chart-message--error');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        // No content pass follows a failed rerender: the host withdraws the export itself.
        const exportSync = vi.spyOn(host, 'syncExportControls');

        await host.rerender();
        expect(drawnChart.destroy).toHaveBeenCalledTimes(1);
        expect(host.charts).toEqual([]);
        expect(failure()).not.toBeNull();
        expect(exportSync).toHaveBeenCalledTimes(1);

        await host.rerender();
        expect(failure()).toBeNull();
        expect(nextChart.create).toHaveBeenCalledTimes(1);
    });

    it('settles with a rerender that succeeds after the first cycle failed', async () => {
        // The card now shows a good chart: an awaiter (a view's reveal, an export) must
        // not still see the failed cycle.
        const createRenderer = vi
            .fn()
            .mockImplementationOnce(() => {
                throw new Error('createRenderer exploded');
            })
            .mockImplementationOnce(() => makeFakeRenderer());
        const host = ChartHostModule.createChart(
            'recovering-host',
            { createRenderer },
            HOST_OPTIONS,
        );
        host.data = {};
        document.body.append(host);
        await expect(host.contentComplete).rejects.toThrow('createRenderer exploded');

        await host.rerender();

        await expect(host.contentComplete).resolves.toBeUndefined();
        await expect(host.updateComplete).resolves.toBe(true);
        expect(host.initialized).toBe(true);
        expect(host.hasAttribute('aria-busy')).toBe(false);
        expect(host.contentContainer.querySelector('.chart-message--error')).toBeNull();
    });

    it('keeps the message a descriptor shows instead of a renderer', async () => {
        // A card with nothing to draw says so itself and returns no renderer.
        const host = await mountModule(
            ChartHostModule.createChart(
                'empty-host',
                {
                    createRenderer: (chartHost) => {
                        renderChartMessage(chartHost.chartArea, { text: 'Keine Daten' });
                        return null;
                    },
                },
                HOST_OPTIONS,
            ),
            {},
        );

        expect(host.contentContainer.querySelector('.chart-message')?.textContent).toBe(
            'Keine Daten',
        );
    });

    it('leaves exactly one live renderer after back-to-back rerenders', async () => {
        const createRenderer = vi.fn(() => makeFakeRenderer());
        const host = await mountModule(
            ChartHostModule.createChart('burst-host', { createRenderer }, HOST_OPTIONS),
            {},
        );

        await Promise.all([host.rerender(), host.rerender()]);

        const renderers = createRenderer.mock.results.map((result) => result.value);
        const live = renderers.filter((chart) => vi.mocked(chart.destroy).mock.calls.length === 0);
        expect(live).toEqual(host.charts);
        expect(live).toHaveLength(1);
    });

    it('rerender() does nothing before the host connects or after it tore down', async () => {
        const createRenderer = vi.fn(() => makeFakeRenderer());
        const host = ChartHostModule.createChart('guard-host', { createRenderer }, HOST_OPTIONS);

        await host.rerender();
        expect(createRenderer).not.toHaveBeenCalled();

        await mountModule(host, {});
        host.remove();
        await Promise.resolve();
        createRenderer.mockClear();
        await host.rerender();
        expect(createRenderer).not.toHaveBeenCalled();
    });

    it('rerender() from connect on supersedes a first render still in flight', async () => {
        // A verb called while the first render runs (the SL overview's viz-mode
        // switch during hydrate) must win over the cycle that already read the old state.
        const createRenderer = vi.fn(
            /** @type {(host: unknown) => ChartRenderer} */ (() => makeFakeRenderer()),
        );
        const host = ChartHostModule.createChart(
            'supersede-host',
            { createRenderer },
            HOST_OPTIONS,
        );
        const { layoutWait, release } = heldLayoutWait(host);

        const firstRender = mountModule(host, {});
        await vi.waitFor(() => expect(layoutWait).toHaveBeenCalled());
        await host.rerender();
        release();
        await firstRender;

        expect(createRenderer).toHaveBeenCalledTimes(2);
        expect(host.charts).toEqual([createRenderer.mock.results[1].value]);
    });

    it('rerender() logs a failed cycle instead of rejecting', async () => {
        const error = new Error('boom');
        const createRenderer = vi
            .fn()
            .mockImplementationOnce(() => makeFakeRenderer())
            .mockImplementationOnce(() => {
                throw error;
            });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const host = await mountModule(
            ChartHostModule.createChart('failing-host', { createRenderer }, HOST_OPTIONS),
            {},
        );

        await expect(host.rerender()).resolves.toBeUndefined();
        expect(consoleError).toHaveBeenCalledWith(
            'ChartHostModule[failing-host]: rerender failed:',
            error,
        );
    });

    it('settles only once the newest render cycle has finished', async () => {
        const createRenderer = vi.fn(() => makeFakeRenderer());
        const host = ChartHostModule.createChart('settle-host', { createRenderer }, HOST_OPTIONS);
        const { layoutWait, release } = heldLayoutWait(host, [1, 2]);
        host.data = {};
        document.body.append(host);

        let settled = false;
        const settling = host.updateComplete.then(() => {
            settled = true;
        });
        await vi.waitFor(() => expect(layoutWait).toHaveBeenCalledTimes(1));
        // The second cycle starts while the first is in flight.
        const secondRender = host.rerender();
        await vi.waitFor(() => expect(layoutWait).toHaveBeenCalledTimes(2));
        release(1);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(settled).toBe(false);

        release(2);
        await secondRender;
        await settling;
        expect(settled).toBe(true);
    });

    it('settles for a capture once the rerender cycle in flight has created its renderer', async () => {
        // Until then the card still shows the chart the cycle replaces (a Box-Plot ↔
        // Balken switch): a capture cloned meanwhile (it waits for `whenSettled()`)
        // would show the old chart.
        const createRenderer = vi.fn(() => makeFakeRenderer());
        const host = ChartHostModule.createChart(
            'capture-in-flight-host',
            { createRenderer },
            HOST_OPTIONS,
        );
        const { layoutWait, release } = heldLayoutWait(host, [2]);
        await mountModule(host, {});

        const rerender = host.rerender();
        await vi.waitFor(() => expect(layoutWait).toHaveBeenCalledTimes(2));
        const restore = host.prepareExportCapture();
        let settled = false;
        const settling = host.whenSettled().then(() => {
            settled = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(settled).toBe(false);

        release();
        await rerender;
        await settling;
        restore();
        expect(createRenderer.mock.results[1].value.create).toHaveBeenCalledTimes(1);
    });

    it('pins its cloned body to its height on screen, unless the body scrolls', async () => {
        // The renderers size the SVG to the body (height:100%), which the capture stage
        // lets grow to its content: unpinned, the chart would rasterize collapsed.
        const host = await mountModule(
            ChartHostModule.createChart(
                'pin-host',
                { createRenderer: makeFakeRenderer },
                HOST_OPTIONS,
            ),
            {},
        );
        const body = host.contentContainer;
        /**
         * @param {number} scrollHeight - The body's content height.
         * @returns {string} The clone body's inline height after the fix-up.
         */
        const pinnedHeight = (scrollHeight) => {
            Object.defineProperty(body, 'clientHeight', { value: 320, configurable: true });
            Object.defineProperty(body, 'scrollHeight', {
                value: scrollHeight,
                configurable: true,
            });
            const copy = document.createElement('div');
            host.prepareExportClone((live) => (live === body ? copy : null));
            return copy.style.height;
        };

        expect(pinnedHeight(320)).toBe('320px');
        expect(pinnedHeight(900)).toBe('');
    });

    it('builds a collapsed host in full, header hooks and export target included, and draws it on expand', async () => {
        // The header controls (the ⌀ dropdown) come from the render cycle and the export
        // target from the renderer set, so a collapsed card must still run the whole
        // cycle; only the renderer's own draw waits for a box.
        const chart = makeFakeRenderer();
        const comparisonState = {
            activeModes: signal(['state']),
            isActive: () => true,
            setActive: vi.fn(),
        };
        const host = await mountModule(
            ChartHostModule.createChart(
                'collapsed-host',
                {
                    createRenderer: () => chart,
                    comparisonModes: () => [{ id: 'state', label: 'Landesschnitt' }],
                },
                {
                    ...HOST_OPTIONS,
                    collapsible: true,
                    comparisonState,
                },
            ),
            {},
        );

        // Shown the way its view shows it; folded, it stays hidden.
        host.collapse();
        host.show();
        expect(host.visible).toBe(false);
        expect(chart.create).toHaveBeenCalledTimes(1);
        expect(
            host.querySelector(
                '.content-module-header-actions .header-action-dropdown-wrapper:has(> [data-header-action-button="comparison"])',
            ),
        ).not.toBeNull();
        expect(host._getExportType()).toBe('visual');
        expect(chart.drawMeasured).not.toHaveBeenCalled();

        host.expand();
        expect(host.visible).toBe(true);
        expect(chart.drawMeasured).toHaveBeenCalledTimes(1);
    });

    it('measures every chart it shows before it draws any', async () => {
        // A grid of N charts coming on screen together would otherwise force N
        // layouts, one per chart's measure after the previous chart's draw.
        const charts = [makeFakeRenderer(), makeFakeRenderer()];
        const host = await mountModule(
            ChartHostModule.createChart(
                'batched-host',
                { createRenderer: () => charts },
                { ...HOST_OPTIONS, collapsible: true },
            ),
            {},
        );
        host.collapse();
        host.show();

        host.expand();

        const order = (/** @type {any} */ mock) => mock.mock.invocationCallOrder[0];
        const lastMeasure = Math.max(...charts.map((chart) => order(chart.measureIfStale)));
        const firstDraw = Math.min(...charts.map((chart) => order(chart.drawMeasured)));
        expect(lastMeasure).toBeLessThan(firstDraw);
    });

    it('draws a chart that never had room before it is captured, and re-collapses the card', async () => {
        // A collapsed body is display:none, so the renderer had nothing to
        // measure and drew nothing. Exporting the card as it stands would put an
        // empty rectangle in the report.
        const chart = makeFakeRenderer();
        const host = await mountModule(
            ChartHostModule.createChart(
                'capture-host',
                { createRenderer: () => chart },
                { ...HOST_OPTIONS, collapsible: true },
            ),
            {},
        );
        host.collapse();
        host.show();
        expect(chart.drawMeasured).not.toHaveBeenCalled();

        const restore = host.prepareExportCapture();
        await host.whenSettled();
        expect(host.classList.contains('collapsed')).toBe(false);
        expect(chart.drawMeasured).toHaveBeenCalledTimes(1);

        restore();
        expect(host.classList.contains('collapsed')).toBe(true);
        expect(host.visible).toBe(false);
    });
});

describe('ChartHostModule documents', () => {
    it('builds no renderer until the documents its descriptor names have landed', async () => {
        // The content pass ensures the descriptor's documents; a rebuild asked for
        // while they load (a state the descriptor rebuilds on) must not read a store that
        // does not hold them yet. The pass's own cycle draws the state as it is then.
        let land = () => {};
        const ensure = vi.fn(
            () =>
                new Promise((resolve) => {
                    land = () => resolve(undefined);
                }),
        );
        const createRenderer = vi.fn(() => makeFakeRenderer());
        const host = ChartHostModule.createChart(
            'documents-host',
            { createRenderer, documents: ['items.json'] },
            {
                ...HOST_OPTIONS,
                context: {
                    ...HOST_OPTIONS.context,
                    // Cast once: the host reads only `ensure` of the store.
                    documents:
                        /** @type {import('../../../../src/common/data/documentStore.js').DocumentStore} */ (
                            /** @type {unknown} */ ({ ensure })
                        ),
                },
            },
        );

        const mounted = mountModule(host, {});
        await vi.waitFor(() => expect(ensure).toHaveBeenCalledWith(['items.json']));
        await host.rerender();
        expect(createRenderer).not.toHaveBeenCalled();

        land();
        await mounted;
        expect(createRenderer).toHaveBeenCalledTimes(1);
    });
});

describe('ChartHostModule thumbnail and body controls', () => {
    it('shows a thumbnail without a card, an export target or a layout wait', async () => {
        // A watermark inside an overview card is a picture: the card around it owns
        // the frame and the size, and it is never exported on its own.
        const createRenderer = vi.fn(() => makeFakeRenderer());
        const host = ChartHostModule.createChart(
            'thumbnail-host',
            { createRenderer },
            { ...HOST_OPTIONS, showModuleTitle: false, thumbnail: true },
        );
        const layoutWait = vi.spyOn(host, '_whenLaidOut');
        await mountModule(host, {});

        expect(createRenderer).toHaveBeenCalledTimes(1);
        expect(layoutWait).not.toHaveBeenCalled();
        expect(host.classList.contains('module-container')).toBe(false);
        expect(host.options.enableModuleExport).toBe(false);
    });

    it('draws into the area under its controls strip, which follows the signals it reads', async () => {
        const label = signal('Erste');
        /** @type {HTMLElement[]} */
        const containers = [];
        const host = await mountModule(
            ChartHostModule.createChart(
                'controls-host',
                {
                    bodyControls: () => html`<select aria-label=${label.value}></select>`,
                    createRenderer: (/** @type {ChartHostModule} */ chartHost) => {
                        containers.push(chartHost.chartArea);
                        return makeFakeRenderer();
                    },
                },
                HOST_OPTIONS,
            ),
            {},
        );
        const select = host.contentContainer.querySelector('select');

        expect(containers[0]).not.toBe(host.contentContainer);
        expect(containers[0].parentElement).toBe(host.contentContainer);
        expect(select?.getAttribute('aria-label')).toBe('Erste');

        label.value = 'Zweite';
        await host.rerender();
        // The same node, so a keyboard user's focus stays on it.
        expect(host.contentContainer.querySelector('select')).toBe(select);
        expect(select?.getAttribute('aria-label')).toBe('Zweite');
        expect(containers[1]).toBe(containers[0]);
    });

    it('destroys its controller when it tears down', async () => {
        const destroy = vi.fn();
        const host = await mountModule(
            ChartHostModule.createChart(
                'controller-host',
                { createRenderer: () => makeFakeRenderer(), createController: () => ({ destroy }) },
                HOST_OPTIONS,
            ),
            {},
        );
        expect(destroy).not.toHaveBeenCalled();

        host.remove();
        await Promise.resolve();
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});

/** A chart with a key over its plot: the frame a successor would draw into. */
class KeyedChart extends ChartRendererClass {
    /** @override */
    chartKey() {
        return [{ items: [{ label: 'Lerngruppe' }] }];
    }

    /** @override */
    renderChart() {
        this.createSVGElement(300, 200).append('circle').attr('r', 5);
    }
}

describe('ChartHostModule frees the chart area no renderer follows into', () => {
    /**
     * A host whose first cycle draws a keyed chart and whose next cycle runs `next`.
     * @param {(host: ChartHostModule) => ChartRenderer|null} next
     */
    async function afterKeyedChart(next) {
        let cycle = 0;
        const host = await mountModule(
            ChartHostModule.createChart(
                'keyed-host',
                {
                    createRenderer: (chartHost) =>
                        cycle++ === 0
                            ? new KeyedChart(chartHost.chartArea, {
                                  ...chartHost.rendererOptions,
                                  legend: 'top',
                              })
                            : next(chartHost),
                },
                HOST_OPTIONS,
            ),
            {},
        );
        expect(host.chartArea.classList.contains('chart-with-key')).toBe(true);
        expect(host.chartArea.querySelector('.chart-legend-panel')).not.toBeNull();
        return host;
    }

    it('leaves no frame, only the message, after a cycle that yields no renderer', async () => {
        const host = await afterKeyedChart((chartHost) => {
            renderChartMessage(chartHost.chartArea, { text: 'Keine Daten' });
            return null;
        });

        await host.rerender();

        expect(host.chartArea.classList.contains('chart-with-key')).toBe(false);
        expect([...host.chartArea.children].map((child) => child.className)).toEqual([
            'chart-message',
        ]);
    });

    it('leaves only the failure sentence after a cycle that throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const host = await afterKeyedChart(() => {
            throw new Error('createRenderer exploded');
        });

        await host.rerender();

        expect(host.chartArea.classList.contains('chart-with-key')).toBe(false);
        expect([...host.chartArea.children].map((child) => child.className)).toEqual([
            'chart-message chart-message--error',
        ]);
    });
});

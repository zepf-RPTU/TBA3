// @vitest-browser

/**
 * ChartRenderer lifecycle contract: the interleavings of render, resize and destroy that
 * the host/renderer seam relies on (vanishing averages, leaked observers and layout thrash
 * when they break).
 */
import { createState, resizeService } from '@tba3/module-base';
import { signal } from '@preact/signals-core';
import * as d3 from 'd3';
import { describe, expect, it, vi } from 'vitest';
import { fadeOutAndRemove, MOTION } from '../../../../src/common/charts/motionPreference.js';
import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { cursorTooltip } from '../../../../src/common/services/cursorTooltip.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
} from '../../../support/chartHarness.js';
import { nextAnimationFrames } from '../../../support/dom.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
// The key layout the auto placement measures: entries at their own width, not as blocks.
import '../../../../styles/html-legend-panel.css';
import { required } from '../../../support/required.js';

class LifecycleProbeChart extends ChartRenderer {
    renderCalls = 0;
    /** @type {{containerWidth: number, containerHeight: number}[]} Scripted calculateDimensions() results; the last entry repeats. */
    dimensionScript = [{ containerWidth: 600, containerHeight: 400 }];
    /** @type {(() => void)|null} When set, renderChart calls this before returning. */
    duringRender = null;
    /** @type {number[]} Each pass's `drawDurationMs`. */
    durationsMs = [];
    /** @type {string[]} The marks a pass draws, by key; one taken out leaves through its exit. */
    markKeys = [];
    /** The width a pass's content needs (`fitContentWidth`); 0 asks for none. */
    contentWidthPx = 0;
    /** What `validateData()` answers. */
    valid = true;

    /** @override */
    validateData() {
        return this.valid;
    }

    /** How often the container was measured. */
    measureCalls = 0;

    /** @override */
    calculateDimensions() {
        this.measureCalls += 1;
        const next = required(
            this.dimensionScript.length > 1
                ? this.dimensionScript.shift()
                : this.dimensionScript[0],
        );
        return {
            ...next,
            geometryScale: Math.min(next.containerWidth, next.containerHeight) / 40,
            keyHeight: 0,
        };
    }

    /** @override */
    renderChart() {
        this.renderCalls += 1;
        this.durationsMs.push(this.drawDurationMs);
        if (this.contentWidthPx) this.fitContentWidth(this.contentWidthPx);
        // A pass moves only what an earlier one drew into its SVG.
        const svg = this.createSVGElement(10, 10);
        // Marks the way the charts join theirs: a raw transition moves the kept ones to
        // the pass count, a fade takes a leaving one away.
        svg.selectAll('rect')
            .data(this.markKeys, (key) => /** @type {string} */ (key))
            .join(
                (enter) => enter.append('rect'),
                (update) => update,
                (exit) => fadeOutAndRemove(exit, 'probe', this.drawDurationMs),
            )
            .transition('probe')
            .duration(this.drawDurationMs)
            .attr('x', this.renderCalls);
        this.duringRender?.();
    }
}

describe('ChartRenderer lifecycle contract', () => {
    /**
     * @param {string} id - The container's id.
     * @param {Partial<import('../../../../src/common/charts/renderers/chartRenderer.js').ChartRendererOptions>} [options]
     * @returns {LifecycleProbeChart} Not yet created.
     */
    function makeChart(id, options = {}) {
        return new LifecycleProbeChart(makeVisibleChartContainer(id), {
            context: createTestContext(),
            autoResize: false,
            ...options,
        });
    }

    it('drops a queued refresh when the chart is destroyed during the in-flight render', () => {
        const chart = makeChart('destroy-mid-render');
        // The refresh queues behind the active pass; the destroy lands before it runs.
        chart.duringRender = () => {
            chart.refresh();
            chart.destroy();
        };

        chart.create();

        // The queued follow-up must not run against a destroyed chart — this
        // interleaving makes averages vanish.
        expect(chart.renderCalls).toBe(1);

        // Any later render attempt stays a no-op.
        if (chart.measureIfStale()) chart.drawMeasured();
        expect(chart.renderCalls).toBe(1);
    });

    it('releases its resize observation on destroy and survives a stray late resize callback', async () => {
        const observeShared = resizeService.observe.bind(resizeService);
        /** @type {import('vitest').Mock<() => void>[]} */
        const releases = [];
        const observe = vi
            .spyOn(resizeService, 'observe')
            .mockImplementation((target, handler, options) => {
                const release = vi.fn(observeShared(target, handler, options));
                releases.push(release);
                return release;
            });
        const chart = makeChart('resize-after-destroy', { autoResize: true });
        chart.create();
        await nextAnimationFrames(2);

        expect(observe).toHaveBeenCalledTimes(1);
        const [target, handler] = observe.mock.calls[0];
        expect(target).toBe(chart.container);
        expect(chart.renderCalls).toBe(1);

        chart.destroy();
        expect(releases).toHaveLength(1);
        expect(releases[0]).toHaveBeenCalledTimes(1);

        // A debounced callback that already left the service before destroy
        // must hit the destroyed guard, not re-render into torn-down DOM.
        if (typeof handler === 'function') handler();
        else if (handler.measure()) handler.draw();
        await Promise.resolve();
        expect(chart.renderCalls).toBe(1);
    });

    it('skips a resize inside the default dimension tolerance but renders a real one', () => {
        const chart = makeChart('tolerance-default');
        chart.dimensionScript = [
            { containerWidth: 600, containerHeight: 400 },
            { containerWidth: 600.4, containerHeight: 400 },
            { containerWidth: 610, containerHeight: 400 },
        ];

        chart.create();
        expect(chart.renderCalls).toBe(1);

        // ResizeObserver noise (sub-pixel wobble) must not trigger a re-render.
        if (chart.measureIfStale()) chart.drawMeasured();
        expect(chart.renderCalls).toBe(1);

        // An actual size change always must.
        if (chart.measureIfStale()) chart.drawMeasured();
        expect(chart.renderCalls).toBe(2);
    });

    it('redraws a state change from the box it already measured', () => {
        // An explicit refresh (data or state change) is never tolerance-skipped.
        // One selection in the MA ring grid refreshes every ring; each measuring
        // its container again would force one layout per ring.
        const chart = makeChart('state-pass');

        chart.create();
        chart.refresh();
        chart.refresh();

        expect(chart.renderCalls).toBe(3);
        expect(chart.measureCalls).toBe(1);
        // The first draw enters; a refresh on screen moves.
        expect(chart.durationsMs).toEqual([0, MOTION.BASE_MS, MOTION.BASE_MS]);
    });

    it('only goes stale while hidden, and catches up on show', () => {
        // A chart in a view switched away must not draw into nothing, nor force a
        // layout for a state change nobody sees.
        const chart = makeChart('hidden-pass');
        const container = required(document.getElementById('hidden-pass'));
        chart.markKeys = ['kept', 'leaving'];
        chart.create();
        container.style.display = 'none';

        chart.markKeys = ['kept'];
        chart.refresh();
        expect(chart.renderCalls).toBe(1);
        expect(chart.measureCalls).toBe(1);

        container.style.display = '';
        if (chart.measureIfStale()) chart.drawMeasured();
        expect(chart.renderCalls).toBe(2);
        expect(chart.measureCalls).toBe(2);
        // Nobody watched the state it would move from, and a capture clones it now: the
        // pass has reached its end state when it returns, the exit gone with it.
        expect(chart.durationsMs).toEqual([0, 0]);
        expect(
            [...container.querySelectorAll('rect')].map((rect) => rect.getAttribute('x')),
        ).toEqual(['2']);
    });

    it('draws nothing until its owner calls create(), then paints what create() cleared', () => {
        // A ChartHostModule installs its renderers before awaiting the layout
        // settle, so a sibling's sync verb can reach one through `host.chart` in
        // that window. Rendering there would latch the last-rendered dimensions,
        // and the pending create() would then clear the container and skip its own
        // render at the tolerance guard — a permanently blank card.
        const chart = makeChart('pre-create-render');
        const container = required(document.getElementById('pre-create-render'));
        container.innerHTML = '<span id="pre-create-marker"></span>';

        chart.refresh();
        if (chart.measureIfStale()) chart.drawMeasured();

        expect(chart.renderCalls).toBe(0);
        // Nothing touched the container either: create() owns the clear.
        expect(document.getElementById('pre-create-marker')).not.toBeNull();

        chart.create();

        expect(chart.renderCalls).toBe(1);
        expect(document.getElementById('pre-create-marker')).toBeNull();
    });

    it('leaves a detached container alone on create()', () => {
        const chart = makeChart('detached-create');
        const container = required(document.getElementById('detached-create'));
        container.innerHTML = '<span id="detached-marker"></span>';
        const parent = required(container.parentElement);
        container.remove();

        chart.create();

        expect(chart.renderCalls).toBe(0);
        expect(container.querySelector('#detached-marker')).not.toBeNull();

        parent.append(container);
        chart.create();

        expect(chart.renderCalls).toBe(1);
    });

    it('repaints on a second create() at unchanged dimensions', () => {
        // create() empties the container, so the render that follows must actually
        // run: the "dimensions unchanged" skip is a resize-dedup guard, and letting
        // it swallow a create() pass leaves the cleared container blank for good.
        const chart = makeChart('recreate-same-size');

        chart.create();
        chart.create();

        expect(chart.renderCalls).toBe(2);
    });

    it('draws no pass while its host rebuilds it, and keeps what it drew', () => {
        // A host keeps a replaced renderer on screen through the next set's layout wait;
        // a pass there, for state, size or a toggle it cannot fade, would draw what the
        // rebuild changed: its successor's to draw.
        const mode = signal('ho');
        const comparisonState = comparisonStateShowing([]);
        const chart = makeChart('current-build', { comparisonState });
        chart.host = { isCurrentBuild: () => mode.value !== 'all' };
        chart.state = createState({ mode });
        chart.create();
        chart.createSVGElement(100, 100);
        mode.value = 'le';
        expect(chart.renderCalls).toBe(2);

        mode.value = 'all';
        comparisonState.setActive('land', true);
        chart.dimensionScript = [{ containerWidth: 300, containerHeight: 200 }];
        expect(chart.measureIfStale()).toBe(false);
        expect(chart.renderCalls).toBe(2);
        expect(chart.container.querySelector('svg')).not.toBeNull();

        // Back on its own build, it catches up in one pass.
        mode.value = 'ho';
        expect(chart.renderCalls).toBe(3);
    });

    it('destroy() removes what it drew and leaves the rest of its container', () => {
        // Whatever else the container holds is not the renderer's to take away.
        const drawn = makeChart('destroy-own-svg');
        drawn.create();
        const message = makeChart('destroy-own-message');
        message.validateData = () => false;
        message.create();
        const frames = [drawn, message].map((chart) =>
            chart.container.appendChild(document.createElement('div')),
        );

        drawn.destroy();
        message.destroy();

        expect(drawn.container.querySelector('svg')).toBeNull();
        expect(message.container.querySelector('.chart-message')).toBeNull();
        expect(frames.every((frame) => frame.isConnected)).toBe(true);
    });

    it('takes the scroll region of a wide drawing away with the drawing', () => {
        // A message in the plot's place, or a renderer gone, scrolls nothing: a region
        // left behind would stay a Tab stop over an empty card, and the successor in the
        // same container would inherit it.
        /** @param {HTMLElement} container */
        const regionOf = (container) => ({
            scrolls: container.classList.contains('chart-content-scroll'),
            tabindex: container.getAttribute('tabindex'),
            role: container.getAttribute('role'),
        });
        const unmarked = { scrolls: false, tabindex: null, role: null };
        const toMessage = makeChart('wide-to-message');
        const destroyed = makeChart('wide-destroyed');
        for (const chart of [toMessage, destroyed]) {
            chart.contentWidthPx = 5000;
            chart.create();
            expect(regionOf(chart.container)).toEqual({
                scrolls: true,
                tabindex: '0',
                role: 'region',
            });
        }

        toMessage.valid = false;
        toMessage.refresh();
        destroyed.destroy();

        expect(toMessage.container.querySelector('.chart-message')).not.toBeNull();
        expect(regionOf(toMessage.container)).toEqual(unmarked);
        expect(regionOf(destroyed.container)).toEqual(unmarked);
    });

    it('hides the tooltip of a mark that a message replaces', () => {
        // The mark goes without a `mouseleave` or `blur`, so nothing else would hide
        // the tooltip it showed (a keyboard-focused mark whose click emptied the chart).
        const chart = makeChart('tooltip-to-message');
        chart.markKeys = ['focused'];
        chart.create();
        cursorTooltip.show(required(chart.container.querySelector('rect')), { title: 'Mark' });
        expect(cursorTooltip.isShown()).toBe(true);

        chart.valid = false;
        chart.refresh();

        expect(cursorTooltip.isShown()).toBe(false);
    });

    it('clearContainer() releases the svg/g handles it just detached', () => {
        // A handle left bound to a removed node passes a subclass's
        // `if (!this.svg || !this.g) return false` guard, and the D3 join then
        // lands outside the document: no error, no marks, no recovery.
        const chart = makeChart('clear-releases-handles');
        chart.create();
        // Sentinels, not selections: the test only checks that the handles are dropped.
        chart.svg = /** @type {typeof chart.svg} */ (/** @type {unknown} */ ({ detached: 'svg' }));
        chart.g = /** @type {typeof chart.g} */ (/** @type {unknown} */ ({ detached: 'g' }));

        chart.clearContainer();

        expect(chart.svg).toBeNull();
        expect(chart.g).toBeNull();
    });
});

/** Three focusable marks, and a key of one entry wherever it has a panel. */
class KeyedProbeChart extends ChartRenderer {
    /** @override */
    calculateDimensions() {
        return { containerWidth: 300, containerHeight: 200, geometryScale: 5, keyHeight: 0 };
    }

    /** @override */
    chartKey() {
        return [{ items: [{ label: 'Probe' }] }];
    }

    /** @override */
    renderChart() {
        const marks = this.createSVGElement(300, 200)
            .selectAll('circle')
            .data([1, 2, 3])
            .join('circle')
            .attr('cx', (d) => d * 50)
            .attr('cy', 100)
            .attr('r', 5);
        this.wireTooltipEvents(marks, {
            getTooltipContent: (d) => ({ title: `Wert ${d}`, rows: [] }),
            hoverEffect: 'area',
        });
    }

    /** @returns {SVGCircleElement[]} The marks drawn, in DOM order. */
    get marks() {
        return [...required(this.svg?.node()).querySelectorAll('circle')];
    }
}

describe('ChartRenderer handover in a shared container', () => {
    /** @typedef {'side'|'top'|undefined} Legend */

    /** Each way the layout can change between two renderers, and none. */
    const SWAPS = /** @type {Array<[string, Legend, Legend]>} */ ([
        ['no key to a side panel', undefined, 'side'],
        ['a side panel to no key', 'side', undefined],
        ['a key to the same key', 'top', 'top'],
        ['a side panel to a key', 'side', 'top'],
        ['a key to a side panel', 'top', 'side'],
        ['no key to no key', undefined, undefined],
    ]);

    /**
     * @param {HTMLElement} container
     * @param {Legend} legend
     * @returns {KeyedProbeChart}
     */
    const makeChart = (container, legend) =>
        new KeyedProbeChart(container, {
            context: createTestContext(),
            autoResize: false,
            ...(legend ? { legend } : {}),
        });

    /**
     * Whether ArrowRight on a chart's first mark moves focus to its second.
     * @param {KeyedProbeChart} chart
     * @returns {boolean}
     */
    function arrowWalks(chart) {
        const [first, second] = chart.marks;
        first.focus();
        first.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
        );
        return document.activeElement === second;
    }

    /**
     * The elements in a container that carry arrow-key listeners.
     * @param {HTMLElement} container
     * @returns {HTMLElement[]}
     */
    const wiredIn = (container) =>
        [container, ...container.querySelectorAll('div')].filter(
            (element) => d3.select(element).on('keydown.roving') !== undefined,
        );

    it.each(SWAPS)(
        '%s: a replacement built leaves the drawn renderer whole until it is destroyed',
        (name, from, to) => {
            // The host builds the next renderer before its layout wait and destroys the
            // drawn one only after it: what the constructor changed in the container
            // showed for that wait as a blank card, or as marks no arrow key reached.
            const container = makeVisibleChartContainer(`handover-built-${name}`);
            const drawn = makeChart(container, from);
            drawn.create();
            const svg = required(drawn.svg?.node());
            const panel = drawn.legendPanel;
            const layout = container.className;

            const next = makeChart(container, to);

            expect(svg.isConnected).toBe(true);
            expect(panel?.textContent?.trim() ?? null).toBe(from ? 'Probe' : null);
            expect(panel?.isConnected ?? true).toBe(true);
            expect(container.className).toBe(layout);
            expect(arrowWalks(drawn)).toBe(true);

            // A replacement superseded before its create() goes without a trace too.
            next.destroy();

            expect(svg.isConnected).toBe(true);
            expect(container.className).toBe(layout);
            expect(arrowWalks(drawn)).toBe(true);
        },
    );

    it.each(SWAPS)(
        '%s: the replacement lays out its own frame and keys once, with none of the old left',
        (name, from, to) => {
            const container = makeVisibleChartContainer(`handover-swapped-${name}`);
            const drawn = makeChart(container, from);
            drawn.create();
            const next = makeChart(container, to);

            // The host's order: the drawn renderer goes just before the next one's create().
            drawn.destroy();
            next.create();

            expect(container.querySelectorAll('svg')).toHaveLength(1);
            expect(next.svg?.node()?.isConnected).toBe(true);
            expect(container.classList.contains('chart-with-legend-panel')).toBe(to === 'side');
            expect(container.classList.contains('chart-with-key')).toBe(to === 'top');
            expect(next.legendPanel?.textContent?.trim() ?? null).toBe(to ? 'Probe' : null);
            // A key over the plot comes first in the DOM, as on screen; a side panel last.
            expect(next.legendPanel?.nextElementSibling ?? null).toBe(
                to === 'top' ? next.container : null,
            );
            expect(wiredIn(container)).toEqual([next.container]);
            // One padded plot area: the frame a direct drawing marked is not nested around it.
            expect(
                [container, ...container.querySelectorAll('div')].filter((element) =>
                    element.classList.contains('chart-container'),
                ),
            ).toEqual([next.container]);
            expect(arrowWalks(next)).toBe(true);
        },
    );
});

describe('ChartRenderer auto key placement', () => {
    /**
     * @param {string} id
     * @param {{widthPx: number, heightPx: number}} size
     * @returns {KeyedProbeChart} Created.
     */
    function placedChart(id, size) {
        const chart = new KeyedProbeChart(makeVisibleChartContainer(id, size), {
            context: createTestContext(),
            autoResize: false,
            legend: 'auto',
        });
        chart.create();
        return chart;
    }

    /** @param {KeyedProbeChart} chart */
    const beside = (chart) =>
        required(chart.container.parentElement).classList.contains('chart-with-key--beside');

    it('puts the key beside a plot that stays at least as wide as tall, after it in the DOM', () => {
        const chart = placedChart('auto-key-wide', { widthPx: 800, heightPx: 300 });

        expect(beside(chart)).toBe(true);
        expect(chart.container.nextElementSibling).toBe(chart.legendPanel);
    });

    it('puts the key over a plot that would end up taller than wide, first in the DOM', () => {
        const chart = placedChart('auto-key-tall', { widthPx: 300, heightPx: 500 });

        expect(beside(chart)).toBe(false);
        expect(chart.legendPanel?.nextElementSibling).toBe(chart.container);
    });

    it('places it again on a resize, and the move it starts keeps it there', () => {
        const chart = placedChart('auto-key-resize', { widthPx: 800, heightPx: 300 });
        const root = required(chart.container.parentElement);

        root.style.width = '300px';
        root.style.height = '500px';
        chart.measureIfStale();
        chart.drawMeasured();
        expect(beside(chart)).toBe(false);

        // The plot area the observer watches changed size with the move: its measure
        // must land on the same place, or the key would flip on every callback.
        chart.measureIfStale();
        chart.drawMeasured();
        expect(beside(chart)).toBe(false);
    });
});

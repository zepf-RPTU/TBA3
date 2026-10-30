import { expect, vi } from 'vitest';
import { createComparisonState } from '../../src/common/charts/comparisonState.js';
import { ChartHostModule } from '../../src/common/charts/host/chartHostModule.js';
import { mountModule } from './dom.js';

/**
 * Shared fixtures for ChartRenderer / ChartHostModule lifecycle suites (browser project).
 * Containers are mounted in the live document: ChartRenderer skips a container that
 * fails `checkVisibility()`.
 */

/**
 * A comparison state with the given ids switched on, in that order, as the ⌀ toggles
 * would switch them.
 * @param {string[]} ids
 * @returns {import('../../src/common/charts/comparisonState.js').ComparisonState}
 */
export function comparisonStateShowing(ids) {
    const state = createComparisonState();
    for (const id of ids) state.setActive(id, true);
    return state;
}

/**
 * Create a container div that ChartRenderer treats as visible.
 * @param {string} [id]
 * @param {{widthPx?: number, heightPx?: number}} [size] - The box; a side left out stays unset.
 * @returns {HTMLDivElement} Appended to the body.
 */
export function makeVisibleChartContainer(id = 'chart', { widthPx, heightPx } = {}) {
    const container = document.createElement('div');
    container.id = id;
    if (widthPx !== undefined) container.style.width = `${widthPx}px`;
    if (heightPx !== undefined) container.style.height = `${heightPx}px`;
    document.body.appendChild(container);
    return container;
}

/**
 * A real chart host for one descriptor, in a frame with a box, its first render cycle
 * drawn: what a descriptor test asserts through (`host.chart`, `host.state`, the export
 * hooks, the DOM). The options carry the context, whose store answers the documents.
 * @template {import('../../src/common/charts/host/chartHostModule.js').ChartHostConfig<any, any, any, any, any>} C
 * @param {C} config
 * @param {import('../../src/common/charts/host/chartHostModule.js').ChartHostOptions & {[key: string]: unknown}} options
 * @param {{id?: string, widthPx?: number, heightPx?: number}} [frame] - The frame's id and box.
 * @returns {Promise<import('../../src/common/charts/host/chartHostModule.js').ChartHostModule<any, any, any, any> & {[verb: string]: any}>} The host, connected.
 */
export async function mountChart(
    config,
    options,
    { id = 'chart', widthPx = 640, heightPx = 480 } = {},
) {
    const host = ChartHostModule.createChart(`${id}-host`, config, /** @type {any} */ (options));
    // The card fills the frame, as a grid cell gives it its height in the app.
    host.style.display = 'block';
    host.style.height = '100%';
    return mountModule(
        host,
        undefined,
        makeVisibleChartContainer(`${id}-frame`, { widthPx, heightPx }),
    );
}

/**
 * Redraw a drawn chart with nothing changed, and expect nothing to change: the same SVG
 * node, the same markup in the container, and the same node for a focusable mark. A pass
 * that rebuilt or duplicated anything would drop the focused mark and stack a second
 * chart over the first.
 *
 * The markup check covers the whole container, not just the SVG, so a title or text
 * block drawn beside the SVG must not stack either.
 * @param {import('../../src/common/charts/renderers/chartRenderer.js').ChartRenderer} chart - Already created.
 * @param {string} markSelector - A mark, inside the container, that must keep its node.
 */
export function expectStableRedraw(chart, markSelector) {
    const svg = chart.svg?.node();
    const markup = chart.container.innerHTML;
    const mark = chart.container.querySelector(markSelector);
    expect(mark).not.toBeNull();

    chart.refresh();

    expect(chart.svg?.node()).toBe(svg);
    expect(chart.container.innerHTML).toBe(markup);
    expect(chart.container.querySelector(markSelector)).toBe(mark);
}

/**
 * A toggle block of subjects for a chart key.
 * @param {string[]} keys - Each also its entry's label.
 * @param {object} [extra] - Further block fields.
 * @returns {{title: string, group: string, items: Array<{key: string, label: string}>}}
 */
export function subjects(keys, extra = {}) {
    return {
        title: 'Fächer',
        group: 'subject',
        items: keys.map((key) => ({ key, label: key })),
        ...extra,
    };
}

/**
 * A renderer stand-in for ChartHostModule suites: plain spies, so a test asserts
 * which lifecycle calls the host made without drawing anything.
 * @returns {import('../../src/common/charts/renderers/chartRenderer.js').ChartRenderer} The spies, typed as the renderer a config's `createRenderer` returns.
 */
export function makeFakeRenderer() {
    const spies = {
        create: vi.fn(),
        destroy: vi.fn(),
        refresh: vi.fn(),
        measureIfStale: vi.fn(() => true),
        drawMeasured: vi.fn(),
        // No table, as the base renderer draws none.
        dataTable: vi.fn(() => null),
    };
    // The host calls only these six; the rest of ChartRenderer is never reached.
    return /** @type {import('../../src/common/charts/renderers/chartRenderer.js').ChartRenderer} */ (
        /** @type {unknown} */ (spies)
    );
}

// @vitest-browser

/**
 * ChartRenderer's series visibility — the two things that switch a series off:
 * - the app's comparison state, read through the `comparisonState` port (so the shared
 *   base never depends on one app's state object), which a drawn chart follows on its own
 * - the toggle pills of the chart's own key (`chartKey` blocks with a `group`), whose
 *   state the base keeps across redraws
 * `isSeriesShown(key, group)` answers for both.
 */

import { describe, expect, it, vi } from 'vitest';

import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import {
    comparisonStateShowing,
    makeVisibleChartContainer,
    subjects,
} from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';
import { legendPill } from '../../../support/dom.js';

/** A chart that toggles the given comparison groups, as an EN marker chart does. */
class ComparisonProbeChart extends ChartRenderer {
    /**
     * @param {HTMLElement} container
     * @param {string[]|null} comparisonModes - The groups it toggles; null declares none.
     * @param {import('../../../../src/common/charts/comparisonState.js').ComparisonStateReader|null} comparisonState
     * @param {'fade'|'redraw'} [onToggle]
     */
    constructor(container, comparisonModes, comparisonState, onToggle) {
        super(container, { context: createTestContext('en'), comparisonState });
        if (comparisonModes) {
            this.setComparisonModes(
                comparisonModes.map((id) => ({ id, name: id })),
                { onToggle },
            );
        }
    }

    /** @override */
    renderChart() {
        this.createSVGElement(10, 10);
    }
}

/**
 * @param {string[]|null} comparisonModes - The groups the chart toggles; null declares none.
 * @param {string[]|null} [activeIds] - The ids the app shows; null hands the chart no comparison state.
 * @param {'fade'|'redraw'} [onToggle] - How a toggle reaches a chart that declared groups.
 * @returns {{chart: ComparisonProbeChart, state: import('../../../../src/common/charts/comparisonState.js').ComparisonState|null}}
 */
function makeChart(comparisonModes, activeIds = null, onToggle = 'fade') {
    const container = makeVisibleChartContainer('visibility-state-chart', {
        widthPx: 200,
        heightPx: 100,
    });
    const state = activeIds ? comparisonStateShowing(activeIds) : null;
    return {
        chart: new ComparisonProbeChart(container, comparisonModes, state, onToggle),
        state,
    };
}

describe('ChartRenderer visibilityState', () => {
    it('gives a mode the chart cannot draw no key at all — not a true', () => {
        // The keys are the chart's toggleable modes, i.e. the groups its payload
        // carries. An app-active id outside that list defaulting to visible would render
        // an untoggleable state marker on datasets with no state group.
        const { chart } = makeChart(['school'], ['school', 'state']);

        expect(chart.visibilityState).toEqual({ school: true });
    });

    it('keys every toggleable mode, on or off, and nothing else', () => {
        // The chart's own series (student, group) are not toggleable and carry no
        // key — a key that could only ever be true would be dead weight every reader has
        // to re-assert.
        const { chart } = makeChart(['school', 'state'], ['state']);

        expect(chart.visibilityState).toEqual({ school: false, state: true });
    });

    it('shows every drawable mode when the host has no comparison state at all', () => {
        // Null is "no opinion", not "none active": a host that hands the chart averages
        // and no state means to see them. Only the modes this payload carries are keyed, so
        // no marker appears for a group the data lacks. tba3 always supplies a state, so
        // nothing in the dashboards exercises this.
        const { chart } = makeChart(['school', 'state']);

        expect(chart.activeModes).toBeNull();
        expect(chart.visibilityState).toEqual({ school: true, state: true });
    });

    it('keeps an empty list meaning "none" — an opinion is not an absence', () => {
        const { chart, state } = makeChart(['school', 'state'], ['school']);
        state?.setActive('school', false);

        expect(chart.visibilityState).toEqual({ school: false, state: false });
    });

    it('is empty for a chart that declares no comparison modes', () => {
        const { chart } = makeChart(null, ['school']);

        expect(chart.visibilityState).toEqual({});
    });
});

describe('ChartRenderer following the comparison state', () => {
    it('fades a drawn chart in place on a toggle, without a redraw', () => {
        // The ⌀ toggle reaches every chart through the port's signal reads, not a
        // per-renderer push; a fade is all a toggle needs.
        const { chart, state } = makeChart(['school', 'state'], ['school']);
        chart.create();
        const refresh = vi.spyOn(chart, 'refresh');

        state?.setActive('state', true);

        expect(chart.visibilityState).toEqual({ school: true, state: true });
        expect(refresh).not.toHaveBeenCalled();
        chart.destroy();
    });

    it('redraws a chart that declared it lays out anew on a toggle', () => {
        const { chart, state } = makeChart(['school', 'state'], ['school'], 'redraw');
        chart.create();
        const refresh = vi.spyOn(chart, 'refresh');

        state?.setActive('state', true);

        expect(refresh).toHaveBeenCalledTimes(1);
        chart.destroy();
    });

    it('ignores the toggles in a chart that declared no groups', () => {
        // Every host hands its renderer the comparison state; a chart that draws no
        // comparison would otherwise redraw for each ⌀ toggle on the page.
        const { chart, state } = makeChart(null, ['school']);
        chart.create();
        const refresh = vi.spyOn(chart, 'refresh');

        state?.setActive('state', true);

        expect(refresh).not.toHaveBeenCalled();
        chart.destroy();
    });

    it('stops following once destroyed', () => {
        const { chart, state } = makeChart(null, ['school']);
        chart.create();
        const refresh = vi.spyOn(chart, 'refresh');
        chart.destroy();

        state?.setActive('state', true);

        expect(refresh).not.toHaveBeenCalled();
    });
});

/** @typedef {import('../../../../src/common/charts/legend/htmlLegendPanel.js').ChartKey} ChartKey */

/** A chart whose key is whatever a test hands it, with a side panel of pills. */
class KeyProbeChart extends ChartRenderer {
    /** @type {ChartKey} What `chartKey()` returns; a test swaps it before a `refresh()`. */
    keyBlocks = [];
    /** How often a pass drew. */
    renders = 0;

    /**
     * @param {HTMLElement} container
     * @param {import('../../../../src/common/charts/comparisonState.js').ComparisonStateReader|null} comparisonState
     */
    constructor(container, comparisonState) {
        super(container, {
            context: createTestContext('sl'),
            comparisonState,
            legend: 'side',
            autoResize: false,
        });
        if (comparisonState) this.setComparisonModes([{ id: 'school', name: 'Schule' }]);
    }

    /** @override */
    chartKey() {
        return this.keyBlocks;
    }

    /** @override */
    renderChart() {
        this.renders += 1;
        this.createSVGElement(10, 10);
    }
}

/**
 * A drawn key chart.
 * @param {ChartKey} keyBlocks
 * @param {import('../../../../src/common/charts/comparisonState.js').ComparisonStateReader|null} [comparisonState]
 * @returns {KeyProbeChart}
 */
function makeKeyChart(keyBlocks, comparisonState = null) {
    const container = makeVisibleChartContainer('key-toggle-chart', {
        widthPx: 400,
        heightPx: 200,
    });
    const chart = new KeyProbeChart(container, comparisonState);
    chart.keyBlocks = keyBlocks;
    chart.create();
    return chart;
}

/**
 * A pill of the chart's panel, by its label.
 * @param {KeyProbeChart} chart
 * @param {string} label - An entry's, or a master pill's.
 * @param {string} [section] - The heading of its block, where a label repeats.
 * @returns {HTMLButtonElement}
 */
const pillOf = (chart, label, section) => legendPill(required(chart.legendPanel), label, section);

describe('ChartRenderer key toggles', () => {
    it('a pill click switches its series off and redraws once, a second click back on', () => {
        const chart = makeKeyChart([subjects(['Deutsch', 'Mathe'])]);
        const before = chart.renders;

        pillOf(chart, 'Mathe').click();

        expect(chart.renders).toBe(before + 1);
        expect(chart.isSeriesShown('Mathe', 'subject')).toBe(false);
        expect(chart.isSeriesShown('Deutsch', 'subject')).toBe(true);
        expect(pillOf(chart, 'Mathe').getAttribute('aria-pressed')).toBe('false');

        pillOf(chart, 'Mathe').click();
        expect(chart.isSeriesShown('Mathe', 'subject')).toBe(true);
        chart.destroy();
    });

    it('keeps a hidden series across a redraw, forgets one that left the key, starts a new one on', () => {
        // A resize or data refresh must not undo a viewer's toggles, but a series
        // that comes back after leaving the data is a new one.
        const chart = makeKeyChart([subjects(['Deutsch', 'Mathe'])]);
        pillOf(chart, 'Mathe').click();
        pillOf(chart, 'Deutsch').click();

        chart.keyBlocks = [subjects(['Mathe', 'Englisch'])];
        chart.refresh();
        expect(chart.isSeriesShown('Mathe', 'subject')).toBe(false);
        expect(chart.isSeriesShown('Englisch', 'subject')).toBe(true);

        chart.keyBlocks = [subjects(['Deutsch', 'Mathe'])];
        chart.refresh();
        expect(chart.isSeriesShown('Deutsch', 'subject')).toBe(true);
        expect(chart.isSeriesShown('Mathe', 'subject')).toBe(false);
        chart.destroy();
    });

    it('starts an initiallyHidden series off once; a viewer turning it on survives a redraw', () => {
        const chart = makeKeyChart([
            {
                title: 'Lerngruppen',
                group: 'individual-group',
                masterLabel: 'Lerngruppen',
                items: [
                    { key: '8a', label: '8a', initiallyHidden: true },
                    { key: '8b', label: '8b', initiallyHidden: true },
                ],
            },
        ]);
        expect(chart.isSeriesShown('8a', 'individual-group')).toBe(false);
        expect(pillOf(chart, 'Lerngruppen').getAttribute('aria-pressed')).toBe('false');

        pillOf(chart, '8a').click();
        chart.refresh();

        expect(chart.isSeriesShown('8a', 'individual-group')).toBe(true);
        expect(chart.isSeriesShown('8b', 'individual-group')).toBe(false);
        chart.destroy();
    });

    it('a master pill turns every entry off while any is on, then all on, one redraw each', () => {
        const chart = makeKeyChart([subjects(['Deutsch', 'Mathe'], { masterLabel: 'Fächer' })]);
        pillOf(chart, 'Deutsch').click();
        expect(pillOf(chart, 'Fächer').getAttribute('aria-pressed')).toBe('true');
        const before = chart.renders;

        pillOf(chart, 'Fächer').click();
        expect(chart.renders).toBe(before + 1);
        expect(chart.isSeriesShown('Mathe', 'subject')).toBe(false);
        expect(pillOf(chart, 'Fächer').getAttribute('aria-pressed')).toBe('false');

        pillOf(chart, 'Fächer').click();
        expect(chart.isSeriesShown('Deutsch', 'subject')).toBe(true);
        expect(chart.isSeriesShown('Mathe', 'subject')).toBe(true);
        chart.destroy();
    });

    it('a toggle-all heading flips its own block only', () => {
        const chart = makeKeyChart([
            subjects(['de|L', 'de|H'], { group: 'domain', toggleAll: true }),
            subjects(['ma|Z'], { group: 'domain', toggleAll: true }),
        ]);

        /** @type {HTMLElement} */ (
            required(required(chart.legendPanel).querySelector('.legend-section-title--clickable'))
        ).click();

        expect(chart.isSeriesShown('de|L', 'domain')).toBe(false);
        expect(chart.isSeriesShown('de|H', 'domain')).toBe(false);
        expect(chart.isSeriesShown('ma|Z', 'domain')).toBe(true);
        chart.destroy();
    });

    it('keeps the keys of two groups apart', () => {
        // A Lerngruppe may carry the name of a Fach; hiding one must not hide the other.
        const chart = makeKeyChart([
            subjects(['Deutsch']),
            subjects(['Deutsch'], { group: 'individual-group', title: 'Lerngruppen' }),
        ]);

        pillOf(chart, 'Deutsch', 'Lerngruppen').click();

        expect(chart.isSeriesShown('Deutsch', 'individual-group')).toBe(false);
        expect(chart.isSeriesShown('Deutsch', 'subject')).toBe(true);
        chart.destroy();
    });

    it('hides a series the comparison toggles switched off, whatever its pill says', () => {
        const state = comparisonStateShowing(['school']);
        const chart = makeKeyChart([subjects(['school'], { group: 'comparison' })], state);
        expect(chart.isSeriesShown('school', 'comparison')).toBe(true);

        state.setActive('school', false);
        expect(chart.isSeriesShown('school', 'comparison')).toBe(false);

        state.setActive('school', true);
        pillOf(chart, 'school').click();
        expect(chart.isSeriesShown('school', 'comparison')).toBe(false);
        // The pill is the chart's own: the comparison alone still shows.
        expect(chart.isSeriesShown('school')).toBe(true);
        chart.destroy();
    });
});

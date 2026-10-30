// @vitest-browser
// The chart starts in its rule's orientation; the header toggle writes the other one to
// the host's signal, which the live chart shares and a rebuilt renderer starts from.
import { describe, it, expect } from 'vitest';
import { maCompetenceLevelDistributionConfig } from '../../../../../src/ma/modules/charts/competenceLevelDistribution/maCompetenceLevelDistributionConfig.js';
import { mountChart } from '../../../../support/chartHarness.js';
import { required } from '../../../../support/required.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

/** @typedef {import('../../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js').CompetenceLevelDistributionChart} CompetenceLevelDistributionChart */

/**
 * The chart's card, drawn, and its header toggle as the card's shell renders it.
 * @param {(level: string|null) => void} [onLevelSelected] - The view's level handler.
 */
async function mountDistribution(onLevelSelected) {
    const host = await mountChart(maCompetenceLevelDistributionConfig, {
        context: await createSubjectContext('ma'),
        onLevelSelected,
    });
    /** @returns {HTMLButtonElement} The toggle the header shows now. */
    const toggle = () =>
        required(
            /** @type {HTMLButtonElement|null} */ (
                host.querySelector('[data-header-action-button="orientation-toggle"]')
            ),
        );
    /** Click the toggle and let the header render the state it wrote. */
    const clickToggle = async () => {
        toggle().click();
        await host.updateComplete;
    };
    return { host, toggle, clickToggle };
}

/**
 * @param {any} host
 * @returns {CompetenceLevelDistributionChart} The chart the host draws now.
 */
const chartOf = (host) => required(host.chart);

describe('MA competence-level distribution orientation toggle', () => {
    it('pushes the toggled orientation to the live chart, and back', async () => {
        const { host, toggle, clickToggle } = await mountDistribution();
        // One signal: the chart's state is the host's.
        expect(chartOf(host).state.isHorizontal).toBe(host.state.isHorizontal);
        // The fixture's few short group names stand by the rule.
        expect(chartOf(host).isHorizontal).toBe(false);
        expect(toggle().getAttribute('aria-pressed')).toBe('false');

        await clickToggle();

        expect(chartOf(host).isHorizontal).toBe(true);
        expect(toggle().getAttribute('aria-pressed')).toBe('true');
        expect(toggle().classList.contains('is-active')).toBe(true);

        await clickToggle();

        expect(chartOf(host).isHorizontal).toBe(false);
        expect(host.state.isHorizontal.value).toBe(false);
        expect(toggle().getAttribute('aria-pressed')).toBe('false');
    });

    it('a rebuilt renderer keeps the toggled orientation', async () => {
        const { host, clickToggle } = await mountDistribution();
        const drawn = chartOf(host);
        await clickToggle();

        await host.rerender();

        expect(chartOf(host)).not.toBe(drawn);
        expect(chartOf(host).isHorizontal).toBe(true);
    });
});

describe('MA competence-level distribution level selection', () => {
    it('selects one level at a time, and a click on the selected level clears it', async () => {
        // The item rings take one level; the chart only reports clicks, so this
        // config owns the single-select rule the overview relies on.
        /** @type {Array<string|null>} */
        const selected = [];
        const { host } = await mountDistribution((level) => selected.push(level));
        const click = (/** @type {string} */ level) =>
            required(chartOf(host).options.onLevelClicked)(level);

        click('I');
        expect(host.state.highlightedLevels.value).toEqual(['I']);
        click('II');
        expect(host.state.highlightedLevels.value).toEqual(['II']);
        click('II');
        expect(host.state.highlightedLevels.value).toEqual([]);

        expect(selected).toEqual(['I', 'II', null]);
    });
});

// @vitest-browser
/**
 * MA KS distribution orientation toggle — host persistence contract.
 *
 * The header toggle must (a) push the new orientation into the live chart via
 * reactive state (so it re-renders) and (b) persist the value on
 * `host.configState`, because a THEME_CHANGED rebuild re-creates the chart via
 * `createChart()`. Before this contract existed the toggle mutated
 * `chart.isHorizontal` directly, so a theme switch silently reset the
 * orientation to its constructed default.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maKsDistributionConfig } from '@tba3/modules/ma/modules/charts/ksDistribution/maKsDistributionConfig.js';

const CONTAINER_ID = 'ks-orientation-test';

function makeHost(options = {}, configState = {}) {
    return {
        id: CONTAINER_ID,
        configState,
        chart: null,
        getOption: (name, fallback) => (name in options ? options[name] : fallback),
    };
}

describe('MA KS distribution orientation toggle', () => {
    beforeEach(() => {
        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('persists the toggled orientation on host.configState and pushes it to the live chart', () => {
        const host = makeHost({ isHorizontal: false });
        const chart = maKsDistributionConfig.createRenderer(host, []);
        host.chart = chart;
        const refreshSpy = vi.spyOn(chart, 'refresh').mockResolvedValue(undefined);

        maKsDistributionConfig.publicAPI.toggleOrientation(host);

        expect(chart.isHorizontal).toBe(true);
        expect(host.configState.isHorizontal).toBe(true);
        expect(refreshSpy).toHaveBeenCalled();

        maKsDistributionConfig.publicAPI.toggleOrientation(host);

        expect(chart.isHorizontal).toBe(false);
        expect(host.configState.isHorizontal).toBe(false);
    });

    it('createRenderer prefers the persisted configState orientation over the static option (rebuild keeps the toggle)', () => {
        const host = makeHost({ isHorizontal: false }, { isHorizontal: true });

        const rebuilt = maKsDistributionConfig.createRenderer(host, []);

        expect(rebuilt.isHorizontal).toBe(true);
    });

    it('createRenderer falls back to the isHorizontal option when nothing was toggled yet', () => {
        const host = makeHost({ isHorizontal: true });

        const chart = maKsDistributionConfig.createRenderer(host, []);

        expect(chart.isHorizontal).toBe(true);
    });
});

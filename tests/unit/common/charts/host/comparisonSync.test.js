/**
 * `setActiveModes` — the one comparison verb for every chart that keeps
 * `activeModes` as renderer state (EN/MA KS distribution, EN scatterplot, EN item
 * lollipop). A view's resume catch-up replays the latest comparison state, which may
 * be what the chart already draws, so the handler has to tell "changed" from "already
 * drawn": a redraw on the catch-up would cost every chart a render for nothing.
 */

import { describe, expect, it, vi } from 'vitest';

import {
    hasSameActiveModes,
    setActiveModes,
} from '@tba3/modules/common/charts/host/comparisonSync.js';

function makeHost(activeModes) {
    const chart = {
        getState: (key) => (key === 'activeModes' ? activeModes : undefined),
        setState: vi.fn(),
    };
    return { chart };
}

describe('setActiveModes', () => {
    it('pushes a changed list into the chart as its own copy', () => {
        const host = makeHost(['school']);
        const activeModes = ['school', 'state'];

        setActiveModes(host, activeModes);

        expect(host.chart.setState).toHaveBeenCalledWith({ activeModes: ['school', 'state'] });
        expect(host.chart.setState.mock.calls[0][0].activeModes).not.toBe(activeModes);
    });

    it('skips the resume catch-up that repeats what the chart already shows', () => {
        // WHY: every view hands the active list over again on resume; without this guard
        // each chart on the view would redraw for a state it is already drawn against.
        const host = makeHost(['school', 'state']);

        setActiveModes(host, ['school', 'state']);

        expect(host.chart.setState).not.toHaveBeenCalled();
    });

    it('treats a reordered list as a change, and does nothing without a chart or a list', () => {
        expect(hasSameActiveModes(makeHost(['a', 'b']).chart, ['b', 'a'])).toBe(false);

        const noChart = { chart: null };
        expect(() => setActiveModes(noChart, ['a'])).not.toThrow();

        const host = makeHost(['a']);
        setActiveModes(host, 'a');
        setActiveModes(host, null);
        expect(host.chart.setState).not.toHaveBeenCalled();
    });
});

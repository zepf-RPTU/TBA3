// @vitest-browser

/**
 * MA KS bar — the bar draws the class's own row of the competence-levels document.
 *
 * The document carries the class row plus the comparison rows, in no order the spec
 * fixes. Here the comparisons come first and dwarf the class.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { simpleKsBarConfig } from '@tba3/modules/ma/modules/charts/ksBar/simpleKsBarConfig.js';

const CONTAINER_ID = 'simple-ks-bar-test';

function valueGroup({ id, type, name, frequencies }) {
    const total = Object.values(frequencies).reduce((sum, frequency) => sum + frequency, 0);
    return {
        id,
        type,
        name,
        competenceLevels: Object.entries(frequencies).map(([nameShort, frequency]) => ({
            nameShort,
            descriptiveStatistics: {
                total,
                frequency,
                mean: Math.round((frequency / total) * 1e4) / 1e4,
            },
        })),
    };
}

const STATE = valueGroup({
    id: 'state',
    type: 'state',
    name: 'Landesschnitt',
    frequencies: { I: 300, II: 500, III: 200 },
});
const SCHOOL = valueGroup({
    id: 'school',
    type: 'school',
    name: 'Schulschnitt',
    frequencies: { I: 10, II: 20, III: 30 },
});
const CLASS = valueGroup({
    id: '3a-mathe',
    type: 'group',
    name: '3a',
    frequencies: { I: 1, II: 2, III: 3 },
});

function makeHost() {
    return { id: CONTAINER_ID, configState: {}, chart: null, getOption: () => undefined };
}

describe('MA KS bar — the class row', () => {
    beforeEach(() => {
        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it("draws the class's own row, even when the comparison rows come first", () => {
        const host = makeHost();

        const chart = simpleKsBarConfig.createRenderer(host, [STATE, SCHOOL, CLASS]);

        expect(host.configState.counts).toEqual({ I: 1, II: 2, III: 3 });
        expect(host.configState.distribution.III).toBeCloseTo(50, 10);
        expect(chart.chartState.counts).toEqual({ I: 1, II: 2, III: 3 });
    });

    it('draws nothing from a document without a class row', () => {
        const host = makeHost();

        simpleKsBarConfig.createRenderer(host, [STATE, SCHOOL]);

        expect(host.configState.distribution).toEqual({});
        expect(host.configState.counts).toEqual({});
    });
});

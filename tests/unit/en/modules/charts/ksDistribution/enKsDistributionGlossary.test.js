// @vitest-browser

/**
 * EN KS distribution — the glossary term on each axis label follows the row's `type`.
 *
 * A comparison population the glossary has no term for (here a `district` row) used to
 * borrow the Klassenschnitt term whenever its id was missing from the app's comparison
 * list, which defined a district average as the class's own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as d3 from 'd3';

import { EnKsDistributionChart } from '@tba3/modules/en/modules/charts/ksDistribution/enKsDistributionChart.js';
import { GLOSSARY_KEYS } from '@tba3/modules/common/glossary/glossaryKeys.js';

const CONTAINER_ID = 'en-ks-glossary-test';
const LEVELS = ['A1', 'A2'];

function valueGroup({ id, type, name }) {
    return {
        id,
        type,
        name,
        competenceLevels: LEVELS.map((nameShort) => ({
            nameShort,
            descriptiveStatistics: { total: 10, frequency: 5, mean: 0.5 },
        })),
    };
}

describe('EN KS distribution — axis glossary terms', () => {
    beforeEach(() => {
        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('links the class to Klassenschnitt, a school row to Schulschnitt, and an unknown population to nothing', () => {
        const chart = new EnKsDistributionChart(
            CONTAINER_ID,
            {},
            {
                apiData: [
                    valueGroup({ id: 'nord', type: 'district', name: 'Bezirksschnitt' }),
                    valueGroup({ id: 'school', type: 'school', name: 'Schulschnitt' }),
                    valueGroup({ id: '8a-en', type: 'group', name: '8a' }),
                ],
            },
        );
        const stamped = new Map();
        vi.spyOn(chart, 'stampGlossaryAttr').mockImplementation((selection, key) => {
            stamped.set(selection.text(), key);
        });
        const svg = d3.select(`#${CONTAINER_ID}`).append('svg');
        const g = svg.append('g');
        const xScale = d3.scaleBand().domain(chart.groupNames).range([0, 600]);
        const yScale = d3.scaleLinear().domain([0, 100]).range([300, 0]);

        chart.createAxes(svg, g, xScale, yScale, { chartWidth: 600, chartHeight: 300 });

        expect(stamped.get('8a')).toBe(GLOSSARY_KEYS.KLASSENSCHNITT);
        expect(stamped.get('Schulschnitt')).toBe(GLOSSARY_KEYS.SCHULSCHNITT);
        expect(stamped.has('Bezirksschnitt')).toBe(false);
    });
});

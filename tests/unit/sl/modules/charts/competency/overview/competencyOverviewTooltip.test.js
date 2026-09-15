// @vitest-browser

/**
 * SL Kompetenzstufen overview — a class or Landesschnitt bar's tooltip counts its own
 * population.
 *
 * Every bar sits in its Fach's group, and the tooltip is handed that group too. The
 * class bars used to read the headcount off the group — the school's — and multiply
 * the class's share by it; the Landesschnitt bars showed no count at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetencyOverviewRenderer } from '@tba3/modules/sl/modules/charts/competency/overview/competencyOverviewRenderer.js';
import { createStackedData } from '@tba3/modules/sl/modules/charts/competency/shared/competencyChartData.js';

const CONTAINER_ID = 'sl-overview-tooltip-test';

function competenceRow({ id, type, name, counts }) {
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
        id,
        type,
        name,
        subject: { id: null, name: 'Deutsch' },
        domain: { id: 'le', name: 'Leseverstehen' },
        competenceLevels: Object.entries(counts).map(([nameShort, frequency]) => ({
            nameShort,
            name: nameShort,
            descriptiveStatistics: {
                total,
                frequency,
                mean: Math.round((frequency / total) * 1e4) / 1e4,
            },
        })),
    };
}

const ROWS = [
    competenceRow({ id: 'nw', type: 'state', name: 'Landesschnitt', counts: { I: 300, II: 700 } }),
    competenceRow({ id: 'schule', type: 'school', name: 'Schule', counts: { I: 40, II: 60 } }),
    competenceRow({ id: '8a', type: 'group', name: '8a', counts: { I: 3, II: 9 } }),
];

/** The rows the tooltip was built with, captured instead of parsing its HTML. */
function tooltipRows(chart, domainData, barRow, level, type) {
    const build = vi.spyOn(chart, 'buildTooltipHTML').mockImplementation(({ rows }) => rows);
    const rows = chart.formatTooltipContent(
        { data: domainData, stackedData: barRow, level },
        { type },
    );
    build.mockRestore();
    return rows;
}

describe('SL overview — tooltip headcounts', () => {
    beforeEach(() => {
        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it("counts a class bar's own students, not the school's", () => {
        const chart = new CompetencyOverviewRenderer(CONTAINER_ID, ROWS);
        chart.validateData();
        const [domainData] = chart.chartData;
        const [classBar] = createStackedData(
            domainData.classDistributions,
            domainData.competencyLevels,
        );

        const rows = tooltipRows(chart, domainData, classBar, 'I', 'Klasse 8a');

        expect(rows).toContainEqual({ label: 'Gesamtanzahl', value: 12 });
        expect(rows).toContainEqual({ label: expect.stringMatching(/^Anzahl /), value: 3 });
    });

    it("counts a Landesschnitt bar's own students", () => {
        const chart = new CompetencyOverviewRenderer(CONTAINER_ID, ROWS);
        chart.validateData();
        const [domainData] = chart.chartData;
        const [stateBar] = createStackedData(
            domainData.stateDistributions,
            domainData.competencyLevels,
        );

        const rows = tooltipRows(chart, domainData, stateBar, 'II', 'Landesschnitt');

        expect(rows).toContainEqual({ label: 'Gesamtanzahl', value: 1000 });
        expect(rows).toContainEqual({ label: expect.stringMatching(/^Anzahl /), value: 700 });
    });
});

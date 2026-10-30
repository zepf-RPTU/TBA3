// @vitest-browser
// (builds the card's renderer on a container element)

import { describe, expect, it } from 'vitest';

import { longitudinalCompetenceLevelShareConfig } from '../../../../../src/sl/modules/charts/longitudinal/longitudinalCompetenceLevelShareConfig.js';
import { mountChart } from '../../../../support/chartHarness.js';
import {
    KS_LEVELS,
    ROMAN_LEVELS,
    ladderValueGroup,
} from '../../../../support/competenceScaleFixture.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

/** @typedef {import('../../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup} CurrentLevelsValueGroup */
/** @typedef {import('../../../../../src/sl/modules/charts/longitudinal/longitudinalLineChart.js').LongitudinalLineChart} LongitudinalLineChart */

/**
 * The Kompetenzstufen card of the Entwicklung view draws the selected Bereich on the
 * current year's ladder (earlier years are assumed to use it too,
 * ASSUMPTION-SL-HISTORY-SAME-LADDER), and spans every year the history has, whichever
 * Bereich carries it.
 */

/**
 * A school value group of one year: the ladder's levels, one student each.
 * @param {string[]} ladder - Its levels, lowest first.
 * @param {string} year - The `testPeriod`.
 * @param {string} subjectName
 * @returns {CurrentLevelsValueGroup}
 */
function schoolRow(ladder, year, subjectName) {
    const scale = ladderValueGroup(ladder);
    return {
        ...scale,
        id: 'schule',
        type: 'school',
        name: 'Schule',
        subject: { name: subjectName },
        properties: [...(scale.properties ?? []), { key: 'testPeriod', value: year }],
        competenceLevels: scale.competenceLevels.map((level) => ({
            ...level,
            descriptiveStatistics: { total: ladder.length, frequency: 1, mean: 1 / ladder.length },
        })),
    };
}

/**
 * The card's series for Deutsch: on the Roman ladder this year, and in 2022 on the `KS`
 * one, which Mathematik's current ladder registers. Only Mathematik carries 2024.
 * @returns {Promise<import('../../../../../src/sl/modules/charts/longitudinal/longitudinalLineChart.js').LineSeries>}
 */
async function deutschSeries() {
    const context = await createSubjectContext('sl', {
        documents: {
            'competence-levels.json': [
                schoolRow(ROMAN_LEVELS, '2025', 'Deutsch'),
                schoolRow(KS_LEVELS, '2025', 'Mathematik'),
            ],
            'prior-years.json': [
                schoolRow(KS_LEVELS, '2022', 'Deutsch'),
                schoolRow(KS_LEVELS, '2024', 'Mathematik'),
            ],
        },
    });
    // One renderer: a line-chart card draws one chart.
    const host = await mountChart(
        longitudinalCompetenceLevelShareConfig,
        { context, domainIndex: 0, isStacked: false },
        { id: 'ks-card' },
    );
    const chart = /** @type {LongitudinalLineChart} */ (host.chart);
    return chart.series;
}

describe('Longitudinal Kompetenzstufen card', () => {
    it("orders and scales by the current year's ladder, whatever an earlier year lists", async () => {
        // Were the earlier year's ladder counted, Deutsch would resolve to two scales and
        // be left without one.
        expect((await deutschSeries()).categoryOrder).toEqual(ROMAN_LEVELS);
    });

    it('spans every year of the history, one only another Fach carries included', async () => {
        const series = await deutschSeries();
        expect(series.years).toEqual(['2022', '2024', '2025']);
        expect(series.timeline.map(({ year }) => year)).toEqual(['2022', '2025']);
    });
});

// @vitest-browser

/**
 * SL Kompetenzstufen overview — a group or Landesschnitt bar's tooltip counts its own
 * population.
 *
 * Every bar sits in its Fach's slot, whose school figures stand beside it. A group bar
 * must not read the headcount off the school and multiply the group's share by it, and a
 * Landesschnitt bar shows its own count.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { CompetenceOverviewRenderer } from '../../../../../../src/sl/modules/charts/competence/overview/competenceOverviewRenderer.js';
import { buildCompetenceLevelIndex } from '../../../../../../src/sl/slCompetenceLevelIndex.js';
import { readingValueGroup as competenceValueGroup } from '../../../../../support/slValueGroupFactories.js';
import { required } from '../../../../../support/required.js';
import { TERM_CONSTANTS } from '../../../../../../src/common/domain/terms.js';
import { makeVisibleChartContainer } from '../../../../../support/chartHarness.js';
import { createTestContext } from '../../../../../support/glossaryFixture.js';

const CONTAINER_ID = 'sl-overview-tooltip-test';

const INDEX = buildCompetenceLevelIndex([
    competenceValueGroup({
        id: 'nw',
        type: 'state',
        name: 'Landesschnitt',
        counts: { I: 300, II: 700 },
    }),
    competenceValueGroup({
        id: 'schule',
        type: 'school',
        name: 'Schule',
        counts: { I: 40, II: 60 },
    }),
    competenceValueGroup({ id: '8a', type: 'group', name: '8a', counts: { I: 3, II: 9 } }),
]);

/**
 * The rows of the tooltip of the Fach's bar of one kind.
 * @param {CompetenceOverviewRenderer} chart
 * @param {string} kind - `group`, `school` or `comparison`.
 * @param {string} level - The segment's level.
 * @returns {ReturnType<CompetenceOverviewRenderer['formatTooltipContent']>['rows']}
 */
function tooltipRows(chart, kind, level) {
    const bar = required(
        chart.overview.rows[0].bars.find((b) => b.kind === kind),
        `${kind} bar`,
    );
    return chart.formatTooltipContent(
        { row: required(bar.row, 'bar row'), level },
        { type: bar.subtitle },
    ).rows;
}

describe('SL overview — tooltip headcounts', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID);
    });

    it("counts a group bar's own students, not the school's", () => {
        const chart = new CompetenceOverviewRenderer(
            required(document.getElementById(CONTAINER_ID)),
            INDEX,
            {
                context: createTestContext('sl'),
            },
        );

        const rows = tooltipRows(chart, 'group', 'I');

        expect(rows).toContainEqual({ label: TERM_CONSTANTS.STUDENT_COUNT, value: '3 von 12' });
    });

    it("counts a Landesschnitt bar's own students", () => {
        const chart = new CompetenceOverviewRenderer(
            required(document.getElementById(CONTAINER_ID)),
            INDEX,
            {
                context: createTestContext('sl'),
            },
        );

        const rows = tooltipRows(chart, 'comparison', 'II');

        expect(rows).toContainEqual({
            label: TERM_CONSTANTS.STUDENT_COUNT,
            value: '700 von 1.000',
        });
    });
});

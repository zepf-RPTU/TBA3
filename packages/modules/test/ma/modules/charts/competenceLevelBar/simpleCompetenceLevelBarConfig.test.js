// @vitest-browser

// The competence-levels document carries the group plus the comparison value groups, in
// no order the spec fixes. Here the comparisons come first and dwarf the group.

import { describe, expect, it } from 'vitest';

import { simpleCompetenceLevelBarConfig } from '../../../../../src/ma/modules/charts/competenceLevelBar/simpleCompetenceLevelBarConfig.js';
import { mountChart } from '../../../../support/chartHarness.js';
import { roundedMeanValueGroup } from '../../../../support/competenceLevelGroups.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

/** @typedef {import('../../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup} CurrentLevelsValueGroup */

const STATE = roundedMeanValueGroup({
    id: 'state',
    type: 'state',
    name: 'Landesschnitt',
    frequencies: { I: 300, II: 500, III: 200 },
});
const SCHOOL = roundedMeanValueGroup({
    id: 'school',
    type: 'school',
    name: 'Schulschnitt',
    frequencies: { I: 10, II: 20, III: 30 },
});
const CLASS = roundedMeanValueGroup({
    id: '3a-mathe',
    type: 'group',
    name: '3a',
    frequencies: { I: 1, II: 2, III: 3 },
});

/**
 * The bar over the group's competence-levels document, drawn.
 * @param {CurrentLevelsValueGroup[]} competenceLevels - The group's competence-levels document.
 * @param {(level: string) => void} [onLevelToggled] - The view's segment-click handler.
 * @returns {Promise<{host: any, chart: import('../../../../../src/common/charts/stripBar/stripBarChart.js').StripBarChart}>}
 */
async function mountBar(competenceLevels, onLevelToggled) {
    const host = await mountChart(simpleCompetenceLevelBarConfig, {
        context: await createSubjectContext('ma', {
            documents: { 'competence-levels.json': competenceLevels },
        }),
        onLevelToggled,
    });
    return { host, chart: /** @type {any} */ (host.chart) };
}

describe("MA competence-level bar — the group's value group", () => {
    it("draws the group's own value group, even when the comparison value groups come first", async () => {
        const { chart } = await mountBar([STATE, SCHOOL, CLASS]);

        expect(chart.segments.map((segment) => [segment.field, segment.count])).toEqual([
            ['I', 1],
            ['II', 2],
            ['III', 3],
        ]);
        expect(chart.segments[2]?.percentage).toBeCloseTo(50, 10);
        expect(chart.segments[0]?.tooltip.title).toBe('3a');
        expect(chart.validateData()).toBe(true);
    });

    it('draws nothing from a document without a group value group', async () => {
        const { chart } = await mountBar([STATE, SCHOOL]);

        expect(chart.segments).toEqual([]);
        expect(chart.validateData()).toBe(false);
    });
});

describe('MA competence-level bar — the highlight follows the table', () => {
    it('asks to toggle the clicked level and leaves the highlight alone', async () => {
        // The table owns the selection; the bar shows a level only once the
        // table's filter holds it (a Leitidee pool has no Kompetenzstufe filter).
        /** @type {string[]} */
        const toggled = [];
        const { host, chart } = await mountBar([CLASS], (level) => toggled.push(level));

        chart.options.onSegmentClick?.('II');
        chart.options.onSegmentClick?.('II');

        expect(toggled).toEqual(['II', 'II']);
        expect(host.state.highlightedLevels.value).toEqual([]);
    });

    it('highlights every level the table reports, on the live chart', async () => {
        const { host, chart } = await mountBar([CLASS]);

        host.updateHighlight(['I', 'III']);

        expect(chart.state.highlightedKeys.value).toEqual(['I', 'III']);
    });
});

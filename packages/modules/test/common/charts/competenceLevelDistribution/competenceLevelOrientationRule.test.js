// @vitest-browser

/**
 * competence-level distribution — the orientation rule: groups whose names do not fit under
 * standing bars but do fit beside their lying rows lie down; otherwise the bars stand, and an
 * explicit orientation wins.
 */

import { effect } from '@preact/signals-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { CompetenceLevelDistributionChart } from '../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js';
import { makeVisibleChartContainer } from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';
import {
    roundedMeanValueGroup,
    STATE,
    SCHOOL,
    GROUP,
} from '../../../support/competenceLevelGroups.js';

const CONTAINER_ID = 'competence-level-orientation-rule-test';
const LONG_NAME = 'Vergleichsgruppe Gymnasien Landesschnitt Musterbundesland Schuljahr';

const named = (/** @type {string} */ id, /** @type {string} */ name) =>
    roundedMeanValueGroup({ id, type: 'state', name, frequencies: { A1: 1, A2: 1, B1: 1 } });

/**
 * @param {import('../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} apiData
 * @param {import('../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js').CompetenceLevelDistributionChartOptions} [options]
 * @returns {CompetenceLevelDistributionChart} Not yet created.
 */
function makeChart(apiData, options = {}) {
    return new CompetenceLevelDistributionChart(required(document.getElementById(CONTAINER_ID)), {
        context: createTestContext('en'),
        apiData,
        ...options,
    });
}

describe('competence-level distribution — orientation rule', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID, { widthPx: 400, heightPx: 300 });
    });

    it('stands names up that fit under a standing bar', () => {
        // The rule weighs the slot the standing chart gives a name: at 600 px the three
        // demo groups fit; at 400 px 'Landesschnitt' does not, and they lie.
        required(document.getElementById(CONTAINER_ID)).style.width = '600px';
        expect(makeChart([STATE, SCHOOL, GROUP]).isHorizontal).toBe(false);
    });

    it('lays names down that the standing slot would cut', () => {
        expect(makeChart([STATE, SCHOOL, GROUP]).isHorizontal).toBe(true);
    });

    it('lays a few long names down', () => {
        // Under a standing bar a long name wraps and is still cut; lying, it gets
        // the full axis width.
        const chart = makeChart([named('a', LONG_NAME), named('b', `${LONG_NAME} B`), GROUP]);
        expect(chart.isHorizontal).toBe(true);
    });

    it('keeps groups standing whose names would not fit beside their lying rows', () => {
        // The same five groups in a flat card: each lying row is shorter than its
        // name, which wraps over at least two lines in any sans-serif face.
        required(document.getElementById(CONTAINER_ID)).style.height = '150px';
        const valueGroups = ['a', 'b', 'c', 'd'].map((id) => named(id, `${LONG_NAME} ${id}`));
        expect(makeChart([...valueGroups, GROUP]).isHorizontal).toBe(false);
    });

    it('lays many groups down when their rows are tall enough for their names', () => {
        // The same five groups in a tall card: every name fits its lying row, and none
        // fits under a standing bar.
        required(document.getElementById(CONTAINER_ID)).style.height = '900px';
        const valueGroups = ['a', 'b', 'c', 'd'].map((id) => named(id, `${LONG_NAME} ${id}`));
        expect(makeChart([...valueGroups, GROUP]).isHorizontal).toBe(true);
    });

    it('lets a reader of its orientation follow every draw, including a flip a resize causes', () => {
        // The MA orientation toggle shows the live orientation; a resize that
        // flips the rule must reach it, or its icon and aria-pressed go stale.
        const chart = makeChart([named('a', LONG_NAME), named('b', `${LONG_NAME} B`), GROUP]);
        /** @type {boolean[]} */
        const seen = [];
        const dispose = effect(() => {
            seen.push(chart.isHorizontal);
        });
        chart.create();

        required(document.getElementById(CONTAINER_ID)).style.width = '2400px';
        // What the resize observer calls.
        if (chart.measureIfStale()) chart.drawMeasured();
        dispose();

        expect(seen.at(-2)).toBe(true);
        expect(seen.at(-1)).toBe(false);
    });

    it('lets an explicit orientation override the rule', () => {
        const chart = makeChart([named('a', LONG_NAME), GROUP], { isHorizontal: false });
        expect(chart.isHorizontal).toBe(false);
    });
});

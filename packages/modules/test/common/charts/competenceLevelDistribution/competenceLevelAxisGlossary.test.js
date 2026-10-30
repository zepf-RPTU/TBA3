// @vitest-browser

/**
 * competence-level distribution — the glossary term on each axis label follows the value group's `type`.
 *
 * A comparison population the glossary has no term for (here a `district` value group) must not
 * borrow the Lerngruppenschnitt term when its id is missing from the app's comparison list;
 * that would define a district average as the group's own.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetenceLevelDistributionChart } from '../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js';
import { GLOSSARY_KEYS } from '../../../../src/common/glossary/glossaryKeys.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { makeVisibleChartContainer } from '../../../support/chartHarness.js';
import { roundedMeanValueGroup } from '../../../support/competenceLevelGroups.js';
import { required } from '../../../support/required.js';

const CONTAINER_ID = 'en-competence-level-glossary-test';

/**
 * A value group with half its ten students on each of two levels.
 * @param {{id: string, type: string, name: string}} group
 * @returns {import('../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup}
 */
const evenGroup = (group) => roundedMeanValueGroup({ ...group, frequencies: { A1: 5, A2: 5 } });

describe('competence-level distribution — axis glossary terms', () => {
    beforeEach(() => {
        makeVisibleChartContainer(CONTAINER_ID);
    });

    it('links the group to Lerngruppenschnitt, a school to Schulschnitt, and an unknown population to nothing', () => {
        const context = createTestContext('en');
        const chart = new CompetenceLevelDistributionChart(
            required(document.getElementById(CONTAINER_ID)),
            {
                context,
                apiData: [
                    evenGroup({ id: 'nord', type: 'district', name: 'Bezirksschnitt' }),
                    evenGroup({ id: 'school', type: 'school', name: 'Schulschnitt' }),
                    evenGroup({ id: '8a-en', type: 'group', name: '8a' }),
                ],
            },
        );
        const stamped = new Map();
        vi.spyOn(context.glossary, 'stampGlossaryAttr').mockImplementation((selection, key) => {
            stamped.set(selection.text(), key);
        });

        chart.create();

        expect(stamped.get('8a')).toBe(GLOSSARY_KEYS.LERNGRUPPENSCHNITT);
        expect(stamped.get('Schulschnitt')).toBe(GLOSSARY_KEYS.SCHULSCHNITT);
        // Stamped with no key, which takes any link off a reused tick.
        expect(stamped.get('Bezirksschnitt')).toBeNull();
    });
});

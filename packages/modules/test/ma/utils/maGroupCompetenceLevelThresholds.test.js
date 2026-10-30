import { describe, it, expect } from 'vitest';

import { resolveGroupCompetenceLevelThresholds } from '../../../src/ma/utils/maGroupCompetenceLevelThresholds.js';
import { equivalenceTable } from '../../support/competenceScaleFixture.js';

const THA = 'maxScore=55;itemCount=55;I=0-26;II=27-34;III=35-41;IV=42-47;V=48-55';

/**
 * @param {string} type - The value group's role.
 * @param {Array<{key: string, value: string}>} properties
 * @returns {{id: string, type: string, properties: Array<{key: string, value: string}>}} The competence-levels.json value group.
 */
const valueGroup = (type, properties) => ({ id: `${type}-value-group`, type, properties });

describe('resolveGroupCompetenceLevelThresholds', () => {
    it("reads the thresholds off the group's own value group", () => {
        // Thresholds are level-II+ floors — the numbers a student's distance
        // to the next Kompetenzstufe is measured against.
        const data = [
            valueGroup('group', [equivalenceTable('THA', THA)]),
            valueGroup('school', []),
        ];

        expect(resolveGroupCompetenceLevelThresholds(data)).toEqual([27, 35, 42, 48]);
    });

    it('returns null, never [], when the group value group ships no table', () => {
        // The group table's preset gate reads `!thresholds`, and `![]` is false —
        // a leaked [] would render a Stufengrenze preset that filters nothing.
        const data = [valueGroup('group', [{ key: 'competenceScaleDescription', value: 'x' }])];

        expect(resolveGroupCompetenceLevelThresholds(data)).toBeNull();
    });

    it('ignores tables on school and state value groups', () => {
        // Comparison value groups can sit on another booklet entirely; judging the
        // group against a state value group's cut scores draws the boundary in the wrong
        // place with no visible error.
        const data = [valueGroup('group', []), valueGroup('state', [equivalenceTable('THA', THA)])];

        expect(resolveGroupCompetenceLevelThresholds(data)).toBeNull();
    });

    it('returns null when the cut scores are score points, not solved items', () => {
        // The Stufengrenze preset compares `correctCount` — a count of solved items —
        // with these floors. A booklet whose maxScore differs from its itemCount states
        // them in points, and the preset would pick students by a number on another
        // scale.
        const points = 'maxScore=31;itemCount=35;k.h.N.=0-6;KS 1a=7-12;KS 1b=13-18;KS 2=19-31';

        expect(
            resolveGroupCompetenceLevelThresholds([
                valueGroup('group', [equivalenceTable('TH9', points)]),
            ]),
        ).toBeNull();
    });

    it('returns null when there is no group value group or no document at all', () => {
        expect(resolveGroupCompetenceLevelThresholds(undefined)).toBeNull();
        expect(resolveGroupCompetenceLevelThresholds([])).toBeNull();
        expect(
            resolveGroupCompetenceLevelThresholds([
                valueGroup('school', [equivalenceTable('THA', THA)]),
            ]),
        ).toBeNull();
    });
});

import { describe, it, expect } from 'vitest';
import { buildSelfEfficacyInfoBoxSummary } from '../../../src/sl/utils/slSelfEfficacySummary.js';
import { calculateRatingDistribution } from '../../../src/sl/utils/slRatingDistribution.js';

/**
 * The Selbstwirksamkeit summary names the best and the weakest Lerngruppe and the distance
 * between them. Both names are claims about a real group, so only a measured group may
 * be named.
 */

/** @typedef {import('../../../src/sl/utils/slBoxPlotStats.js').BoxPlotStats} BoxPlotStats */

/**
 * @param {string} groupName - The group, or `Schule`.
 * @param {number[]} values - One mean rating per student.
 * @param {BoxPlotStats|null} [statistics] - Statistics the payload carries.
 * @returns {import('../../../src/sl/utils/slSurveyDerivation.js').SurveyAggregate}
 */
const entry = (groupName, values, statistics = null) => ({
    groupName,
    values,
    count: values.length,
    statistics,
    distribution: calculateRatingDistribution(values),
});

describe('buildSelfEfficacyInfoBoxSummary', () => {
    it('names the groups with the highest and lowest mean, and their distance', () => {
        const summary = buildSelfEfficacyInfoBoxSummary({
            selfEfficacyByGroup: [entry('8a', [3, 3]), entry('8b', [1, 2]), entry('8c', [2, 2])],
            selfEfficacySchool: entry('Schule', [1, 2, 2, 3, 3]),
        });

        expect(summary?.bestGroup?.groupName).toBe('8a');
        expect(summary?.worstGroup?.groupName).toBe('8b');
        expect(summary?.groupMeanDifference).toBeCloseTo(1.5, 10);
    });

    it('never names a group without a mean as the weakest', () => {
        // A group without a single rating, sorted last, would become the
        // "schwächste Lerngruppe" — a claim with no measurement behind it, and the distance
        // between best and worst would go missing too.
        const summary = buildSelfEfficacyInfoBoxSummary({
            selfEfficacyByGroup: [entry('8a', [3, 3]), entry('8b', [2, 2]), entry('8z', [])],
        });

        expect(summary?.worstGroup?.groupName).toBe('8b');
        expect(summary?.groupMeanDifference).toBeCloseTo(1, 10);
    });

    it('breaks a tie by group name, so the named group does not move between renders', () => {
        const summary = buildSelfEfficacyInfoBoxSummary({
            selfEfficacyByGroup: [entry('8b', [2]), entry('8a', [2])],
        });

        expect(summary?.bestGroup?.groupName).toBe('8a');
        expect(summary?.worstGroup?.groupName).toBe('8a');
    });
});

import { describe, it, expect } from 'vitest';

import { SL_DATASETS } from '../../src/sl/index.js';
import { studentFields } from '../support/competenceLevelGroups.js';
import { createSubjectContext } from '../support/subjectContext.js';

/** @typedef {import('../../src/common/data/schemas/aggregations.js').StudentAggregationsValueGroup} StudentAggregationsValueGroup */

/**
 * One students-aggregations.json value group — the API's `type=students&aggregation=result`
 * shape, trimmed to what the derivation reads.
 * @param {object} [params]
 * @param {string} [params.id] - The student id, also its name.
 * @param {string} [params.groupName] - The `group` covariate.
 * @param {string|null} [params.gender] - The `gender` covariate; none when `null`.
 * @param {string|null} [params.subject] - None when `null`.
 * @param {{id: string, name: string}} [params.domain]
 * @param {number} [params.correct] - Responses answered right.
 * @param {number} [params.incorrect] - Responses answered wrong.
 * @param {number} [params.notAttempted] - Responses left blank.
 * @param {StudentAggregationsValueGroup['aggregations']} [params.extraAggregations] - Buckets beyond the three `result` ones.
 * @returns {StudentAggregationsValueGroup}
 */
function valueGroup({
    id = 'student-1',
    groupName = 'Lerngruppe 8a',
    gender = 'female',
    subject = 'Deutsch',
    domain = { id: 'le', name: 'Lesen' },
    correct = 0,
    incorrect = 0,
    notAttempted = 0,
    extraAggregations = [],
} = {}) {
    const { properties, covariates } = studentFields(groupName, id);
    if (gender !== null) covariates.push({ type: 'gender', value: gender });

    const total = correct + incorrect + notAttempted;
    /**
     * @param {string} value - The `result` bucket.
     * @param {number} frequency - Its responses.
     * @returns {StudentAggregationsValueGroup['aggregations'][number]}
     */
    const bucket = (value, frequency) => ({
        type: 'result',
        value,
        descriptiveStatistics: { total, mean: total ? frequency / total : 0, frequency },
    });

    return {
        id,
        type: 'student',
        name: id,
        domain,
        subject: subject === null ? undefined : { name: subject },
        properties,
        covariates,
        aggregations: [
            bucket('Richtig', correct),
            bucket('Falsch', incorrect),
            bucket('Unbearbeitet', notAttempted),
            ...extraAggregations,
        ],
    };
}

/**
 * @param {StudentAggregationsValueGroup[]} valueGroups - `students-aggregations.json`.
 * @returns {Promise<import('../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').PointRecord[]>}
 */
async function pointsFrom(valueGroups) {
    const dataStore = (
        await createSubjectContext('sl', {
            documents: {
                'students-aggregations.json': valueGroups,
            },
        })
    ).documents;
    return dataStore.getDataset(SL_DATASETS.COMPARISON_POINTS);
}

describe('SL comparison points', () => {
    it('scores each student against their own answered count, not a group-wide item total', async () => {
        // The three result buckets partition the responses this student gave, so a
        // group whose students sat different booklets still gets a correct denominator.
        // A group-wide item count would understate every student of such a group.
        const [record] = await pointsFrom([
            valueGroup({ correct: 41, incorrect: 6, notAttempted: 0 }),
        ]);

        expect(record).toMatchObject({
            studentId: 'student-1',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            gender: 'female',
            groupName: 'Lerngruppe 8a',
            rawPoints: 41,
            maxPoints: 47,
        });
        expect(record.solutionRatePercent).toBeCloseTo((41 / 47) * 100, 10);
    });

    it('counts unattempted responses in the denominator but never as points', async () => {
        // A skipped item is a response the student got no credit for. Dropping it
        // from maxPoints would flatter whoever left the most blank.
        const [record] = await pointsFrom([
            valueGroup({ correct: 10, incorrect: 5, notAttempted: 5 }),
        ]);

        expect(record).toMatchObject({ rawPoints: 10, maxPoints: 20 });
        expect(record.solutionRatePercent).toBe(50);
    });

    it('ignores buckets it has no meaning for instead of counting them as responses', async () => {
        // The payload may carry other aggregation kinds (or a result vocabulary
        // this client does not know) alongside the three result buckets. Adding
        // their frequencies to maxPoints would silently deflate every rate.
        const [record] = await pointsFrom([
            valueGroup({
                correct: 6,
                incorrect: 4,
                extraAggregations: [
                    {
                        type: 'Kompetenzstufe',
                        value: 'KS 3',
                        descriptiveStatistics: { mean: 0.5, frequency: 99 },
                    },
                    {
                        type: 'result',
                        value: 'Teilweise richtig',
                        descriptiveStatistics: { mean: 0.5, frequency: 99 },
                    },
                ],
            }),
        ]);

        expect(record).toMatchObject({ rawPoints: 6, maxPoints: 10 });
    });

    it('drops a value group with no responses rather than emitting a null rate', async () => {
        // Every record carries a Lösungsquote, so a 0/0 value group has no place among them —
        // it would divide by zero, or plot as a zero that reads as "this student scored
        // nothing".
        expect(
            await pointsFrom([valueGroup({ correct: 0, incorrect: 0, notAttempted: 0 })]),
        ).toEqual([]);
    });

    it('skips value groups missing the subject every record is keyed by', async () => {
        // A record is keyed by group and subject, and the Fach selection filters
        // on the subject. Without one it has no place in the chart at all.
        expect(await pointsFrom([valueGroup({ subject: null, correct: 5, incorrect: 5 })])).toEqual(
            [],
        );
    });

    it('keeps a student without a gender covariate, with gender null', async () => {
        // Gender is optional in the spec. Only the Geschlecht category needs it
        // (it filters by value); dropping the value group would also take the student out of
        // the Lerngruppe and Fach comparisons, which never read gender.
        const points = await pointsFrom([valueGroup({ gender: null, correct: 5, incorrect: 5 })]);
        expect(points).toHaveLength(1);
        expect(points[0]).toMatchObject({ gender: null, groupName: 'Lerngruppe 8a', rawPoints: 5 });
    });

    it('keeps students with the same id in different groups apart', async () => {
        // Ids are only unique within a group in the SL payloads — the demo school
        // reuses them. Keying without the group would merge two children into one
        // record with a doubled denominator.
        const records = await pointsFrom([
            valueGroup({ id: 'shared', groupName: 'Lerngruppe 8a', correct: 8, incorrect: 2 }),
            valueGroup({ id: 'shared', groupName: 'Lerngruppe 8b', correct: 3, incorrect: 7 }),
        ]);

        expect(records).toHaveLength(2);
        expect(records.map((r) => [r.groupName, r.rawPoints])).toEqual([
            ['Lerngruppe 8a', 8],
            ['Lerngruppe 8b', 3],
        ]);
    });

    it("sums a student's buckets across repeated value groups for one domain", async () => {
        // The derivation accumulates per key rather than overwriting, so a payload
        // that splits one (student, subject, domain) over several value groups still reports
        // one rate over all of them.
        const records = await pointsFrom([
            valueGroup({ correct: 4, incorrect: 1 }),
            valueGroup({ correct: 3, incorrect: 2 }),
        ]);

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({ rawPoints: 7, maxPoints: 10 });
    });
});

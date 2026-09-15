import { describe, it, expect } from 'vitest';

import { DataStore } from '../../../src/common/services/dataStore.js';
import { defineSlDatasets } from '../../../src/sl/slDataService.js';
import { SL_DATA_KEYS } from '../../../src/sl/slDataKeys.js';

/**
 * One students_aggregation.json row — the API's `type=students&aggregation=result`
 * shape, trimmed to what the derivation reads.
 */
function row({
    id = 'student-1',
    className = 'Klasse 8a',
    gender = 'female',
    subject = 'Deutsch',
    domain = { id: 'le', name: 'Lesen' },
    correct = 0,
    incorrect = 0,
    notAttempted = 0,
    extraAggregations = [],
} = {}) {
    const covariates = [];
    if (className !== null) covariates.push({ type: 'group', label: 'Klasse', value: className });
    if (gender !== null) covariates.push({ type: 'gender', value: gender });

    const total = correct + incorrect + notAttempted;
    const bucket = (value, frequency) => ({
        type: 'Ergebnis',
        value,
        descriptiveStatistics: { total, mean: total ? frequency / total : 0, frequency },
    });

    return {
        id,
        type: 'student',
        name: id,
        domain,
        subject: subject === null ? null : { id: 'de', name: subject },
        covariates,
        aggregations: [
            bucket('Richtig', correct),
            bucket('Falsch', incorrect),
            bucket('Unbearbeitet', notAttempted),
            ...extraAggregations,
        ],
    };
}

function pointsFrom(rows) {
    const dataStore = new DataStore();
    defineSlDatasets(dataStore);
    dataStore.setRawData(SL_DATA_KEYS.STUDENTS_AGGREGATION, rows);
    return dataStore.getDataset(SL_DATA_KEYS.COMPARISON_POINTS);
}

describe('SL comparison points', () => {
    it('scores each student against their own answered count, not a class-wide item total', () => {
        // WHY: this is the whole point of reading the aggregation document. The three
        // Ergebnis buckets partition the responses *this* student gave, so a class
        // whose students sat different booklets still gets a correct denominator. MA
        // divided by the class-wide `nrItems` and understated every student on a
        // mixed-booklet class.
        const [record] = pointsFrom([row({ correct: 41, incorrect: 6, notAttempted: 0 })]);

        expect(record).toMatchObject({
            studentId: 'student-1',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            gender: 'female',
            class: 'Klasse 8a',
            rawPoints: 41,
            maxPoints: 47,
        });
        expect(record.solutionRatePercent).toBeCloseTo((41 / 47) * 100, 10);
    });

    it('counts unattempted responses in the denominator but never as points', () => {
        // WHY: a skipped item is a response the student got no credit for. Dropping it
        // from maxPoints would flatter whoever left the most blank.
        const [record] = pointsFrom([row({ correct: 10, incorrect: 5, notAttempted: 5 })]);

        expect(record).toMatchObject({ rawPoints: 10, maxPoints: 20 });
        expect(record.solutionRatePercent).toBe(50);
    });

    it('ignores buckets it has no meaning for instead of counting them as responses', () => {
        // WHY: the payload may carry other aggregation kinds (or a result vocabulary
        // this client does not know) alongside the three Ergebnis buckets. Adding
        // their frequencies to maxPoints would silently deflate every rate.
        const [record] = pointsFrom([
            row({
                correct: 6,
                incorrect: 4,
                extraAggregations: [
                    {
                        type: 'Kompetenzstufe',
                        value: 'KS 3',
                        descriptiveStatistics: { frequency: 99 },
                    },
                    {
                        type: 'Ergebnis',
                        value: 'Teilweise richtig',
                        descriptiveStatistics: { frequency: 99 },
                    },
                ],
            }),
        ]);

        expect(record).toMatchObject({ rawPoints: 6, maxPoints: 10 });
    });

    it('drops a row with no responses rather than emitting a null rate', () => {
        // WHY: the chart filters on a finite solutionRatePercent; a 0/0 record would
        // survive the DataStore and be dropped later, or plot as a zero that reads as
        // "this student scored nothing".
        expect(pointsFrom([row({ correct: 0, incorrect: 0, notAttempted: 0 })])).toEqual([]);
    });

    it('skips rows missing the class or subject every record is keyed by', () => {
        // WHY: a record is keyed by class and subject, and the Fach selection filters
        // on the subject. Without either it has no place in the chart at all.
        expect(
            pointsFrom([
                row({ className: null, correct: 5, incorrect: 5 }),
                row({ subject: null, correct: 5, incorrect: 5 }),
            ]),
        ).toEqual([]);
    });

    it('keeps a student without a gender covariate, with gender null', () => {
        // WHY: gender is optional in the spec. Only the Geschlecht category needs it
        // (it filters by value); dropping the row would also take the student out of
        // the Klasse and Fach comparisons, which never read gender.
        const points = pointsFrom([row({ gender: null, correct: 5, incorrect: 5 })]);
        expect(points).toHaveLength(1);
        expect(points[0]).toMatchObject({ gender: null, class: 'Klasse 8a', rawPoints: 5 });
    });

    it('keeps students with the same id in different classes apart', () => {
        // WHY: ids are only unique within a class in the SL payloads — the demo school
        // reuses them. Keying without the class would merge two children into one
        // record with a doubled denominator.
        const records = pointsFrom([
            row({ id: 'shared', className: 'Klasse 8a', correct: 8, incorrect: 2 }),
            row({ id: 'shared', className: 'Klasse 8b', correct: 3, incorrect: 7 }),
        ]);

        expect(records).toHaveLength(2);
        expect(records.map((r) => [r.class, r.rawPoints])).toEqual([
            ['Klasse 8a', 8],
            ['Klasse 8b', 3],
        ]);
    });

    it("sums a student's buckets across repeated rows for one domain", () => {
        // WHY: the derivation accumulates per key rather than overwriting, so a payload
        // that splits one (student, subject, domain) over several rows still reports
        // one rate over all of them.
        const records = pointsFrom([
            row({ correct: 4, incorrect: 1 }),
            row({ correct: 3, incorrect: 2 }),
        ]);

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({ rawPoints: 7, maxPoints: 10 });
    });
});

/**
 * The group path sums each item's own counts from items.json's `descriptiveStatistics`;
 * the selection path counts the selected students' results. Both count responses, because
 * the group arc and the selection tick are read against each other on one ring. An item
 * without counts or results still segments the ring but stays out of the denominator, or
 * a Leitidee with unscored items would look worse than it is.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    groupStats,
    ringFigures,
    studentRates,
} from '../../../../../src/ma/modules/charts/itemRing/ringStatistics.js';
import { ringSelection } from '../../../../../src/ma/modules/charts/itemRing/selection.js';
import { CompetenceLevelPalette } from '../../../../../src/common/services/competenceLevelPalette.js';
import { itemValueGroups } from '../../../../support/competenceScaleFixture.js';

/** @type {CompetenceLevelPalette} A fresh palette per test: no item scale unless one registers it. */
let palette;
beforeEach(() => {
    palette = new CompetenceLevelPalette();
});

/** @typedef {import('../../../../../src/ma/modules/charts/itemRing/ringStatistics.js').RingItem & {iqbId: string}} TestRingItem */

/**
 * An item as the adapter builds it: the group's counts from items.json, no per-student rows.
 * @param {string} iqbId
 * @param {string} competenceLevel - Its Aufgabenniveau.
 * @param {number} solvedCount - The group's solved responses.
 * @param {number} responseCount - The group's responses.
 * @returns {TestRingItem}
 */
const groupItem = (iqbId, competenceLevel, solvedCount, responseCount) => ({
    iqbId,
    competenceLevel,
    solvedCount,
    responseCount,
});

/**
 * An item carrying per-student results as the payload's [studentId, resultCode] pairs, and
 * no group counts.
 * @param {string} iqbId
 * @param {string} competenceLevel - Its Aufgabenniveau.
 * @param {Array<[string, number]>} results
 * @returns {TestRingItem}
 */
const scoredItem = (iqbId, competenceLevel, results) => ({
    iqbId,
    competenceLevel,
    results: new Map(results),
    solvedCount: 0,
    responseCount: 0,
});

/** The selection's name is the glossary's for several; these figures never read it. */
const GLOSSARY =
    /** @type {import('../../../../../src/common/glossary/glossaryAnnotator.js').GlossaryAnnotator} */ (
        /** @type {unknown} */ ({ getRequiredEntryText: () => 'Ausgewählte Schüler:innen' })
    );

/**
 * A student of the group, named as every student entry is.
 * @param {string} studentId
 * @returns {import('../../../../../src/ma/modules/charts/itemRing/selection.js').RingStudent}
 */
const ringStudent = (studentId) => ({ studentId, firstName: studentId, lastName: 'Muster' });

/**
 * @param {string[]} ids
 * @param {Array<import('../../../../../src/ma/modules/charts/itemRing/selection.js').RingStudent>} students
 * @returns {import('../../../../../src/ma/modules/charts/itemRing/selection.js').RingSelection}
 */
const select = (ids, students) => ringSelection(GLOSSARY, ids, students);

/**
 * The figures a ring draws for a selection: the selected students are a proper subset,
 * because the group also holds one student nobody selected.
 * @param {TestRingItem[]} items
 * @param {string[]} studentIds - The selected students.
 * @returns {import('../../../../../src/ma/modules/charts/itemRing/ringStatistics.js').RingStats}
 */
const selectionFigures = (items, studentIds) =>
    ringFigures(palette, items, select(studentIds, [...studentIds, 'unselected'].map(ringStudent)))
        .ringStats;

describe('groupStats', () => {
    it("counts each item's own responses, not its mean against the group size", () => {
        // 25 students are in the group, but 20 answered this item and 3 of them solved it.
        // Multiplying the item mean by the headcount gives a count of responses this item
        // never had, and one the table's bar beside it disagrees with.
        // The item's share field the stats must not read: the spread keeps the excess key.
        const withShare = { ...groupItem('i1', 'II', 3, 20), percentageCorrect: 90 };
        const stats = groupStats(palette, [withShare]);

        expect(stats.totalCorrect).toBe(3);
        expect(stats.totalOpportunities).toBe(20);
        expect(stats.successRate).toBe(15);
    });

    it('keeps an item without counts in the ring but out of the denominator', () => {
        // The outer ring segments by item, so an item nobody answered still has to
        // appear. Counting it as 0 % would report the Leitidee as harder than it was.
        const stats = groupStats(palette, [
            groupItem('i1', 'II', 10, 10),
            groupItem('i2', 'II', 0, 0),
            // No counts at all, which the adapter never builds (it writes 0); the stats
            // must keep such an item out of the denominator all the same.
            /** @type {TestRingItem} */ (
                /** @type {unknown} */ ({ iqbId: 'i3', competenceLevel: 'II' })
            ),
        ]);

        expect(stats.totalItems).toBe(3);
        expect(stats.itemCompetenceLevelDistribution).toEqual([
            { level: 'II', count: 3, successRate: 100 },
        ]);
        expect(stats.totalOpportunities).toBe(10);
        expect(stats.successRate).toBe(100);
    });

    it('rates each level against its own responses', () => {
        const stats = groupStats(palette, [
            groupItem('i1', 'I', 10, 10),
            groupItem('i2', 'II', 2, 10),
            groupItem('i3', 'II', 4, 10),
        ]);

        expect(stats.itemCompetenceLevelDistribution).toEqual([
            { level: 'I', count: 1, successRate: 100 },
            { level: 'II', count: 2, successRate: 30 },
        ]);
    });

    it('gives a level nobody answered no rate, not 0 %', () => {
        // The focus table and the screen-reader sentence would report a measured 0 %.
        const stats = groupStats(palette, [
            groupItem('i1', 'I', 5, 10),
            groupItem('i2', 'II', 0, 0),
        ]);

        expect(stats.itemCompetenceLevelDistribution).toEqual([
            { level: 'I', count: 1, successRate: 50 },
            { level: 'II', count: 1, successRate: null },
        ]);
    });

    it('returns the zeroed shape the empty placeholder ring renders from', () => {
        // A Leitidee the booklet declares but carries no items for still draws a ring —
        // it reads these zeros rather than special-casing its own numbers.
        expect(groupStats(palette, [])).toEqual({
            totalItems: 0,
            itemCompetenceLevelDistribution: [],
            successRate: 0,
            totalCorrect: 0,
            totalOpportunities: 0,
        });
    });
});

describe('ringFigures for a selection', () => {
    it('counts only a recorded solve, and treats a missing result as a failed attempt', () => {
        // s2 has no row for this item. The ring must still show the item as attempted,
        // otherwise selecting a pupil with gaps would inflate their success rate.
        const stats = selectionFigures(
            [
                scoredItem('i1', 'II', [
                    ['s1', 1],
                    ['s3', 0],
                ]),
            ],
            ['s1', 's2'],
        );

        expect(stats.totalCorrect).toBe(1);
        expect(stats.totalOpportunities).toBe(2);
        expect(stats.successRate).toBe(50);
    });

    it('counts only resultCode 1 as solved', () => {
        // A partially-credited or missing code is not a solve.
        const stats = selectionFigures(
            [scoredItem('i1', 'II', [['s1', 0]]), scoredItem('i2', 'II', [['s1', 1]])],
            ['s1'],
        );

        expect(stats.totalCorrect).toBe(1);
        expect(stats.totalOpportunities).toBe(2);
    });

    it('keeps an item without results in the ring but out of the denominator', () => {
        const stats = selectionFigures(
            [scoredItem('i1', 'II', [['s1', 1]]), groupItem('i2', 'II', 0, 0)],
            ['s1'],
        );

        expect(stats.totalItems).toBe(2);
        expect(stats.itemCompetenceLevelDistribution).toEqual([
            { level: 'II', count: 2, successRate: 100 },
        ]);
        expect(stats.totalOpportunities).toBe(1);
    });

    it('treats an empty result list like a missing one', () => {
        // The adapter gives every item a `results` map, empty when nobody was
        // scored on it. A guard checking only that the map exists would count such an item as
        // failed by every selected student and pull the selection's rate down.
        const stats = selectionFigures(
            [scoredItem('i1', 'II', [['s1', 1]]), scoredItem('i2', 'II', [])],
            ['s1'],
        );

        expect(stats.totalOpportunities).toBe(1);
        expect(stats.successRate).toBe(100);
    });

    it('reads an empty selection as the whole group', () => {
        // Without a selection the inner ring shows the group figures: the same object,
        // not a recount.
        const items = [
            scoredItem('i1', 'II', [
                ['s1', 1],
                ['s2', 0],
            ]),
        ];

        const students = [ringStudent('s1'), ringStudent('s2')];
        const empty = ringFigures(palette, items, select([], students));
        expect(empty.ringStats).toBe(empty.groupStats);

        const selected = ringFigures(palette, items, select(['s1'], students));
        expect(selected.ringStats.totalOpportunities).toBe(1);
    });

    it('reads a selection of every student as the whole group', () => {
        // The tick is drawn only for a proper subset, so the figures follow the same rule:
        // a recount over everyone would also score a missing result as unsolved.
        const items = [
            scoredItem('i1', 'II', [
                ['s1', 1],
                ['s2', 0],
            ]),
        ];
        const students = [ringStudent('s1'), ringStudent('s2')];

        const all = ringFigures(palette, items, select(['s1', 's2'], students));
        expect(all.ringStats).toBe(all.groupStats);
    });

    it('returns the zeroed shape when the Leitidee carries no items', () => {
        expect(selectionFigures([], ['s1'])).toEqual({
            totalItems: 0,
            itemCompetenceLevelDistribution: [],
            successRate: 0,
            totalCorrect: 0,
            totalOpportunities: 0,
        });
    });
});

describe('level order', () => {
    it('follows the registered item scale, not the alphabet', () => {
        // The ladder is the payload's. Sorted alphabetically, one whose labels do
        // not sort that way draws its inner-ring segments `hoch, mittel, niedrig`.
        palette.registerItemCompetenceScales(itemValueGroups(['niedrig', 'mittel', 'hoch']));

        const fromCounts = groupStats(palette, [
            groupItem('i1', 'hoch', 1, 1),
            groupItem('i2', 'niedrig', 1, 1),
            groupItem('i3', 'mittel', 1, 1),
        ]);
        const fromResults = selectionFigures(
            [
                scoredItem('i1', 'hoch', [['s1', 1]]),
                scoredItem('i2', 'niedrig', [['s1', 1]]),
                scoredItem('i3', 'mittel', [['s1', 1]]),
            ],
            ['s1'],
        );

        expect(fromCounts.itemCompetenceLevelDistribution.map((n) => n.level)).toEqual([
            'niedrig',
            'mittel',
            'hoch',
        ]);
        expect(fromResults.itemCompetenceLevelDistribution.map((n) => n.level)).toEqual([
            'niedrig',
            'mittel',
            'hoch',
        ]);
    });
});

describe('group and selection figures agree', () => {
    it('report the same rate when every student solved the same items', () => {
        // The group arc and the selection tick are read against each other on one ring,
        // so a whole-group selection must land on the group arc, not beside it.
        /** @type {Array<[string, number]>} */
        const results = [
            ['s1', 1],
            ['s2', 1],
            ['s3', 0],
            ['s4', 0],
        ];
        const fromResults = selectionFigures(
            [scoredItem('i1', 'II', results)],
            ['s1', 's2', 's3', 's4'],
        );
        const fromCounts = groupStats(palette, [groupItem('i1', 'II', 2, 4)]);

        expect(fromResults.successRate).toBe(fromCounts.successRate);
        expect(fromResults.totalCorrect).toBe(fromCounts.totalCorrect);
    });
});

describe('studentRates', () => {
    // The focus card lists each student at a rate; selecting that student turns the ring
    // to its centre. Both must count the same way, or a name listed below the group
    // opens a ring that says otherwise.
    const students = [ringStudent('a'), ringStudent('b'), ringStudent('c')];
    /** @type {TestRingItem[]} */
    const items = [
        {
            ...groupItem('i1', 'II', 1, 2),
            results: new Map([
                ['a', 1],
                ['b', 0],
            ]),
        },
        // `a` missing from a scored item counts as a miss, as in a selection.
        { ...groupItem('i2', 'II', 1, 1), results: new Map([['b', 1]]) },
        { ...groupItem('i3', 'II', 0, 0), results: new Map() },
    ];

    it('gives each student the rate the ring centre shows for them alone', () => {
        for (const { student, rate } of studentRates(items, students)) {
            const { ringStats } = ringFigures(
                palette,
                items,
                select([student.studentId], students),
            );
            expect(rate).toBe(ringStats.successRate);
        }
    });

    it('leaves out a student no item has a result for', () => {
        expect(studentRates(items, students).map(({ student }) => student.studentId)).toEqual([
            'a',
            'b',
        ]);
    });
});

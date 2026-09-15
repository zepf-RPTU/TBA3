/**
 * MA task-ring statistics.
 *
 * Every number a task ring draws comes from these two functions. The class path sums each
 * item's own result counts from the per-item aggregation; the selection path counts the
 * selected students' actual results. Both count responses, because the class arc and the
 * selection tick sit on the same ring and are read against each other.
 *
 * These tests also lock the rules that decide what is *not* counted: an item the payload
 * gave no counts or results for still segments the ring but must stay out of the
 * denominator, or a Leitidee with unscored tasks would look worse than it is.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
    classStats,
    selectionStats,
} from '@tba3/modules/ma/modules/charts/taskRing/ringStatistics.js';
import {
    registerItemCompetenceScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { itemPayloadRows } from '../../../../support/competenceScaleFixture.js';

/** An item as the adapter builds it: the class's result counts, no per-student rows. */
const classItem = (iqbId, competenceLevel, correctCount, total) => ({
    iqbId,
    competenceLevel,
    correctCount,
    total,
});

/** An item carrying per-student results as the payload's [studentId, ergebnis] pairs. */
const scoredItem = (iqbId, competenceLevel, results) => ({ iqbId, competenceLevel, results });

describe('classStats', () => {
    it("counts each item's own responses, not its mean against the class size", () => {
        // WHY: 25 students sit the class, but 20 answered this item and 3 of them solved it.
        // The ring used to multiply the item mean by the headcount — a count of responses
        // this item never had, and one the table's bar beside it disagreed with.
        const stats = classStats([{ ...classItem('i1', 'II', 3, 20), percentageCorrect: 90 }]);

        expect(stats.totalCorrect).toBe(3);
        expect(stats.totalOpportunities).toBe(20);
        expect(stats.successRate).toBe(15);
    });

    it('keeps an item without counts in the ring but out of the denominator', () => {
        // The outer ring segments by item, so an item the per-item aggregation does not
        // cover still has to appear. Counting it as 0 % would report the Leitidee as
        // harder than it was.
        const stats = classStats([
            classItem('i1', 'II', 10, 10),
            classItem('i2', 'II', 0, 0),
            { iqbId: 'i3', competenceLevel: 'II' },
        ]);

        expect(stats.totalTasks).toBe(3);
        expect(stats.niveauDistribution).toEqual([{ niveau: 'II', count: 3, successRate: 100 }]);
        expect(stats.totalOpportunities).toBe(10);
        expect(stats.successRate).toBe(100);
    });

    it('derives from its own inputs — two classes on one booklet never share figures', () => {
        // Same booklet, same headcount: a module-global cache once keyed exactly this pair
        // and would have handed the second class the first one's numbers.
        const booklet = (correct) => [
            classItem('i1', 'II', correct, 24),
            classItem('i2', 'III', correct, 24),
        ];

        const classA = classStats(booklet(19));
        const classB = classStats(booklet(7));

        expect(classA.totalCorrect).toBe(38);
        expect(classB.totalCorrect).toBe(14);
        expect(classA.successRate).not.toBe(classB.successRate);
    });

    it('reports totalTasks as the item count, not the response count', () => {
        // The ring centre prints this number as "N Items".
        const stats = classStats([classItem('i1', 'II', 10, 20), classItem('i2', 'III', 10, 20)]);

        expect(stats.totalTasks).toBe(2);
        expect(stats.totalOpportunities).toBe(40);
    });

    it('sorts the niveau segments so the inner ring always draws them in Niveau order', () => {
        const stats = classStats([
            classItem('i1', 'III', 10, 10),
            classItem('i2', 'I', 0, 10),
            classItem('i3', 'II', 5, 10),
        ]);

        expect(stats.niveauDistribution.map((n) => n.niveau)).toEqual(['I', 'II', 'III']);
    });

    it('rates each niveau against its own responses', () => {
        const stats = classStats([
            classItem('i1', 'I', 10, 10),
            classItem('i2', 'II', 2, 10),
            classItem('i3', 'II', 4, 10),
        ]);

        expect(stats.niveauDistribution).toEqual([
            { niveau: 'I', count: 1, successRate: 100 },
            { niveau: 'II', count: 2, successRate: 30 },
        ]);
    });

    it('returns the zeroed shape the empty placeholder ring renders from', () => {
        // A Leitidee the booklet declares but carries no tasks for still draws a ring —
        // it reads these zeros rather than special-casing its own numbers.
        expect(classStats([])).toEqual({
            totalTasks: 0,
            niveauDistribution: [],
            successRate: 0,
            totalCorrect: 0,
            totalOpportunities: 0,
        });
    });
});

describe('selectionStats', () => {
    it('counts only a recorded solve, and treats a missing result as a failed attempt', () => {
        // s2 has no row for this item. The ring must still show the task as attempted,
        // otherwise selecting a pupil with gaps would inflate their success rate.
        const stats = selectionStats(
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

    it('counts only ergebnis 1 as solved', () => {
        // A partially-credited or missing code is not a solve.
        const stats = selectionStats(
            [scoredItem('i1', 'II', [['s1', 0]]), scoredItem('i2', 'II', [['s1', 1]])],
            ['s1'],
        );

        expect(stats.totalCorrect).toBe(1);
        expect(stats.totalOpportunities).toBe(2);
    });

    it('keeps an item without results in the ring but out of the denominator', () => {
        const stats = selectionStats(
            [scoredItem('i1', 'II', [['s1', 1]]), { iqbId: 'i2', competenceLevel: 'II' }],
            ['s1'],
        );

        expect(stats.totalTasks).toBe(2);
        expect(stats.niveauDistribution).toEqual([{ niveau: 'II', count: 2, successRate: 100 }]);
        expect(stats.totalOpportunities).toBe(1);
    });

    it('accepts a single id, a list of ids, and student objects alike', () => {
        // The selection reaches this function from three call paths with three shapes.
        const items = [
            scoredItem('i1', 'II', [
                ['s1', 1],
                ['s2', 0],
            ]),
        ];

        expect(selectionStats(items, 's1').totalCorrect).toBe(1);
        expect(selectionStats(items, ['s1', 's2']).totalCorrect).toBe(1);
        expect(selectionStats(items, [{ studentId: 's1' }]).totalOpportunities).toBe(1);
    });

    it('scales opportunities with the size of the selection', () => {
        const items = [
            scoredItem('i1', 'II', [
                ['s1', 1],
                ['s2', 1],
            ]),
        ];

        expect(selectionStats(items, ['s1']).totalOpportunities).toBe(1);
        expect(selectionStats(items, ['s1', 's2']).totalOpportunities).toBe(2);
    });

    it('reports totalTasks as the item count, not the opportunity count', () => {
        const stats = selectionStats(
            [
                scoredItem('i1', 'II', [
                    ['s1', 1],
                    ['s2', 1],
                ]),
                scoredItem('i2', 'II', [
                    ['s1', 1],
                    ['s2', 1],
                ]),
            ],
            ['s1', 's2'],
        );

        expect(stats.totalTasks).toBe(2);
        expect(stats.totalOpportunities).toBe(4);
    });

    it('sorts the niveau segments so the inner ring always draws them in Niveau order', () => {
        const stats = selectionStats(
            [
                scoredItem('i1', 'III', [['s1', 1]]),
                scoredItem('i2', 'I', [['s1', 0]]),
                scoredItem('i3', 'II', [['s1', 1]]),
            ],
            ['s1'],
        );

        expect(stats.niveauDistribution.map((n) => n.niveau)).toEqual(['I', 'II', 'III']);
    });

    it('returns the zeroed shape when the Leitidee carries no tasks', () => {
        expect(selectionStats([], ['s1'])).toEqual({
            totalTasks: 0,
            niveauDistribution: [],
            successRate: 0,
            totalCorrect: 0,
            totalOpportunities: 0,
        });
    });
});

describe('niveau order', () => {
    afterEach(() => resetCompetenceLevelPalette());

    it('follows the registered item scale, not the alphabet', () => {
        // WHY: the ladder is the payload's. One whose labels do not sort alphabetically
        // had its inner-ring segments drawn `hoch, mittel, niedrig`.
        registerItemCompetenceScales(itemPayloadRows(['niedrig', 'mittel', 'hoch']));

        const fromCounts = classStats([
            classItem('i1', 'hoch', 1, 1),
            classItem('i2', 'niedrig', 1, 1),
            classItem('i3', 'mittel', 1, 1),
        ]);
        const fromResults = selectionStats(
            [
                scoredItem('i1', 'hoch', [['s1', 1]]),
                scoredItem('i2', 'niedrig', [['s1', 1]]),
                scoredItem('i3', 'mittel', [['s1', 1]]),
            ],
            ['s1'],
        );

        expect(fromCounts.niveauDistribution.map((n) => n.niveau)).toEqual([
            'niedrig',
            'mittel',
            'hoch',
        ]);
        expect(fromResults.niveauDistribution.map((n) => n.niveau)).toEqual([
            'niedrig',
            'mittel',
            'hoch',
        ]);
    });
});

describe('classStats and selectionStats agree', () => {
    it('report the same rate when every student solved the same tasks', () => {
        // The class arc and the selection tick are read against each other on one ring,
        // so a whole-class selection must land on the class arc, not beside it.
        const results = [
            ['s1', 1],
            ['s2', 1],
            ['s3', 0],
            ['s4', 0],
        ];
        const fromResults = selectionStats(
            [scoredItem('i1', 'II', results)],
            ['s1', 's2', 's3', 's4'],
        );
        const fromCounts = classStats([classItem('i1', 'II', 2, 4)]);

        expect(fromResults.successRate).toBe(fromCounts.successRate);
        expect(fromResults.totalCorrect).toBe(fromCounts.totalCorrect);
    });
});

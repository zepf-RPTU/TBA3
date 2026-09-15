/**
 * Item order inside one exercise.
 *
 * The payload states booklet order two ways at once, and only one of them is a field.
 * The array itself is the booklet — exercise blocks in order, contiguous — while
 * `position` is an ordinal that restarts at 1 in every exercise. Reading the field as if
 * it ranked the whole value-group is the mistake these tests exist to prevent: it looks
 * right on the demo fixtures and reorders any payload whose exercises hold several items.
 *
 * So each case pins one half of that contract: the ordinal decides *within* a block,
 * and nothing decides *between* blocks except the order they arrived in.
 */

import { describe, it, expect } from 'vitest';
import { sortItemsWithinExercises } from '@tba3/modules/common/domain/bookletOrder.js';

/**
 * @param {string} name - item name, as printed in the booklet ("5.2")
 * @param {number|null} position - the item's ordinal inside its exercise
 * @param {string} exerciseId - the exercise the item belongs to
 */
const item = (name, position, exerciseId) => ({
    iqbId: `IQB-${name}`,
    name,
    position,
    exercise: { id: exerciseId, name: `Exercise ${exerciseId}` },
});

const names = (items) => items.map((i) => i.name);

describe('sortItemsWithinExercises', () => {
    it('orders an exercise by its declared position, not by array order', () => {
        // WHY: this is the whole point of reading the field — the app must not infer
        // item order within an exercise from the sequence the payload happened to use.
        const shuffled = [item('5.3', 3, 'E5'), item('5.1', 1, 'E5'), item('5.2', 2, 'E5')];

        expect(names(sortItemsWithinExercises(shuffled))).toEqual(['5.1', '5.2', '5.3']);
    });

    it('does not sort a value-group by position across exercises', () => {
        // WHY: `position` restarts at 1 in every exercise, so a flat sort by it would
        // interleave the booklet — any multi-item booklet would come out
        // scrambled, with all the "1"s pulled to the front. If this test fails, the
        // implementation has been "simplified" into exactly that bug.
        const bookletOrder = [
            item('4.1', 1, 'E4'),
            item('5.1', 1, 'E5'),
            item('5.2', 2, 'E5'),
            item('5.3', 3, 'E5'),
            item('6.1', 1, 'E6'),
            item('6.2', 2, 'E6'),
        ];

        expect(sortItemsWithinExercises(bookletOrder)).toEqual(bookletOrder);
    });

    it('keeps two separate runs of the same exercise apart', () => {
        // WHY: a booklet may list one exercise twice in a value-group, each run
        // starting over at position 1. Grouping by exercise id instead of by
        // contiguous run would merge the two blocks and move the second one to the
        // front of the booklet.
        const repeated = [
            item('26.1', 1, 'EX_A'),
            item('27.1', 1, 'EX_B'),
            item('54.1', 1, 'EX_A'),
        ];

        expect(names(sortItemsWithinExercises(repeated))).toEqual(['26.1', '27.1', '54.1']);
    });

    it('keeps array order when an exercise ties on position', () => {
        // WHY: the demo fixtures carried the reference's meaning of the field — the
        // exercise number, identical for every item of an exercise. Ties must fall back
        // to array order so a stale fixture cannot reshuffle a class's items.
        const tied = [item('2.1', 2, 'E2'), item('2.2', 2, 'E2'), item('2.3', 2, 'E2')];

        expect(names(sortItemsWithinExercises(tied))).toEqual(['2.1', '2.2', '2.3']);
    });

    it('leaves an exercise alone when any of its items lacks a position', () => {
        // WHY: `position` is optional in the spec. A partial ordinal ranks nothing, and
        // treating a missing one as 0 would silently promote that item to the top of
        // its exercise.
        const partial = [item('7.1', null, 'E7'), item('7.2', 2, 'E7'), item('7.3', 1, 'E7')];

        expect(names(sortItemsWithinExercises(partial))).toEqual(['7.1', '7.2', '7.3']);
    });

    it('groups by exercise name when the payload carries no exercise id', () => {
        // WHY: the demo fixtures ship `exercise.id: null` — falling back to the name is
        // what keeps their blocks from collapsing into one run keyed by null.
        const unidentified = [
            { name: '1.2', position: 2, exercise: { id: null, name: 'Brian' } },
            { name: '1.1', position: 1, exercise: { id: null, name: 'Brian' } },
            { name: '2.1', position: 1, exercise: { id: null, name: 'Winter' } },
        ];

        expect(names(sortItemsWithinExercises(unidentified))).toEqual(['1.1', '1.2', '2.1']);
    });

    it('leaves items that name no exercise in array order', () => {
        // WHY: `position` only ranks items against their own exercise. Items with no
        // exercise at all would otherwise share one run key and be sorted against each
        // other — the value-group-wide scramble this helper exists to prevent, on the
        // one payload shape the adapters already defend against elsewhere
        // (`item.exercise ?? { name: '' }` in enItemDataAdapter).
        const unattached = [
            { name: '9.2', position: 2 },
            { name: '8.1', position: 1 },
            { name: '7.1', position: 1 },
        ];

        expect(names(sortItemsWithinExercises(unattached))).toEqual(['9.2', '8.1', '7.1']);
    });

    it('tolerates an empty or absent item list', () => {
        // WHY: a state-level scope can ship an items.json with no groups at all.
        expect(sortItemsWithinExercises([])).toEqual([]);
        expect(sortItemsWithinExercises(undefined)).toEqual([]);
        expect(sortItemsWithinExercises(null)).toEqual([]);
    });
});

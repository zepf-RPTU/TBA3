/**
 * Item order inside one exercise.
 *
 * The array itself is the booklet: exercise blocks in order, contiguous. `position` is an
 * ordinal that restarts at 1 in every exercise, so it decides within a block, and nothing
 * decides between blocks except the order they arrived in. Read as a rank over the whole
 * value-group it looks right on the demo fixtures and reorders any payload whose exercises
 * hold several items.
 */

import { describe, it, expect } from 'vitest';
import { sortItemsWithinExercises } from '../../../src/common/domain/bookletOrder.js';

/**
 * @param {string} name - item name, as printed in the booklet ("5.2")
 * @param {number} position - the item's ordinal inside its exercise
 * @param {string} exerciseId
 */
const item = (name, position, exerciseId) => ({
    iqbId: `IQB-${name}`,
    name,
    position,
    exercise: { id: exerciseId, name: `Exercise ${exerciseId}` },
});

const names = (/** @type {{name: string}[]} */ items) => items.map((i) => i.name);

describe('sortItemsWithinExercises', () => {
    it('orders an exercise by its declared position, not by array order', () => {
        // The app must not infer item order within an exercise from the sequence the
        // payload happened to use.
        const shuffled = [item('5.3', 3, 'E5'), item('5.1', 1, 'E5'), item('5.2', 2, 'E5')];

        expect(names(sortItemsWithinExercises(shuffled))).toEqual(['5.1', '5.2', '5.3']);
    });

    it('does not sort a value-group by position across exercises', () => {
        // `position` restarts at 1 in every exercise, so a flat sort by it would
        // interleave the booklet, with all the "1"s pulled to the front.
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
        // A booklet may list one exercise twice in a value-group, each run
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
        // A payload may put the exercise number in the field, identical for every item
        // of an exercise. Ties fall back to array order so it cannot reshuffle the items.
        const tied = [item('2.1', 2, 'E2'), item('2.2', 2, 'E2'), item('2.3', 2, 'E2')];

        expect(names(sortItemsWithinExercises(tied))).toEqual(['2.1', '2.2', '2.3']);
    });

    it('groups by exercise name when the payload carries no exercise id', () => {
        // The demo fixtures ship no `exercise.id` — falling back to the name is
        // what keeps their blocks from collapsing into one run keyed by nothing.
        const unidentified = [
            { name: '1.2', position: 2, exercise: { name: 'Brian' } },
            { name: '1.1', position: 1, exercise: { name: 'Brian' } },
            { name: '2.1', position: 1, exercise: { name: 'Winter' } },
        ];

        expect(names(sortItemsWithinExercises(unidentified))).toEqual(['1.1', '1.2', '2.1']);
    });

    it('tolerates an empty item list', () => {
        // A state-level scope can ship an items.json with no groups at all.
        expect(sortItemsWithinExercises([])).toEqual([]);
    });
});

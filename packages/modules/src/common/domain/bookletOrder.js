/**
 * Item order inside one exercise, read from `item.position`, not from array order.
 *
 * `items.json` arrives in booklet order, but only half of that ordering is stated by a
 * field. The API sorts a value-group by `(exercise number, position)`; the exercise
 * number exists only as the integer prefix of `item.name`, while `position` restarts at
 * 1 in every exercise. So `position` orders items within an exercise only: sorting a
 * whole value-group by it scrambles the booklet. Exercise blocks keep their array order.
 */

/**
 * Order each exercise's items by their declared `position`, preserving the sequence of
 * exercises.
 * @template {{position: number, exercise: {id?: string, name: string}}} [T=any]
 * @param {T[]} items - raw API items of one value-group
 * @returns {T[]} the same items, reordered only inside each exercise
 */
export function sortItemsWithinExercises(items) {
    if (items.length < 2) return items;

    /** @type {T[]} */
    const ordered = [];
    /** @type {T[]} */
    let run = [];
    let runKey;

    // Only a contiguous run is one exercise's block: a booklet may list one exercise
    // twice, its positions starting over, and keying globally would merge the two.
    const flushRun = () => {
        // Stable, so equal positions stay in the order the payload listed them.
        run.sort((a, b) => a.position - b.position);
        ordered.push(...run);
    };

    for (const item of items) {
        const key = item.exercise.id ?? item.exercise.name;
        if (key !== runKey) {
            flushRun();
            run = [];
            runKey = key;
        }
        run.push(item);
    }
    flushRun();

    return ordered;
}

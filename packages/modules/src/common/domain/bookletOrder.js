/**
 * Item order inside one exercise — read from `item.position`, not from array order.
 *
 * `items.json` arrives in booklet order, but only half of that ordering is stated by a
 * field. The API sorts a value-group by `(exercise number, position)`; the exercise
 * number exists only as the integer prefix of `item.name`, while `position` restarts at
 * 1 in *every* exercise. So `position` orders items **within** an exercise and nothing
 * else — sorting a whole value-group by it scrambles the booklet (a typical booklet has
 * only a handful of distinct positions across dozens of items).
 *
 * This takes the declared ordinal where the payload states one and leaves array order
 * alone everywhere else: exercise blocks keep their positions and their contents.
 *
 * Shared by the EN and MA item adapters, which must not disagree about item order.
 */

/**
 * Order each exercise's items by their declared `position`, preserving the sequence of
 * exercises.
 * @param {Array<object> | null | undefined} items - raw API items of one value-group
 * @returns {Array<object>} the same items, reordered only inside each exercise
 */
export function sortItemsWithinExercises(items) {
    if (!Array.isArray(items) || items.length < 2) return items ?? [];

    const ordered = [];
    let run = [];
    let runKey;

    // Only a *contiguous* run is one exercise's block. An exercise can legitimately
    // reappear later in the same group with its positions starting over (a booklet may
    // list one exercise twice); keying globally would merge those two blocks into one.
    const flushRun = () => {
        // A run whose items do not all declare a position keeps array order — `position`
        // is optional in the spec, and half an ordinal is no ordinal.
        if (run.length > 1 && run.every((item) => Number.isFinite(item?.position))) {
            // Stable, so equal positions stay in the order the payload listed them.
            run.sort((a, b) => a.position - b.position);
        }
        ordered.push(...run);
    };

    for (const item of items) {
        // No exercise identity → the item is its own run. `position` is an ordinal
        // *relative to an exercise*, so without one it ranks nothing; folding these
        // into one shared run would sort them against each other, which is the
        // value-group-wide scramble this helper exists to avoid.
        const key = item?.exercise?.id ?? item?.exercise?.name ?? null;
        if (key === null || key !== runKey) {
            flushRun();
            run = [];
            runKey = key;
        }
        run.push(item);
    }
    flushRun();

    return ordered;
}

/**
 * The building blocks every document schema is made of. An optional field is left out,
 * as the server does; `null` is not a value any field takes.
 */

import * as v from 'valibot';

/**
 * A string with something in it: an id, a type or a name a reader needs to tell value
 * groups apart. Trimmed as it lands, so no reader trims it again.
 */
export const Text = v.pipe(v.string(), v.trim(), v.minLength(1, 'Expected a non-empty string'));

/**
 * A domain's id. 'all' is taken: the dashboards name every domain together by it (a
 * Gesamt ring, an item pool, a domain mode), so a domain of that id would be mistaken
 * for the whole.
 */
export const DomainId = v.pipe(
    Text,
    v.check((id) => id !== 'all', "'all' is reserved for every domain together"),
);

export const OptionalNumber = v.optional(v.number());

/**
 * A group's statistics: only `mean` is required, as a comparison population may deliver
 * its shares alone, its source storing no headcounts.
 */
export const DescriptiveStatistics = v.looseObject({
    mean: v.number(),
    total: OptionalNumber,
    frequency: OptionalNumber,
    standardDeviation: OptionalNumber,
});

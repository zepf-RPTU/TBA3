/**
 * The value group: the entry every array document is made of. `id`, `type` and `name` are
 * required: `type` is TBA3's discriminator (the spec leaves it optional), and `id` and
 * `name` are what tables, legends and comparison labels show. The rest is optional, and
 * its shape is checked wherever it is present. A `domain` has an `id` (the spec requires
 * only its `name`): every reader knows a Domäne by its id, and shows it by its `name`.
 */

import * as v from 'valibot';
import { COVARIATE_TYPE, PROPERTY_KEY, RATING_DOMAIN } from '../../domain/apiValueMaps.js';
import { DomainId, Text } from './primitives.js';

/**
 * An entry's value, trimmed as it lands like every `Text`: a covariate such as `group` is
 * joined against a value group's trimmed `name`.
 */
const EntryValue = v.pipe(v.string(), v.trim());

/** @type {ReadonlySet<string>} */
const RATING_KEYS = new Set([PROPERTY_KEY.TEACHING_QUALITY_MEAN, PROPERTY_KEY.SELF_EFFICACY_MEAN]);

/**
 * Whether a survey mean is on the rating scale. A value that is no number (`k. A.`) is
 * read as no answer (`getPropertyValue`), and every other key passes.
 * @param {{key: string, value: string}} property
 * @returns {boolean}
 */
function isRatingInRange({ key, value }) {
    if (!RATING_KEYS.has(key)) return true;
    const rating = parseFloat(value);
    const [min, max] = RATING_DOMAIN;
    return isNaN(rating) || (rating >= min && rating <= max);
}

/**
 * One `properties[]` entry: a keyed convention such as `testPeriod` or `levelColor:<id>`.
 * A survey mean off the rating scale fails the document, rather than counting in one
 * figure and not in another.
 */
const Property = v.pipe(
    v.looseObject({ key: v.string(), value: EntryValue }),
    v.check(
        isRatingInRange,
        (issue) =>
            `Expected properties[${issue.input.key}] on the rating scale ${RATING_DOMAIN.join('–')}, got '${issue.input.value}'`,
    ),
);

/** One `covariates[]` entry: a keyed convention such as `group` or `gender`. */
const Covariate = v.looseObject({
    type: v.string(),
    value: EntryValue,
    label: v.optional(v.string()),
});

/**
 * A list that must carry an entry for each of `names`, with a value: a blank one would
 * read as present to the schema and as absent to every reader. Only the first entry of a
 * name counts, as the readers take the first.
 * @template {typeof Property | typeof Covariate} TEntry
 * @param {TEntry} Entry
 * @param {(entry: v.InferOutput<TEntry>) => string} nameOf - The entry's `key` or `type`.
 * @param {string} label - The list's field name, for the message.
 * @returns {(...names: string[]) => v.GenericSchema<unknown, v.InferOutput<TEntry>[]>}
 */
const requiredEntries =
    (Entry, nameOf, label) =>
    (...names) => {
        const missing = (/** @type {v.InferOutput<TEntry>[]} */ entries) =>
            names.find((name) => !entries.find((e) => nameOf(e) === name)?.value);
        return v.pipe(
            v.array(Entry),
            v.check(
                (entries) => missing(entries) === undefined,
                (issue) =>
                    `Expected ${label}[${missing(/** @type {v.InferOutput<TEntry>[]} */ (issue.input))}]`,
            ),
        );
    };

/** `properties[]` that must carry each of the given keys. */
export const requiredProperties = requiredEntries(Property, (p) => p.key, 'properties');

/**
 * The fields a student value group carries in both student documents: its name and its
 * Lerngruppe (`covariates[group]`, the `name` of that group's value group).
 */
export const studentValueGroupEntries = {
    properties: requiredProperties(PROPERTY_KEY.FIRST_NAME, PROPERTY_KEY.LAST_NAME),
    covariates: requiredEntries(Covariate, (c) => c.type, 'covariates')(COVARIATE_TYPE.GROUP),
};

/** The fields every value group carries, spread into each document's value-group schema. */
export const valueGroupEntries = {
    id: Text,
    type: Text,
    name: Text,
    domain: v.optional(v.looseObject({ id: DomainId, name: Text })),
    subject: v.optional(v.looseObject({ name: Text })),
    covariates: v.optional(v.array(Covariate)),
    properties: v.optional(v.array(Property)),
};

/** @typedef {v.InferOutput<typeof Property>} Property */
/** @typedef {v.InferOutput<typeof Covariate>} Covariate */

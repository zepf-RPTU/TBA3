/**
 * The item properties an MA booklet can be grouped by besides its Leitidee: every
 * competence type the items carry (VERA 8: Allgemeine Kompetenz, Anforderungsbereich;
 * VERA 3: the Primar Kompetenzen), derived from the payload, so no vocabulary is
 * hardcoded. Built once per store as the `MA_DATASETS.COMPETENCE_GROUPINGS` dataset.
 */

import { AGG_TYPE_STYLE } from '../../common/domain/apiValueMaps.js';
import { compareText } from '../../common/utils/compare.js';

/**
 * One competence type and its values.
 * @typedef {object} MaCompetenceGrouping
 * @property {string} type - The payload's `type`, which is also the grouping's label.
 * @property {`competenceGroup${number}`} field - The item record's key holding the item's values of this type: flat, so a table column can name it.
 * @property {string[]} values - The value names, in `id` order (I < II < III, K1 < … < K6).
 */

/**
 * Derive the competence groupings from the group's item groups. Types keep the order
 * the payload first names them in. Values are ordered by `id`, since the payload's own
 * order is the items', which says nothing about the values. An entry without a name
 * is skipped, and so is `style`, which is EN's.
 * @param {import('../../common/data/schemas/items.js').ItemsValueGroup[]} groupItems - The group's item groups, one per Leitidee.
 * @returns {MaCompetenceGrouping[]}
 */
export function deriveCompetenceGroupings(groupItems) {
    /** @type {Map<string, Map<string, string>>} type → name → sort key */
    const types = new Map();
    for (const group of groupItems) {
        for (const item of group.items) {
            for (const { type, id, name } of competenceEntries(item)) {
                let values = types.get(type);
                if (!values) types.set(type, (values = new Map()));
                if (!values.has(name)) values.set(name, id ?? name);
            }
        }
    }
    return [...types].map(([type, values], index) => ({
        type,
        field: /** @type {`competenceGroup${number}`} */ (`competenceGroup${index}`),
        values: [...values].sort(([, a], [, b]) => compareText(a, b)).map(([name]) => name),
    }));
}

/**
 * One item's values per grouping, ready to spread onto its record.
 * @param {import('../../common/data/schemas/items.js').ItemsValueGroup['items'][number]} item
 * @param {MaCompetenceGrouping[]} groupings
 * @returns {Record<`competenceGroup${number}`, string[]>} Per grouping field, the item's value names in the grouping's order.
 */
export function itemCompetenceFields(item, groupings) {
    const names = new Set(competenceEntries(item).map(({ type, name }) => `${type}\u0000${name}`));
    return Object.fromEntries(
        groupings.map(({ type, field, values }) => [
            field,
            values.filter((value) => names.has(`${type}\u0000${value}`)),
        ]),
    );
}

/**
 * The item's competences a grouping can use.
 * @param {import('../../common/data/schemas/items.js').ItemsValueGroup['items'][number]} item
 * @returns {Array<{type: string, id: string|undefined, name: string}>} Every named, typed, non-style entry.
 */
function competenceEntries(item) {
    return (item.parameters.competences ?? []).flatMap(({ type, id, name }) =>
        type && name && type !== AGG_TYPE_STYLE ? [{ type, id, name }] : [],
    );
}

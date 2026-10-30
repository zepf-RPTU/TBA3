/**
 * The rings of the MA item-ring grid as data, per grouping: by Leitidee (one ring per
 * Leitidee the booklet declares) and by each competence type the items carry (one ring
 * per value), each drawn after the shared "Gesamt" ring. Built as a dataset of the MA
 * catalog, so it carries no layout.
 */

import { MA_ALL_POOL_LABEL, MA_DOMAIN_TERM } from '../maTerms.js';

/** The grouping every grid starts in: the Leitidee, the booklet's own domain. */
export const LEITIDEE_GROUPING = 'leitidee';

/**
 * One ring of the grid: "Gesamt" or one Leitidee or competence value.
 * @typedef {object} ItemRingChartDefinition
 * @property {string} id - The ring's id, unique within the grid and the key a selection names it by; 'all' for Gesamt, which is never selected.
 * @property {string} title
 * @property {Set<string>} iqbIds
 * @property {boolean} isEmpty
 */

/**
 * A grouping the grid can be switched to, with its rings.
 * @typedef {object} ItemRingGrouping
 * @property {string} id
 * @property {string} label
 * @property {ItemRingChartDefinition[]} rings - Without "Gesamt".
 */

/**
 * Every grouping's rings, Leitidee first.
 * @typedef {object} ItemRingSets
 * @property {ItemRingChartDefinition} total - "Gesamt", the whole booklet, which every grouping draws first.
 * @property {ItemRingGrouping[]} groupings
 */

/**
 * A ring's items: the one rule the grid ring, the focus ring and the pools count by.
 * @template {{iqbId: string}} T
 * @param {T[]} items
 * @param {{iqbIds: Set<string>}} ring
 * @returns {T[]} Its items, in input order.
 */
export function ringItems(items, ring) {
    return items.filter((item) => ring.iqbIds.has(item.iqbId));
}

/**
 * A grouping by id, or the Leitidee when the id is unset or names a grouping the payload
 * lacks (a competence type it does not carry).
 * @param {ItemRingSets} sets
 * @param {string|null|undefined} id
 * @returns {ItemRingGrouping}
 */
export function resolveGrouping(sets, id) {
    return sets.groupings.find((grouping) => grouping.id === id) ?? sets.groupings[0];
}

/**
 * The ring a card shows of a grouping: the requested one while it carries items, else the
 * grouping's first ring with items. One rule, so every card that resolves a ring shows
 * the same one.
 * @param {ItemRingSets} sets
 * @param {string|null|undefined} groupingId - Unset or unknown is the Leitidee (`resolveGrouping`).
 * @param {string|null|undefined} requestedId - A ring id; unset, unknown or empty falls back.
 * @returns {{grouping: ItemRingGrouping, ring: ItemRingChartDefinition|null, ringId: string|null}} `ring` is `null` when no ring of the grouping carries items.
 */
export function resolveShownRing(sets, groupingId, requestedId) {
    const grouping = resolveGrouping(sets, groupingId);
    const selectable = grouping.rings.filter((ring) => !ring.isEmpty);
    const ring = selectable.find((entry) => entry.id === requestedId) ?? selectable[0] ?? null;
    return { grouping, ring, ringId: ring?.id ?? null };
}

/**
 * Build every grouping's rings. A Leitidee without items keeps its ring (flagged
 * `isEmpty`) so the grid stays complete — the ring then renders as an empty
 * placeholder. A competence value has a ring only because some item carries it; an item
 * carrying several values of one type sits in each of their rings.
 * @param {Array<{domain: string, domainLabel: string}>} domains - The Leitideen the booklet declares, in payload order.
 * @param {import('./maCompetenceGroupings.js').MaCompetenceGrouping[]} groupings
 * @param {Array<{iqbId: string, domain: string} & Record<`competenceGroup${number}`, string[]>>} items
 * @returns {ItemRingSets}
 */
export function getItemRingSets(domains, groupings, items) {
    /**
     * @param {string} id
     * @param {string} title
     * @param {(item: (typeof items)[number]) => boolean} belongs
     * @returns {ItemRingChartDefinition}
     */
    const ring = (id, title, belongs) => {
        const iqbIds = new Set(items.filter(belongs).map((item) => item.iqbId));
        return { id, title, iqbIds, isEmpty: iqbIds.size === 0 };
    };
    return {
        // The whole booklet takes the id the Aufgabenpools give it.
        total: ring('all', MA_ALL_POOL_LABEL, () => true),
        groupings: [
            {
                id: LEITIDEE_GROUPING,
                label: MA_DOMAIN_TERM,
                rings: domains.map(({ domain, domainLabel }) =>
                    ring(domain, domainLabel, (item) => item.domain === domain),
                ),
            },
            ...groupings.map(({ field, type, values }) => ({
                id: field,
                label: type,
                rings: values.map((value, index) =>
                    ring(`${field}-${index}`, value, (item) => item[field].includes(value)),
                ),
            })),
        ],
    };
}

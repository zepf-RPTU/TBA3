/**
 * MA item pools — the selectable item subsets of the booklet.
 *
 * A pool restricts the results to a subset of the booklet's items, so students can
 * be ordered within one content area (Differenzierung). Which Leitideen count is the
 * item rings' rule (`MA_DATASETS.ITEM_RINGS`, the empty ones flagged), so the pools are
 * the selectable rings.
 */

import { LEITIDEE_GROUPING, resolveGrouping } from './maItemRings.js';

/**
 * @typedef {object} MaItemPool
 * @property {string} id - 'all' for the whole booklet, else the domain id.
 * @property {string} label - Shown on the dropdown option.
 * @property {'all'|'leitidee'} type - 'all' keeps the Kompetenzstufe column and the
 *   Stufengrenze preset; 'leitidee' drops the column and greys the preset out
 *   (competence-level is undefined per Leitidee).
 */

/**
 * Build the ordered item-pool list for the current group. Always the Leitidee rings,
 * whatever grouping a grid shows: a pool other than Gesamt reads the students' records
 * per Leitidee (`STUDENT_RECORDS_BY_DOMAIN`), which only a Leitidee has.
 * @param {import('./maItemRings.js').ItemRingSets} ringSets - The item rings
 *   (`MA_DATASETS.ITEM_RINGS`).
 * @returns {Array<MaItemPool>} "Gesamt" pool followed by one pool per non-empty Leitidee.
 */
export function buildItemPools(ringSets) {
    const { total } = ringSets;
    const leitideen = resolveGrouping(ringSets, LEITIDEE_GROUPING).rings;
    return [total, ...leitideen.filter((ring) => !ring.isEmpty)].map((ring) => ({
        id: ring.id,
        label: ring.title,
        type: ring === total ? 'all' : 'leitidee',
    }));
}

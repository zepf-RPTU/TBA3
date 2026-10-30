/**
 * Where the item lollipop chart puts its items along x: grouped by Leitidee, in the
 * order the item records carry them. Pure, so the order and spacing can be checked
 * without a mounted chart.
 */

import { groupByDomain } from '../../../../common/charts/renderers/lollipopMarks.js';

/**
 * Where every item sits, and the x span of every Leitidee.
 * @typedef {object} DomainLayout
 * @property {Map<string, number>} x - Item id → x.
 * @property {Array<{domain: string, x0: number, x1: number}>} spans - Each Leitidee's first and last item x, in draw order.
 */

/**
 * Lay the items out by Leitidee, in `groupByDomain` order — the order the item table
 * and the ring grid show. The pitch is even within a Leitidee; the gap between two
 * Leitideen and each edge reserve are two pitches. For n items in D Leitideen that is
 * pitch `s = width / (n + D + 2)`, and item i of Leitidee k sits at `s · (2 + i + k)`.
 * @param {Array<{iqbId: string, domainLabel: string}>} items
 * @param {number} width
 * @returns {DomainLayout}
 */
export function layoutDomains(items, width) {
    const groups = groupByDomain(items);
    const pitch = width / (items.length + groups.length + 2);
    /** @type {Map<string, number>} */
    const x = new Map();
    let i = 0;
    const spans = groups.map(([domain, domainItems], k) => {
        const x0 = pitch * (2 + i + k);
        for (const item of domainItems) x.set(item.iqbId, pitch * (2 + i++ + k));
        return { domain, x0, x1: pitch * (1 + i + k) };
    });
    return { x, spans };
}

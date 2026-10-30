/**
 * The comparison groups of `items.json` (Schulschnitt, Landesschnitt(e) and any other
 * population), each with its per-item means and its ordinal among the groups of its role.
 */

import { assignComparisonOrdinals, isComparisonValueGroup } from './comparisonGroupLabels.js';
import { toPercent } from './itemResultCounts.js';

/**
 * @typedef {object} ItemComparisonGroup
 * @property {string} id - The value group's own key; also its comparison toggle id
 * @property {string} type - The payload's own type; `resolveAverageRole` maps it to the role it draws as
 * @property {string} name - Display name (`Schulschnitt`, `Landesschnitt GY`, …)
 * @property {number} roleIndex - Position among the groups sharing this role, 0-based
 * @property {string|null} shortLabel - `L1`/`L2`/… when several groups share the role, `null` when one does
 * @property {Map<string, number>} meanMap - iqbId → percentage correct (0–100)
 */

/**
 * The group's own value groups of `items.json`. Split on `type`, the spec's
 * discriminator: the group side is the only enumerated one, so a comparison population
 * the client has no shape for is never merged into the group's own item records.
 * @param {import('../data/schemas/items.js').ItemsValueGroup[]} groups - `items.json`.
 * @returns {import('../data/schemas/items.js').ItemsValueGroup[]}
 */
export function ownItemGroups(groups) {
    return groups.filter((group) => !isComparisonValueGroup(group));
}

/**
 * Every comparison population of `items.json`, with its per-item means, including
 * groups drawn with the catch-all marker and ones the aggregations do not list.
 * @param {import('../data/schemas/items.js').ItemsValueGroup[]} groups - `items.json`.
 * @returns {ItemComparisonGroup[]} In payload order.
 */
export function comparisonItemGroups(groups) {
    return buildItemComparisonGroups(groups.filter(isComparisonValueGroup));
}

/**
 * Every comparison group the value groups carry a per-item mean for, one entry per group id in
 * payload order. A group ships one value group per domain; those merge into one entry. A
 * group without a single item mean draws nothing, so it is left out here, before the
 * ordinals, and no chart or toggle offers it.
 * @param {import('../data/schemas/items.js').ItemsValueGroup[]} valueGroups - The comparison value groups of items.json.
 * @returns {ItemComparisonGroup[]}
 */
function buildItemComparisonGroups(valueGroups) {
    /** @type {Map<string, ItemComparisonGroup>} */
    const groupsById = new Map();

    for (const valueGroup of valueGroups) {
        const { id } = valueGroup;
        let group = groupsById.get(id);
        if (!group) {
            group = {
                id,
                type: valueGroup.type,
                name: valueGroup.name,
                roleIndex: 0,
                shortLabel: null,
                meanMap: new Map(),
            };
            groupsById.set(id, group);
        }
        for (const item of valueGroup.items) {
            group.meanMap.set(item.iqbId, toPercent(item.descriptiveStatistics.mean));
        }
    }

    const groups = [...groupsById.values()].filter((group) => group.meanMap.size > 0);
    assignComparisonOrdinals(groups);
    return groups;
}

/**
 * Pair each drawn item with this comparison group's mean for it. An item the group has
 * no mean for gets no marker, not one drawn at zero.
 * @template {{iqbId: string}} TItem
 * @param {{meanMap: Map<string, number>}} average
 * @param {TItem[]} chartData - The items the chart currently draws.
 * @returns {Array<TItem & {percentage: number}>} One entry per item the group has a finite mean for.
 */
export function mapItemComparisonAverageData(average, chartData) {
    return chartData.flatMap((item) => {
        const percentage = average.meanMap.get(item.iqbId);
        return Number.isFinite(percentage)
            ? [{ ...item, percentage: /** @type {number} */ (percentage) }]
            : [];
    });
}

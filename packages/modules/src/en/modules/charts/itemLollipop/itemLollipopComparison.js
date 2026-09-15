/**
 * How the item lollipop resolves its comparison groups (Landesschnitt, Schulschnitt, …)
 * against the persisted per-item means: which groups the payload carries a series
 * for, the benchmark of one item or task row, and the marker rows a group draws.
 */

/**
 * Resolve a persisted benchmark value for an item or task row.
 * Task rows mirror the table's aggregation rule and average child item values.
 * @param {import('./itemLollipopChart.js').ItemLollipopChart} chart - The renderer.
 * @param {object} item - The row the marker belongs to; a task row averages its children.
 * @param {Map<string, number>|null} meanMap - Persisted benchmark per item id, or `null` when none was loaded.
 * @returns {number|null} The benchmark, or `null` when nothing is known for this row — callers must draw no marker rather than a substitute.
 */
export function resolveComparisonAverage(chart, item, meanMap) {
    if (!(meanMap instanceof Map) || meanMap.size === 0) {
        return null;
    }

    if (item?.isTaskRow && Array.isArray(item._children) && item._children.length > 0) {
        const values = item._children
            .map((child) => meanMap.get(child.iqbId))
            .filter((value) => typeof value === 'number' && Number.isFinite(value));

        if (values.length > 0) {
            return values.reduce((sum, value) => sum + value, 0) / values.length;
        }

        return null;
    }

    const directValue = meanMap.get(item?.iqbId);
    return typeof directValue === 'number' && Number.isFinite(directValue) ? directValue : null;
}

/**
 * The rows a comparison group draws a marker for: every item the group has a
 * benchmark for, with that value attached.
 * @param {import('./itemLollipopChart.js').ItemLollipopChart} chart - The renderer.
 * @param {Array<object>} items - The drawn items.
 * @param {{meanMap: Map<string, number>}} group - The comparison group and its persisted means.
 * @returns {Array<object>} The items with a `comparisonValue`, skipping the ones without one.
 */
export function getAverageMarkerData(chart, items, group) {
    return items.flatMap((item) => {
        const comparisonValue = resolveComparisonAverage(chart, item, group.meanMap);
        return typeof comparisonValue === 'number' && Number.isFinite(comparisonValue)
            ? [{ ...item, comparisonValue }]
            : [];
    });
}

/**
 * A comparison group of items.json, as the item lollipop draws it.
 * @typedef {object} ItemComparisonGroup
 * @property {string} id - The group's own key; also its comparison toggle id
 * @property {string} type - The payload's own type; decides shape and colour role
 * @property {string} name - Display name for the legend, tooltip and ⌀ menu
 * @property {number} typeIndex - Position among the groups sharing the role
 * @property {string|null} shortLabel - `L1`/`L2`/… when several groups share the role
 * @property {Map<string, number>} meanMap - iqbId → percentage correct (0–100)
 */

/**
 * Which comparison groups this render can draw: every group items.json carries
 * per-item means for, each with its marker and legend class. The groups come from the
 * items document itself — a group aggregation.json does not list is still drawn, since
 * its toggle is seeded from the same document.
 * @param {{itemComparisonGroups?: ItemComparisonGroup[]|null}} options - The renderer options.
 * @returns {Array<ItemComparisonGroup & {markerClass: string, legendClass: string}>} The drawable groups, in payload order.
 */
export function resolveComparisonGroups(options) {
    return (options.itemComparisonGroups ?? []).flatMap((group, index) => {
        if (group.meanMap.size === 0) return [];

        // `type`/`shortLabel`/`typeIndex`/`name` are all `comparisonSeries` needs to
        // resolve the shape, shade and legend text every other EN chart uses.
        return [
            {
                ...group,
                markerClass: `comparison-average-marker-${index}`,
                legendClass: `comparison-legend-${index}`,
            },
        ];
    });
}

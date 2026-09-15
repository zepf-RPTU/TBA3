/**
 * MA Item Data Adapter — Transforms JSON API item data into enriched
 * item records consumed by MA views (ItemTable, TaskRing, Lollipop charts).
 *
 * Input:  items.json + students_aggregation.json + items_aggregation.json
 * Output: itemArray with per-student results, counts, and percentages
 */

import {
    assignComparisonOrdinals,
    buildItemMeansMap,
    buildItemResultCounts,
    computePilotierung,
    NO_RESULT_COUNTS,
    RESULT_VALUES,
    resultShare,
    sortItemsWithinExercises,
    toPercent,
} from '@tba3/modules/domain';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Read a field a comparison group must carry, failing loudly rather than drawing an
 * unlabelled or mis-keyed series.
 * @param {any} value - The field as the payload delivered it.
 * @param {string} fieldName - Its name, for the error message.
 * @param {object} group - The group it came from, so the error names the offender.
 * @returns {string} The trimmed-non-empty value.
 * @throws {Error} When the field is missing or blank.
 */
function requireComparisonText(value, fieldName, group) {
    if (typeof value === 'string' && value.trim()) return value;
    throw new Error(
        `MA item comparison group is missing required ${fieldName}: ${group?.id ?? '(missing id)'}`,
    );
}

/**
 * The first delivered comparison group, as the single average the item lollipop draws.
 * @param {Array<object>|null} itemGroups - Comparison groups in payload order.
 * @returns {{id: string, type: string, name: string, means: Map<string, number>}|null} The group with its per-item means, or `null` when the payload delivered none.
 */
export function buildItemComparisonAverage(itemGroups) {
    const group = itemGroups?.[0];
    if (!group) return null;
    return {
        id: requireComparisonText(group.id, 'id', group),
        // Kept as the payload's own type; the role it draws as is resolved at render
        // time, so an unrecognised comparison population gets the catch-all mark
        // instead of taking the item view down.
        type: requireComparisonText(group.type, 'type', group),
        name: requireComparisonText(group.name, 'name', group),
        means: buildItemMeansMap(itemGroups),
    };
}

/**
 * Every delivered comparison group, ordinal-tagged so several groups of one type stay
 * tellable apart in a chart that gives them one shape and one base colour.
 * @param {Array<object>|null} itemGroups - Comparison groups in payload order.
 * @returns {Array<object>} One entry per group, in payload order, each carrying its per-item means.
 */
export function buildItemComparisonAverages(itemGroups) {
    const groupsById = new Map();
    for (const group of itemGroups ?? []) {
        const id = requireComparisonText(group?.id, 'id', group);
        const existing = groupsById.get(id) ?? [];
        existing.push(group);
        groupsById.set(id, existing);
    }

    const averages = [...groupsById.values()].flatMap((groups) => {
        const average = buildItemComparisonAverage(groups);
        return average ? [average] : [];
    });

    // The ordinal runs within a role, not across the list: `maAppModule` happens to
    // call this once per type, but a mixed list must not number a Schulschnitt as if
    // it were the first of the Landesschnitte. It is what separates several
    // Landesschnitte in a chart that draws them with one shape and one base colour —
    // `null` for a lone group, so every single-state dataset renders unchanged.
    assignComparisonOrdinals(averages);

    return averages;
}

/**
 * Pair each drawn item with this comparison group's mean for it.
 * @param {{means?: Map<string, number>}|null} average - The comparison group, or `null` when none was delivered.
 * @param {Array<{iqbId: string}>} chartData - The items the chart currently draws.
 * @param {(average: any, iqbId: string) => void} [onMissing] - Called for an item the group has no value for; those items are dropped rather than drawn at zero.
 * @returns {Array<object>} One entry per item the group has a finite mean for.
 */
export function mapItemComparisonAverageData(average, chartData, onMissing = undefined) {
    return chartData.flatMap((item) => {
        const percentage = average?.means?.get(item.iqbId);
        if (!Number.isFinite(percentage)) {
            onMissing?.(average, item.iqbId);
            return [];
        }
        return [{ ...item, percentage }];
    });
}

/**
 * Build an array of enriched item records from items.json.
 *
 * Each record shape:
 * { iqbId, name, exerciseName, competenceLevel, domain, domainLabel,
 *   results, total, correctCount, incorrectCount, notAttemptedCount,
 *   percentageCorrect, percentageIncorrect, percentageNotAttempted,
 *   meanPercentage, pilotierungswert, pilotierungsDiff }
 *
 * The three `percentage*` shares are the item's result counts over its `total`, so the
 * distribution bar they draw always sums to the item's own responses. An item the
 * per-item aggregation does not cover has `total` 0 and all three shares `null`.
 * `meanPercentage` is the payload's `descriptiveStatistics.mean` in percent — the share
 * the item lollipop sets beside the school and state means, which arrive the same way.
 *
 * The `results` array [ [studentId, ergebnis], ... ] is reconstructed by
 * cross-referencing Ergebnis includedIqbIds from students_aggregation.json.
 * @param {Array} itemsData - items.json (array of domain groups with items[])
 * @param {Array} aggregationData - students_aggregation.json (per-student per-domain entries)
 * @param {Array|null} itemAggData - items_aggregation.json, the API's per-item
 *   Richtig/Falsch/Unbearbeitet breakdown
 * @returns {Array<object>} Enriched item records
 */
export function buildItemArray(itemsData, aggregationData, itemAggData) {
    // Build per-item result lookup: iqbId → [[studentId, ergebnis], ...]
    const itemResultsMap = _buildItemResultsMap(aggregationData);
    // Per-item result counts, as served by the API
    const resultCounts = buildItemResultCounts(itemAggData);

    const items = [];

    for (const group of itemsData) {
        const domainId = group.domain?.id ?? '';
        const domainName = group.domain?.name ?? '';

        for (const item of sortItemsWithinExercises(group.items)) {
            const stats = item.descriptiveStatistics ?? {};
            const params = item.parameters ?? {};
            const { total, correctCount, incorrectCount, notAttemptedCount } =
                resultCounts.get(item.iqbId) ?? NO_RESULT_COUNTS;
            // Get per-student results from the cross-referenced aggregation data
            const results = itemResultsMap.get(item.iqbId) ?? [];

            const mean = stats.mean ?? 0;

            const { pilotierungswert, pilotierungsDiff } = computePilotierung(params, mean);

            items.push({
                iqbId: item.iqbId,
                name: item.name ?? '',
                exerciseName: item.exercise?.name ?? '',
                competenceLevel: params.competenceLevel?.nameShort ?? '',
                domain: domainId,
                domainLabel: domainName,
                results,
                total,
                correctCount,
                incorrectCount,
                notAttemptedCount,
                percentageCorrect: resultShare(correctCount, total),
                percentageIncorrect: resultShare(incorrectCount, total),
                percentageNotAttempted: resultShare(notAttemptedCount, total),
                meanPercentage: toPercent(mean),
                pilotierungswert,
                pilotierungsDiff,
            });
        }
    }

    return items;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Build per-item result map from students_aggregation.json.
 *
 * For each student + domain, reads Ergebnis aggregations (Richtig/Falsch/Unbearbeitet)
 * and assigns each iqbId → [studentId, resultCode].
 * @param {Array} aggregationData - students_aggregation.json
 * @returns {Map<string, Array<[string, number]>>} iqbId → [[studentId, ergebnis], ...]
 */
function _buildItemResultsMap(aggregationData) {
    const map = new Map();

    for (const entry of aggregationData) {
        const studentId = entry.id;

        for (const agg of entry.aggregations ?? []) {
            if (agg.type !== 'Ergebnis') continue;
            const resultCode = RESULT_VALUES[agg.value];
            if (resultCode === undefined) continue;

            for (const iqbId of agg.includedIqbIds ?? []) {
                if (!map.has(iqbId)) {
                    map.set(iqbId, []);
                }
                map.get(iqbId).push([studentId, resultCode]);
            }
        }
    }

    return map;
}

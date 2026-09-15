/**
 * Competence-Level Adapter — Shared utilities for parsing and transforming
 * competence-level API data into chart-ready formats.
 *
 * Pure functions with no class dependencies, importable by any module type.
 * Supports both KS levels (I–V) and GER levels (A1–C1).
 */

import { resolveScaleId } from '../services/competenceLevelPalette.js';
import { isComparisonValueGroup } from '../domain/comparisonGroupLabels.js';

/**
 * One value group as `parseCompetenceLevels` returns it.
 * @typedef {object} ParsedCompetenceGroup
 * @property {string} id - The value group's payload id.
 * @property {string} type - The value group's payload type: `group` is the class, anything else a comparison population.
 * @property {string} name - Display name.
 * @property {number} total - Headcount the shares are of.
 * @property {{[level: string]: number}} percentages - Share per level in percent, `frequency / total`; empty when `total` is 0.
 * @property {{[level: string]: number}} counts - `frequency` per level.
 */

// ============================================================================
// PARSING
// ============================================================================

/**
 * Parse a competence-level API response into an internal format.
 *
 * The API returns an array of value-group objects, each with a
 * `competenceLevels` array containing descriptiveStatistics.
 * A null `frequency` (e.g. when data is not yet available) is coerced to 0.
 *
 * Shares are `frequency / total`, not the payload's `mean`: the server rounds `mean`
 * to four decimal places, and the charts stack these shares to 100 %. A group whose
 * `total` is 0 has no shares at all — an empty `percentages` — rather than a row of
 * zeros that would read as a measured result.
 *
 * The vocabulary is read off the row listing the most levels, not the first: every row
 * of one Fach/Domäne sits on the same ladder, but a row lists only the levels its
 * population reached, and a truncated first row would both drop bands and — on a page
 * holding two ladders that share names — leave `scaleId` unable to say which ladder.
 * @param {Array} apiData - Array of value-group objects from the API
 * @returns {{
 *   levels: string[],
 *   scaleId: string|undefined,
 *   groups: ParsedCompetenceGroup[]
 * }} The level vocabulary, the registered scale it belongs to (undefined when unregistered or ambiguous — see `resolveScaleId`), and one entry per value group, in payload order.
 */
export function parseCompetenceLevels(apiData) {
    if (!apiData || apiData.length === 0) {
        return { levels: [], scaleId: undefined, groups: [] };
    }

    const fullestRow = apiData.reduce(
        (best, entry) =>
            (entry.competenceLevels?.length ?? 0) > (best.competenceLevels?.length ?? 0)
                ? entry
                : best,
        apiData[0],
    );
    const levels = (fullestRow.competenceLevels ?? []).map((cl) => cl.nameShort);
    const scaleId = resolveScaleId(levels);

    const groups = apiData.map((entry) => {
        /** @type {{[level: string]: number}} */
        const percentages = {};
        /** @type {{[level: string]: number}} */
        const counts = {};
        // The bands share one `total` (the value group's headcount), so any band that
        // states it answers for all of them — read off the first that does rather than
        // off position 0, whose `total` the payload may leave null.
        const total =
            entry.competenceLevels.find((cl) => Number.isFinite(cl.descriptiveStatistics?.total))
                ?.descriptiveStatistics?.total ?? 0;

        entry.competenceLevels.forEach((cl) => {
            const frequency = cl.descriptiveStatistics?.frequency ?? 0;
            counts[cl.nameShort] = frequency;
            if (total > 0) percentages[cl.nameShort] = (frequency / total) * 100;
        });

        return { id: entry.id, type: entry.type, name: entry.name, total, percentages, counts };
    });

    return { levels, scaleId, groups };
}

/**
 * The class's own value group — the one whose `type` says so, wherever it sits in the
 * payload. The spec fixes no row order, so position says nothing about which row is
 * the class.
 * @param {ParsedCompetenceGroup[]} groups - Parsed groups, as `parseCompetenceLevels` returns them.
 * @returns {ParsedCompetenceGroup|null} The first group that is not a comparison population, or `null` when the payload carries none.
 */
export function findClassGroup(groups) {
    return groups.find((group) => !isComparisonValueGroup(group)) ?? null;
}

// ============================================================================
// CHART DATA TRANSFORMS
// ============================================================================

/**
 * Transform parsed groups into the D3-ready stacked format that
 * `createStackedBarsBase` expects:
 *   `[{ group, counts, total, [level]: %, [level_start]: cumulative }, ...]`
 * Each row keeps its own group's `counts` and `total`, so a segment reports the
 * headcount its population actually has.
 * @param {ParsedCompetenceGroup[]} groups - Parsed groups
 * @param {string[]} levels - Ordered level names
 * @returns {Array<{group: string, counts: {[level: string]: number}, total: number, [level: string]: any}>} One row per group with cumulative `_start` offsets.
 */
export function toStackedChartData(groups, levels) {
    return groups.map((group) => {
        const entry = { group: group.name, counts: group.counts, total: group.total };
        let cumulative = 0;

        levels.forEach((level) => {
            const value = group.percentages[level] ?? 0;
            entry[level] = value;
            entry[`${level}_start`] = cumulative;
            cumulative += value;
        });

        return entry;
    });
}

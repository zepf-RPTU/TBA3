/**
 * Parses competence-level API data into chart-ready rows. The level vocabulary is read
 * off the payload, whatever scale it is.
 */

import { readDistribution } from './competenceLevelShare.js';
import { greatest } from 'd3-array';

/**
 * One value group as `parseCompetenceLevels` returns it.
 * @typedef {object} ParsedCompetenceGroup
 * @property {string} id - The value group's payload id.
 * @property {string} type - The value group's payload type: `group` is the group itself, anything else a comparison population.
 * @property {string} name
 * @property {number} total - Headcount the shares are of.
 * @property {{[level: string]: number}} percentages - Share per level in percent (`readLevelPercentages`); 0 for every level of a counted group of nobody.
 * @property {{[level: string]: number}} counts - `frequency` per level.
 */

/**
 * Parse a competence-level API response: its level vocabulary and one entry per value
 * group. A missing `frequency` counts as 0; shares follow `readLevelPercentages`.
 *
 * The vocabulary is read off the value group listing the most levels, not the first: every
 * value group of one Fach/Domäne sits on the same ladder, but each lists only the levels its
 * population reached, and a truncated first one would both drop bands and, on a page
 * holding two ladders that share names, leave `scaleId` unable to say which ladder.
 * @param {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('../data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} apiData
 * @returns {{
 *   levels: string[],
 *   scaleId: string|undefined,
 *   groups: ParsedCompetenceGroup[]
 * }} `scaleId` is undefined when the vocabulary is unregistered or ambiguous (see `scaleIdOf`); `groups` are in payload order.
 */
export function parseCompetenceLevels(palette, apiData) {
    if (!apiData || apiData.length === 0) {
        return { levels: [], scaleId: undefined, groups: [] };
    }

    // On a tie the first wins.
    const fullestValueGroup = /** @type {typeof apiData[number]} */ (
        greatest(apiData, (entry) => entry.competenceLevels.length)
    );
    const levels = fullestValueGroup.competenceLevels.map((cl) => cl.nameShort);
    const scaleId = palette.scaleIdOf(fullestValueGroup);

    const groups = apiData.map((entry) => ({
        id: entry.id,
        type: entry.type,
        name: entry.name,
        ...readDistribution(entry.competenceLevels),
    }));

    return { levels, scaleId, groups };
}

/**
 * One competence-level distribution bar: its value group, and its share per level in percent under
 * the level's name.
 * @typedef {{label: string, id: string, type: string, counts: {[level: string]: number}, total: number, [level: string]: any}} StackedChartRow
 */

/**
 * Transform parsed groups into the rows the competence-level distribution bars stack
 * from. Each row keeps its own group's `counts` and `total`, for its segments' tooltips.
 * @param {ParsedCompetenceGroup[]} groups
 * @param {string[]} levels - Ordered level names
 * @returns {StackedChartRow[]} One row per group, in order.
 */
export function toStackedChartData(groups, levels) {
    return groups.map((group) => {
        /** @type {StackedChartRow} */
        const entry = {
            label: group.name,
            id: group.id,
            type: group.type,
            counts: group.counts,
            total: group.total,
        };
        levels.forEach((level) => {
            entry[level] = group.percentages[level] ?? 0;
        });
        return entry;
    });
}

/**
 * The rule for the share of a value group one competence level holds, which every
 * chart, table and sentence reads a competence level by.
 */

import { toPercent } from './itemResultCounts.js';

/**
 * A value group's headcount: its bands share one `total`, so the first band that
 * states it answers for all of them.
 * @param {Array<{descriptiveStatistics: {total?: number}}>} levels - The value group's `competenceLevels`.
 * @returns {number|undefined} `undefined` when no band states one.
 */
export function readLevelsTotal(levels) {
    return levels.find((level) => Number.isFinite(level.descriptiveStatistics.total))
        ?.descriptiveStatistics.total;
}

/**
 * The share of a value-group one competence level holds: its headcount over the group's
 * `total` where the payload counts, else the level's own `mean` (a Landesschnitt may
 * deliver the share alone, its source storing no headcounts). The count wins where it
 * exists: `mean` is rounded to four places at the source, and the charts stack the
 * shares to 100 %. A counted value group of nobody (`total: 0`) has no share,
 * whatever its `mean` says: 0 % would read as a measured result.
 * @param {{frequency?: number, total?: number, mean: number}} statistics - The level's `descriptiveStatistics`.
 * @returns {number|null} The share (0–1), or `null` for a counted value group of nobody.
 */
export function readLevelShare({ frequency, total, mean }) {
    if (total === undefined) return mean;
    return total > 0 ? (frequency ?? 0) / total : null;
}

/**
 * A value group's share per level in percent, under the level's name, in band order: each
 * by `readLevelShare` against the group's `total`. A level without a share (a counted
 * value group of nobody) reads 0, so a distribution always names every band the group lists.
 * @param {Array<{nameShort: string, descriptiveStatistics: {frequency?: number|null, total?: number, mean: number}}>} bands - The value group's `competenceLevels`.
 * @returns {{[level: string]: number}} Percent (0–100) per level.
 */
export function readLevelPercentages(bands) {
    const total = readLevelsTotal(bands);
    return Object.fromEntries(
        bands.map(({ nameShort, descriptiveStatistics: { frequency, mean } }) => [
            nameShort,
            toPercent(readLevelShare({ frequency: frequency ?? 0, total, mean }) ?? 0),
        ]),
    );
}

/**
 * One value group's distribution over its levels: its headcount, its share per level in
 * percent (`readLevelPercentages`) and its `frequency` per level, a missing one as 0.
 * @param {Array<{nameShort: string, descriptiveStatistics: {frequency?: number|null, total?: number, mean: number}}>} bands - The value group's `competenceLevels`.
 * @returns {{total: number, percentages: {[level: string]: number}, counts: {[level: string]: number}}} `total` 0 when no band states one.
 */
export function readDistribution(bands) {
    return {
        total: readLevelsTotal(bands) ?? 0,
        percentages: readLevelPercentages(bands),
        counts: Object.fromEntries(
            bands.map(({ nameShort, descriptiveStatistics }) => [
                nameShort,
                descriptiveStatistics.frequency ?? 0,
            ]),
        ),
    };
}

/**
 * Whether a distribution counts anybody: `readLevelPercentages` names every band, at 0
 * for a value group of nobody.
 * @param {{[level: string]: number}} percentages - Percent per level.
 * @returns {boolean}
 */
export function hasAnyShare(percentages) {
    return Object.values(percentages).some((share) => share > 0);
}

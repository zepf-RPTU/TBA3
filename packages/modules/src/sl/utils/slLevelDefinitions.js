/**
 * The competence-level ladder per Fach/Domäne: built once from `competence-levels.json`,
 * read by the SL results builders and the SL tables.
 */

import { resolveScaleId } from '../../common/services/competenceLevelPalette.js';

/**
 * Build competency level definitions per subject+domain from JSON data.
 *
 * Extracts unique level definitions from `competence-levels.json` and
 * returns a Map keyed by "subjectName|domainId" → Array<{stufe}>.
 * Every row of one Fach/Domäne sits on the same ladder, but a row lists only the levels
 * its population reached, so the definition is read off the row listing the most — a
 * truncated first row would both drop bands and leave the scale unresolvable.
 * @param {Array} competenceLevelsData - competence-levels.json array
 * @returns {LevelDefinitions} Level definitions per `subjectName|domainId`.
 */
export function buildLevelDefinitions(competenceLevelsData) {
    if (!competenceLevelsData?.length) return new Map();

    /** @type {LevelDefinitions} */
    const levelMap = new Map();

    for (const entry of competenceLevelsData) {
        const subjectName = entry.subject?.name;
        const domainId = entry.domain?.id ?? null;
        if (!subjectName) continue;

        const key = `${subjectName}|${domainId}`;
        const levels = (entry.competenceLevels ?? []).map((cl) => ({ stufe: cl.nameShort }));

        if (levels.length > (levelMap.get(key)?.levels.length ?? 0)) {
            levelMap.set(key, {
                scaleId: resolveScaleId(levels.map((level) => level.stufe)),
                levels,
            });
        }
    }

    return levelMap;
}

/**
 * @typedef {Map<string, {scaleId: string|undefined, levels: Array<{stufe: string}>}>} LevelDefinitions
 *   Per `subjectName|domainId`: the registered scale the pair is measured on (undefined
 *   when the palette cannot name it) and its levels in scale order.
 */

/**
 * Look up competency level definitions for a given subject+domain.
 * @param {LevelDefinitions|null} levelDefinitions - From buildLevelDefinitions(); a missing map yields no levels rather than throwing.
 * @param {string} subjectName - Full subject name (e.g., "Deutsch")
 * @param {string|null} domainId - Domain ID (e.g., "rs") or null for single-domain subjects
 * @returns {Array<{stufe: string}>} The levels, empty when the pair has no definitions.
 */
export function getLevelsForDomain(levelDefinitions, subjectName, domainId) {
    return levelDefinitions?.get(`${subjectName}|${domainId}`)?.levels ?? [];
}

/**
 * The registered competence scale a subject+domain is measured on.
 *
 * What a consumer passes as `scaleId` to the palette lookups: a page holds one ladder
 * per Fach, and two of them can share level names (NRW's Deutsch and Mathematik both
 * have `KS 2 … KS 5`), so a bare name cannot say which ramp or ordinal is meant.
 * @param {LevelDefinitions|null} levelDefinitions - From buildLevelDefinitions().
 * @param {string} subjectName - Full subject name (e.g., "Deutsch")
 * @param {string|null} domainId - Domain ID (e.g., "rs") or null for single-domain subjects
 * @returns {string|undefined} The scale id, or undefined when the pair is unknown or its scale unresolvable.
 */
export function getScaleIdForDomain(levelDefinitions, subjectName, domainId) {
    return levelDefinitions?.get(`${subjectName}|${domainId}`)?.scaleId;
}

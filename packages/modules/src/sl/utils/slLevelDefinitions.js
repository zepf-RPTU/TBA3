/**
 * The competence-level ladder per Fach/Domäne, built once from `competence-levels.json`.
 */

import { greatest, group } from 'd3-array';

/**
 * The key a Fach×Domäne pair is filed under: `Fach|Domäne`, a Fach with no domain split
 * as `Fach|null` however its missing domain arrived.
 * @param {string|undefined} subjectName
 * @param {string|null|undefined} domainId - `undefined` and `null` both mean none.
 * @returns {string}
 */
export function subjectDomainKey(subjectName, domainId) {
    return `${subjectName}|${domainId ?? null}`;
}

/**
 * Every value group of one Fach/Domäne sits on the same ladder, but each lists only the
 * levels its population reached. So the ladder is the registered scale the runs resolve
 * to, never a listing: every one of them may be truncated.
 *
 * A pair whose runs resolve to two scales has no one ladder and is left out, with a
 * warning: it reads as no data rather than bands of the wrong scale. A pair whose
 * runs resolve to none keeps its longest run, unnamed.
 * @param {import('../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette - The app's palette, which names each pair's scale.
 * @param {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]|null|undefined} competenceLevelsData
 * @returns {LevelDefinitions}
 */
export function buildLevelDefinitions(palette, competenceLevelsData) {
    const valueGroupsByKey = group(
        (competenceLevelsData ?? []).filter(
            (entry) => entry.subject?.name && entry.competenceLevels.length > 0,
        ),
        (entry) => subjectDomainKey(entry.subject?.name, entry.domain?.id),
    );

    /** @type {LevelDefinitions} */
    const levelMap = new Map();
    for (const [key, valueGroups] of valueGroupsByKey) {
        const runs = valueGroups.map((entry) =>
            entry.competenceLevels.map((cl) => String(cl.nameShort)),
        );
        /** @type {Map<string, string>} Each scale the value groups resolve to, with a level name on it. */
        const levelByScale = new Map();
        for (const [index, valueGroup] of valueGroups.entries()) {
            const scaleId = palette.scaleIdOf(valueGroup);
            if (scaleId && !levelByScale.has(scaleId)) levelByScale.set(scaleId, runs[index][0]);
        }
        if (levelByScale.size > 1) {
            console.warn(
                `[slLevelDefinitions] ${key} resolves to ${levelByScale.size} scales ` +
                    `(${[...levelByScale.keys()].join(' / ')}); it is left out.`,
            );
            continue;
        }
        const [resolved] = levelByScale;
        levelMap.set(
            key,
            resolved
                ? {
                      scaleId: resolved[0],
                      levels: palette.getScaleLevelNames(resolved[1], resolved[0]),
                  }
                : {
                      scaleId: undefined,
                      levels: /** @type {string[]} */ (greatest(runs, (run) => run.length)),
                  },
        );
    }
    return levelMap;
}

/**
 * @typedef {Map<string, {scaleId: string|undefined, levels: string[]}>} LevelDefinitions
 *   Per `subjectName|domainId`: the registered scale the pair is measured on (undefined
 *   when the palette cannot name it) and its levels in scale order.
 */

/**
 * @param {LevelDefinitions|null} levelDefinitions - A missing map yields no levels rather than throwing.
 * @param {string} subjectName
 * @param {string|null} domainId - `null` for a Fach with no domain split.
 * @returns {string[]} Empty when the pair has no definitions.
 */
export function getLevelsForDomain(levelDefinitions, subjectName, domainId) {
    return levelDefinitions?.get(subjectDomainKey(subjectName, domainId))?.levels ?? [];
}

/**
 * Every Kompetenzstufe the results' Fach/Domäne ladders carry, each once, in the order
 * the ladders name them: the union a table's level columns span.
 * @param {LevelDefinitions|null} levelDefinitions
 * @param {Array<{subjectName: string, domainId: string|null}>} results
 * @returns {string[]}
 */
export function collectLevelUnion(levelDefinitions, results) {
    return [
        ...new Set(
            results.flatMap((result) =>
                getLevelsForDomain(levelDefinitions, result.subjectName, result.domainId),
            ),
        ),
    ];
}

/**
 * The registered competence scale a subject+domain is measured on.
 *
 * What a consumer passes as `scaleId` to the palette lookups: a page holds one ladder
 * per Fach, and two of them can share level names (`KS 2 … KS 5` in both Deutsch and
 * Mathematik), so a bare name cannot say which ramp or ordinal is meant.
 * @param {LevelDefinitions|null} levelDefinitions
 * @param {string} subjectName
 * @param {string|null} domainId - `null` for a Fach with no domain split.
 * @returns {string|undefined} `undefined` when the pair is unknown or its scale unresolvable.
 */
export function getScaleIdForDomain(levelDefinitions, subjectName, domainId) {
    return levelDefinitions?.get(subjectDomainKey(subjectName, domainId))?.scaleId;
}

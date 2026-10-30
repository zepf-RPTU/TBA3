/**
 * MA group-level Kompetenzstufe thresholds — the cut scores a Stufengrenze filter
 * compares against, and its gate: null withholds the filter.
 *
 * Read off the group's own value group of the aggregate competence-levels.json
 * (`resolveGroupEquivalenceTable`). The group's value group carries exactly one table — a group
 * scope is the Testheft-Gruppe — so this is a lookup, not a choice.
 *
 * They are compared with a student's `correctCount`, a count of solved items, while
 * the table states them in score points. The two are one scale only when the
 * booklet's `maxScore` equals its `itemCount`; any other table yields no thresholds.
 */

import {
    getCompetenceLevelThresholds,
    resolveGroupEquivalenceTable,
} from '../../common/domain/index.js';

/**
 * The group-level thresholds, or their typed absence.
 * @param {Array<import('../../common/domain/competenceScale.js').EquivalenceTableSource & {type?: string}> | null | undefined} competenceLevelsGroupData - the aggregate
 *        competence-levels.json document (group + comparison value groups)
 * @returns {number[]|null} ascending level floors from the second band up, or
 *          null when the group's value group ships no table, or one whose scores are not item
 *          counts (`maxScore` ≠ `itemCount`). Never `[]` — the group table's preset
 *          gate distinguishes null from an empty list, and `![]` would render presets
 *          that filter nothing.
 */
export function resolveGroupCompetenceLevelThresholds(competenceLevelsGroupData) {
    const table = resolveGroupEquivalenceTable(competenceLevelsGroupData ?? []);
    if (!table || table.maxScore !== table.itemCount) return null;
    const thresholds = getCompetenceLevelThresholds(table);
    return thresholds.length > 0 ? thresholds : null;
}

/**
 * MA class-level Kompetenzstufe thresholds — the gate and the booklet-wide fallback
 * for the class table's ±Schwellenwert presets.
 *
 * Read off the class's own `group` row of the aggregate competence-levels.json:
 * school and state rows pool several booklets, so neither may be read for the
 * class's cut scores. The group row carries exactly one table — a group scope is
 * the Testheft-Gruppe — so this is a lookup, not a choice.
 *
 * The presets compare a student's `summedResult`, a count of solved items, with cut
 * scores the table states in score points. The two are one scale only when the
 * booklet's `maxScore` equals its `itemCount`; any other table yields no thresholds.
 *
 * The three VERA-3 demo fixtures carry synthesized `equivalenceTable:*` tables —
 * see ASSUMPTION-MA-DEMO-EQUIVALENCE-TABLES.
 */

import { getKsThresholds, resolveEquivalenceTable } from '@tba3/modules/domain';

/**
 * The class-level thresholds, or their typed absence.
 * @param {Array<object> | null | undefined} competenceLevelsClassData - the aggregate
 *        competence-levels.json document (class + comparison rows)
 * @returns {number[]|null} ascending level floors from the second band up, or
 *          null when the class row ships no table, or one whose scores are not item
 *          counts (`maxScore` ≠ `itemCount`). Never `[]` — the class table's preset
 *          gate distinguishes null from an empty list, and `![]` would render presets
 *          that filter nothing.
 */
export function resolveClassKsThresholds(competenceLevelsClassData) {
    const classRow = (competenceLevelsClassData ?? []).find((entry) => entry?.type === 'group');
    if (!classRow) return null;
    const table = resolveEquivalenceTable(classRow);
    if (!table || table.maxScore !== table.itemCount) return null;
    const thresholds = getKsThresholds(classRow);
    return thresholds.length > 0 ? thresholds : null;
}

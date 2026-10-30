/**
 * The ids the ⌀ toggles show and hide in the comparison state.
 */

import { isComparisonValueGroup } from './comparisonGroupLabels.js';

/**
 * Every comparison population a dataset delivers, by id: the competence-level value groups
 * and the populations other documents carry share their ids (`school`, `state`, …), so one
 * ⌀ toggle shows or hides a population in every chart alike.
 * @param {ReadonlyArray<{id: string, type: string}>} competenceLevels - The aggregate competence-levels.json document (group + comparison value groups), validated: every value group has its id.
 * @param {...Array<{id: string}>} groupLists - The comparison populations of the other documents.
 * @returns {string[]} Each id once, competence-level value groups first.
 */
export function comparisonIds(competenceLevels, ...groupLists) {
    return [
        ...new Set([
            ...competenceLevels.filter(isComparisonValueGroup).map((group) => group.id),
            ...groupLists.flat().map((group) => group.id),
        ]),
    ];
}

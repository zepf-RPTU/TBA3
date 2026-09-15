/**
 * MA comparison-row ids — the keys the ⌀ header toggles write into `comparisonState`.
 */

import { isComparisonValueGroup } from '@tba3/modules/domain';

/**
 * The id of every comparison row in competence-levels.json, in payload order.
 * @param {Array<object>|null|undefined} competenceLevels - The aggregate competence-levels.json document (class + comparison rows).
 * @returns {string[]} One id per comparison row; the class's own row is not one.
 * @throws {Error} When a comparison row carries no id. Seeded as the key `undefined`, it
 *   would put a ticked toggle into the ⌀ menu that draws nothing and switches nothing.
 */
export function competenceLevelComparisonIds(competenceLevels) {
    return (competenceLevels ?? []).filter(isComparisonValueGroup).map((group) => {
        if (typeof group.id === 'string' && group.id.trim()) return group.id;
        throw new Error(
            `MA competence-level comparison group is missing required id: ${group?.name ?? '(missing name)'}`,
        );
    });
}

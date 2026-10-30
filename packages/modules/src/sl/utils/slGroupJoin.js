/**
 * The join between the two payloads that name a Testgruppe: `aggregations.json` value
 * groups carry a group id, the competence-levels group value groups carry that id and the
 * group name a query targets.
 */

import { VALUE_GROUP_TYPE } from '../../common/domain/apiValueMaps.js';

/**
 * The Testgruppen of this dataset, keyed by the id both payloads identify them by,
 * valued with the name the competence-levels aggregates spell them with, which a
 * target's `groupNames` are matched against.
 *
 * The join is on the id because the shape of an id or name says nothing reliable: the
 * demo fixture puts the group in the id (`8a-deutsch`) and prose in the name
 * (`Lerngruppe 8a-deutsch`), a state export an opaque numeric id and a free-text
 * Lerngruppen-Kürzel (`E_E1_08_ABCD`).
 *
 * Built once per store (`SL_DATASETS.GROUP_NAME_BY_ID`). It warns when none of the
 * aggregation payload's Testgruppen joins: the two payloads then disagree about
 * the group ids, and every Lerngruppen-scoped Lösungsquote comes back `null` while the
 * competence shares beside it keep working.
 * @param {import('../../common/data/schemas/aggregations.js').AggregationsValueGroup[]} valueGroups - `aggregations.json`.
 * @param {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} index
 * @returns {Map<string, string>} Group id → group name.
 */
export function buildGroupNameById(valueGroups, index) {
    /** @type {Map<string, string>} */
    const groupNameById = new Map();
    for (const group of index.groups) groupNameById.set(group.id, group.name);

    const groups = valueGroups.filter((valueGroup) => valueGroup.type === VALUE_GROUP_TYPE.GROUP);
    if (groups.length > 0 && !groups.some((group) => groupNameOfValueGroup(group, groupNameById))) {
        console.warn(
            "SL_DATASETS.GROUP_NAME_BY_ID: no aggregation value group's group id matches a competence-levels group value group — every Lerngruppen-scoped Lösungsquote will be null",
        );
    }
    return groupNameById;
}

/**
 * The group an aggregation value group belongs to, or `null` when it belongs to none.
 * `null` also keeps the school's own value group and the comparison populations out of
 * the school aggregate.
 * @param {{id: string}} valueGroup - An aggregation value group.
 * @param {Map<string, string>} groupNameById - From `buildGroupNameById`.
 * @returns {string|null}
 */
export function groupNameOfValueGroup(valueGroup, groupNameById) {
    return groupNameById.get(valueGroup.id) ?? null;
}

/**
 * Parses the aggregate (group, school, state) style
 * aggregation into the averages the style charts draw.
 */

import { AGG_TYPE_STYLE } from '../../common/domain/apiValueMaps.js';
import { toPercent } from '../../common/domain/itemResultCounts.js';
import { readCorrectShare } from '../../common/domain/resultAggregations.js';
import {
    assignComparisonOrdinals,
    isComparisonValueGroup,
} from '../../common/domain/comparisonGroupLabels.js';
import { styleCategoryKey } from './enStyleOrder.js';

/** @typedef {import('../../common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */

// ============================================================================
// AGGREGATE PARSING (group + comparison groups)
// ============================================================================

/**
 * One entry's Hör-/Lesestil shares, by style value.
 * @param {AggregationsValueGroup['aggregations']} aggregations
 * @returns {{[style: string]: number}} e.g. { detailliert: 77.41, ... }
 */
export function readStyleShares(aggregations) {
    /** @type {{[style: string]: number}} */
    const result = {};
    for (const agg of aggregations) {
        if (agg.type === AGG_TYPE_STYLE)
            result[agg.value] = toPercent(agg.descriptiveStatistics.mean);
    }
    return result;
}

/**
 * @typedef {object} StyleComparisonGroup
 * @property {string} id - The value group's own key (`school`, `hb`, `nw-gy`, …)
 * @property {string} type - The payload's own type; `resolveAverageRole` maps it to
 *   `school`, `state` or the `other` catch-all
 * @property {string} name - Display name (`Schulschnitt`, `Landesschnitt GY`, …)
 * @property {number} roleIndex - Position among the groups sharing this role, 0-based
 * @property {string|null} shortLabel - `L1`/`L2`/… when several groups share this
 *   role, `null` when it is the only one — see `comparisonGroupLabels.js`
 * @property {{[key: string]: number}} averages - `${domainId}_${style}` → percentage
 * @property {{[key: string]: number}} domainAverages - `domainId` → percentage
 */

/**
 * @typedef {object} ParsedStyleAggregation
 * @property {{[key: string]: number|null}} groupAverages - `${domainId}_${style}` → the group's percentage;
 *   `null` for a category no student of a table selection has a value for (`resolveStyleAverages`).
 * @property {{[key: string]: number}} groupDomainAverages - `domainId` → the group's percentage.
 * @property {string|null} groupName - The group's display name.
 * @property {StyleComparisonGroup[]} comparisonGroups - One entry per comparison population, in payload order.
 */

/**
 * Parse aggregations.json into chart-ready averages. Every group appears once per
 * domain, so the same group is merged across its domain value groups.
 *
 * Comparison groups are a list, not fixed school/state slots: a state can ship
 * several Landesschnitte (one per track), and the client renders every one it is given.
 * @param {AggregationsValueGroup[]} apiData
 * @returns {ParsedStyleAggregation}
 */
export function parseStyleAggregation(apiData) {
    /** @type {{[key: string]: number}} */
    const groupAverages = {};
    /** @type {{[key: string]: number}} */
    const groupDomainAverages = {};
    /** @type {Map<string, StyleComparisonGroup>} */
    const comparisonGroups = new Map();
    /** @type {string|null} */
    let groupName = null;

    for (const entry of apiData) {
        const domainKey = entry.domain?.id;
        if (!domainKey) continue;

        /** @type {{averages: {[key: string]: number}, domainAverages: {[key: string]: number}}} */
        let target;
        if (!isComparisonValueGroup(entry)) {
            target = { averages: groupAverages, domainAverages: groupDomainAverages };
            if (!groupName) groupName = entry.name;
        } else {
            const groupId = entry.id;
            let group = comparisonGroups.get(groupId);
            if (!group) {
                group = {
                    id: groupId,
                    type: entry.type,
                    name: entry.name,
                    roleIndex: 0,
                    shortLabel: null,
                    averages: {},
                    domainAverages: {},
                };
                comparisonGroups.set(groupId, group);
            }
            target = group;
        }

        for (const [style, share] of Object.entries(readStyleShares(entry.aggregations))) {
            target.averages[styleCategoryKey(domainKey, style)] = share;
        }
        // The domain's overall result, the `Richtig` share. An entry without a `Richtig`
        // bucket yields nothing rather than a 0 % the population never scored.
        const correct = readCorrectShare(entry.aggregations);
        if (correct !== null) target.domainAverages[domainKey] = toPercent(correct);
    }

    // Ordinals are derived here, the one parse every EN chart reads its comparison
    // groups from, so all of them share one ordering.
    const groups = [...comparisonGroups.values()];
    assignComparisonOrdinals(groups);

    return {
        groupAverages,
        groupDomainAverages,
        groupName,
        comparisonGroups: groups,
    };
}

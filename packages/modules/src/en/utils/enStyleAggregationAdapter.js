/**
 * Style-Aggregation Adapter — Shared utilities for parsing and transforming
 * style-aggregation API data into chart-ready formats.
 *
 * Pure functions with no class dependencies, importable by any module type.
 * Handles aggregate (class/school/state) style data.
 */

import { toPercent } from '../../common/domain/itemMeans.js';
import { RESULT_CORRECT } from '../../common/domain/apiValueMaps.js';
import {
    assignComparisonOrdinals,
    isComparisonValueGroup,
} from '../../common/domain/comparisonGroupLabels.js';

/**
 * Read a required text field off a payload entry, or fail loudly naming what is missing.
 * A silently absent id or name would surface much later as an unlabelled series.
 * @param {*} value - The field value as it arrived.
 * @param {string} fieldName - Which field is being read, for the error message.
 * @param {object} entry - The entry it came from, whose id names the offender.
 * @param {string} role - What the entry is being read as, for the error message.
 * @returns {string} The value, once it is a non-empty string.
 */
function requireEntryText(value, fieldName, entry, role) {
    if (typeof value === 'string' && value.trim()) return value;
    throw new Error(
        `Style aggregation ${role} is missing required ${fieldName}: ${entry?.id ?? '(missing id)'}`,
    );
}

// ============================================================================
// AGGREGATE PARSING (class + comparison groups)
// ============================================================================

/**
 * Parse a single entry's style aggregations into a flat domainId_style → percentage object.
 * Skips non-style entries (e.g. "Ergebnis") so only Hör-/Lesestil data is included, and
 * a style without a finite mean, which stays absent rather than reading 0 %.
 * @param {string} domainKey - domain.id (e.g. 'ho', 'le')
 * @param {Array} aggregations - Array of { type, value, descriptiveStatistics: { mean } }
 * @returns {{[key: string]: number}} e.g. { ho_detailliert: 77.41, ... }
 */
function parseAggregationEntries(domainKey, aggregations) {
    /** @type {{[key: string]: number}} */
    const result = {};
    for (const agg of aggregations) {
        if (agg.type === 'Ergebnis') continue;
        const mean = agg.descriptiveStatistics?.mean;
        if (!Number.isFinite(mean)) continue;
        result[`${domainKey}_${agg.value}`] = toPercent(mean);
    }
    return result;
}

/**
 * Extract the overall domain result average from an entry's aggregations: the
 * Ergebnis aggregation whose value is `Richtig`. A bucket without a finite mean yields
 * nothing rather than a 0 % the population never scored, the same rule
 * `parseAggregationEntries` applies to the style buckets.
 * @param {string} domainKey - domain.id (e.g. 'ho', 'le')
 * @param {Array} aggregations - Array of aggregation objects
 * @returns {{[key: string]: number}|null} e.g. { ho: 62.65 } or null when the payload states none
 */
function extractDomainAverage(domainKey, aggregations) {
    const correct = aggregations.find((a) => a.type === 'Ergebnis' && a.value === RESULT_CORRECT);
    const mean = correct?.descriptiveStatistics?.mean;
    if (!Number.isFinite(mean)) return null;
    return { [domainKey]: toPercent(mean) };
}

/**
 * @typedef {object} StyleComparisonGroup
 * @property {string} id - The value group's own key (`school`, `hb`, `nw-gy`, …)
 * @property {string} type - The payload's own type; `resolveAverageRole` maps it to
 *   `school`, `state` or the `other` catch-all
 * @property {string} name - Display name (`Schulschnitt`, `Landesschnitt GY`, …)
 * @property {number} typeIndex - Position among the groups sharing this role, 0-based
 * @property {string|null} shortLabel - `L1`/`L2`/… when several groups share this
 *   role, `null` when it is the only one — see `comparisonGroupLabels.js`
 * @property {{[key: string]: number}} averages - `${domainId}_${style}` → percentage
 * @property {{[key: string]: number}} domainAverages - `domainId` → percentage
 */

/**
 * Parse an aggregate style-aggregation API response into chart-ready averages.
 *
 * The input is an array of entries from aggregation.json, each with its own id, a
 * `type` discriminator, a domain, and aggregations per style. Every entry appears
 * once per domain, so the same group is merged across its domain rows.
 *
 * Comparison groups are returned as a list rather than fixed school/state slots:
 * a state can ship several Landesschnitte (nw splits by track), and choosing among
 * them is the exporter's job, not the client's — the client renders what it is given.
 * @param {Array} apiData - Array of aggregate style entries
 * @returns {{
 *   classAverages: {[key: string]: number},
 *   classDomainAverages: {[key: string]: number},
 *   className: string|null,
 *   comparisonGroups: StyleComparisonGroup[]
 * }} The class’s own style and domain averages, its name, and one entry per comparison population.
 */
export function parseStyleAggregation(apiData) {
    /** @type {{[key: string]: number}} */
    const classAverages = {};
    /** @type {{[key: string]: number}} */
    const classDomainAverages = {};
    /** @type {Map<string, StyleComparisonGroup>} */
    const comparisonGroups = new Map();
    /** @type {string|null} */
    let className = null;

    for (const entry of apiData ?? []) {
        const domainKey = entry.domain?.id;
        if (!domainKey) continue;
        const parsed = parseAggregationEntries(domainKey, entry.aggregations);
        const domainAvg = extractDomainAverage(domainKey, entry.aggregations);

        if (!isComparisonValueGroup(entry)) {
            Object.assign(classAverages, parsed);
            if (domainAvg) Object.assign(classDomainAverages, domainAvg);
            if (!className) className = requireEntryText(entry.name, 'name', entry, 'class group');
            continue;
        }

        const groupId = requireEntryText(entry.id, 'id', entry, 'comparison group');
        const groupName = requireEntryText(entry.name, 'name', entry, 'comparison group');

        let group = comparisonGroups.get(groupId);
        if (!group) {
            group = {
                id: groupId,
                type: entry.type,
                name: groupName,
                typeIndex: 0,
                shortLabel: null,
                averages: {},
                domainAverages: {},
            };
            comparisonGroups.set(groupId, group);
        }
        Object.assign(group.averages, parsed);
        if (domainAvg) Object.assign(group.domainAverages, domainAvg);
    }

    // This is the one place both EN group sources pass through — `buildEnConfig`
    // reads the parse result, and the style spider/lollipop read these objects
    // directly — so deriving the ordinals here is what keeps every EN chart on one
    // ordering rather than two rules that can drift.
    const groups = [...comparisonGroups.values()];
    assignComparisonOrdinals(groups);

    return {
        classAverages,
        classDomainAverages,
        className,
        comparisonGroups: groups,
    };
}

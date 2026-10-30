/**
 * Grouping-config builders for the competence detail chart: from the prepared rows (and
 * the active groupName, if any) they decide how bars group on the x-axis — by subject, by
 * domain or by group name — and return the sub-scale domain plus the key/label accessors
 * the renderer places and labels bars with. Pure.
 */

import {
    ordinalShortLabelsByRole,
    SHORT_LABEL_PREFIX_BY_ROLE,
} from '../../../../../common/domain/comparisonGroupLabels.js';
import { group, range } from 'd3-array';
import { orderComparator } from '../../../../../common/utils/compare.js';
import { subjectDomainKey } from '../../../../utils/slLevelDefinitions.js';
import {
    collectComparisonTrackRows,
    compareByTypeThenName,
    payloadOrder,
} from './competenceDetailData.js';
import {
    PILLS,
    rowSubjectDomainKey,
    TEACHING_QUALITY_KEY,
    trackPill,
} from '../shared/competencePills.js';

/** @typedef {import('./competenceDetailData.js').CompetenceChartRow} CompetenceChartRow */

/**
 * The accessors every grouping strategy provides.
 * @typedef {object} CompetenceGroupingAccessors
 * @property {string[]} subScaleDomain - Every bar key a group can hold, in draw order.
 * @property {(row: CompetenceChartRow) => string} getGroupKey - The x-axis group a row falls in.
 * @property {(row: CompetenceChartRow) => string} getSubScaleKey - The bar a row is drawn as within its group.
 * @property {(row: CompetenceChartRow) => string} getLabelText - The short label above that bar.
 * @property {GroupingPills} pills - The pills a bar answers to.
 */

/**
 * Which pills switch a bar, by grouping: the one that owns its x-axis group and the one
 * that owns its slot inside the group; the Unterrichtsqualität slot answers to its own
 * pill in the `quality` block.
 * @typedef {object} GroupingPills
 * @property {(row: CompetenceChartRow) => import('../shared/competencePills.js').CompetencePill} group
 * @property {(row: CompetenceChartRow) => import('../shared/competencePills.js').CompetencePill} slot
 * @property {import('../shared/competencePills.js').CompetencePill} quality
 */

/** Grouped by Fach or by Fach/Domäne: the area owns the group, the track the slot. */
const AREA_GROUPS = {
    subject: { group: () => PILLS.subject, slot: trackPill, quality: PILLS.comparison },
    domain: { group: () => PILLS.area, slot: trackPill, quality: PILLS.comparison },
};
/** Grouped by group: the track owns the group, the Fach/Domäne pair the slot. */
const TRACK_GROUPS = { group: trackPill, slot: () => PILLS.area, quality: PILLS.area };

/**
 * Bars grouped by Fach, each Fach split into one cluster per Domäne, in payload order.
 * @typedef {CompetenceGroupingAccessors & {
 *     groupByDomain: false,
 *     groupBySubject: true,
 *     subjectDomainOrder: {[subject: string]: string[]},
 * }} CompetenceSubjectGrouping
 */

/**
 * Bars grouped by Fach and Domäne, one group per pair.
 * @typedef {CompetenceGroupingAccessors & {
 *     groupByDomain: true,
 *     groupBySubject: false,
 * }} CompetenceDomainGrouping
 */

/**
 * Bars grouped by group, one bar per Fach/Domäne inside each group.
 * @typedef {CompetenceGroupingAccessors & {
 *     groupByDomain: false,
 *     groupBySubject: false,
 * }} CompetenceGroupNameGrouping
 */

/**
 * How the detail chart groups its bars on the x-axis; `groupBySubject` and
 * `groupByDomain` tell the three strategies apart.
 * @typedef {CompetenceSubjectGrouping|CompetenceDomainGrouping|CompetenceGroupNameGrouping} CompetenceGroupingConfig
 */

/**
 * The label above a row's bar: the group's name, `S` for the school, the comparison
 * track's short label.
 * @param {CompetenceChartRow} entry
 * @param {Map<string, string>} shortLabelByKey - Each comparison track's short label, by render key.
 * @returns {string}
 */
function getRowLabelText(entry, shortLabelByKey) {
    return entry.type === 'group'
        ? entry.name
        : entry.type === 'school'
          ? SHORT_LABEL_PREFIX_BY_ROLE.school
          : (shortLabelByKey.get(entry.renderKey) ?? '');
}

/**
 * The ordinal tag each comparison bar carries (`L`, `L1`, `V`, …), numbered within its
 * role. A lone track of a role needs no ordinal; several do, or the legend's `L1 = …`
 * would decode nothing.
 * @param {CompetenceChartRow[]} comparisonEntries - All tracks, which fix the ordinals.
 * @returns {Map<string, string>} The tag of each track, by render key.
 */
function buildComparisonShortLabels(comparisonEntries) {
    const labels = ordinalShortLabelsByRole(
        comparisonEntries.map((entry) => /** @type {string} */ (entry.comparisonType)),
    );
    return new Map(comparisonEntries.map((entry, i) => [entry.renderKey, labels[i]]));
}

/**
 * Build subject-based grouping config with sub-scale keys suffixed by their Domäne's
 * cluster (`school_d2` is the school's bar in a Fach's third Domäne).
 * @param {CompetenceChartRow[]} chartData
 * @param {boolean} hasGroupData - Whether any group rows are drawn.
 * @param {boolean} hasTeachingQuality
 * @returns {CompetenceSubjectGrouping}
 */
function buildSubjectGrouping(chartData, hasGroupData, hasTeachingQuality) {
    const comparisonEntries = collectComparisonTrackRows(chartData);
    const shortLabelByKey = buildComparisonShortLabels(comparisonEntries);
    const comparisonKeys = comparisonEntries.map((entry) => entry.renderKey);
    /** @type {CompetenceSubjectGrouping['subjectDomainOrder']} */
    const subjectDomainOrder = Object.fromEntries(
        [...group(chartData, (d) => d.subject)].map(([subject, rows]) => [
            subject,
            payloadOrder(rows, (d) => d.domain),
        ]),
    );
    // With several Domänen anywhere, each Domäne is a cluster of its own, its bars keyed
    // by their cluster's place in the Fach; a Fach with one Domäne sits in the first.
    const clusterCount = Math.max(...Object.values(subjectDomainOrder).map((d) => d.length));
    const trackKeys = [...(hasGroupData ? ['group'] : []), 'school', ...comparisonKeys];
    const subScaleDomain =
        clusterCount > 1
            ? range(clusterCount).flatMap((index) => trackKeys.map((key) => `${key}_d${index}`))
            : trackKeys;
    if (hasTeachingQuality) subScaleDomain.push(TEACHING_QUALITY_KEY);

    return {
        groupByDomain: false,
        groupBySubject: true,
        pills: AREA_GROUPS.subject,
        subScaleDomain,
        subjectDomainOrder,
        getGroupKey: (d) => d.subject,
        getSubScaleKey: (d) =>
            clusterCount > 1
                ? `${d.renderKey}_d${subjectDomainOrder[d.subject].indexOf(d.domain)}`
                : d.renderKey,
        getLabelText: (d) => getRowLabelText(d, shortLabelByKey),
    };
}

/**
 * Build domain-based grouping config keyed by subject|domain composite.
 * @param {CompetenceChartRow[]} chartData
 * @param {boolean} hasTeachingQuality
 * @returns {CompetenceDomainGrouping}
 */
function buildDomainGrouping(chartData, hasTeachingQuality) {
    const comparisonEntries = collectComparisonTrackRows(chartData);
    const shortLabelByKey = buildComparisonShortLabels(comparisonEntries);
    const subScaleDomain = sortByFirstType(chartData, (d) => d.name);
    if (hasTeachingQuality) subScaleDomain.push(TEACHING_QUALITY_KEY);

    return {
        groupByDomain: true,
        groupBySubject: false,
        pills: AREA_GROUPS.domain,
        subScaleDomain,
        getGroupKey: (d) => subjectDomainKey(d.subject, d.domain),
        getSubScaleKey: (d) => d.name,
        getLabelText: (d) => getRowLabelText(d, shortLabelByKey),
    };
}

/**
 * Build group-name grouping config with subject|domainLabel sub-bars.
 * @param {CompetenceChartRow[]} chartData
 * @param {boolean} hasTeachingQuality
 * @returns {CompetenceGroupNameGrouping}
 */
function buildGroupNameGrouping(chartData, hasTeachingQuality) {
    const subScaleDomain = payloadOrder(chartData, rowSubjectDomainKey);
    if (hasTeachingQuality) subScaleDomain.push(TEACHING_QUALITY_KEY);

    return {
        groupByDomain: false,
        groupBySubject: false,
        pills: TRACK_GROUPS,
        subScaleDomain,
        getGroupKey: (d) => d.name,
        getSubScaleKey: rowSubjectDomainKey,
        getLabelText: (d) =>
            d.subjectDomainCount === 1 ? d.subject.charAt(0) : d.displayDomainLabel,
    };
}

/**
 * A group's rows in the order their bars are drawn: by their bar's place in
 * `subScaleDomain`, so grouped by Fach a Domäne's bars sit together.
 * @param {CompetenceChartRow[]} rows - The rows of one x-axis group.
 * @param {CompetenceGroupingConfig} groupingConfig
 * @returns {CompetenceChartRow[]} A copy, in draw order.
 */
export function rowsInDrawOrder(rows, { subScaleDomain, getSubScaleKey }) {
    const compare = orderComparator(subScaleDomain);
    return [...rows].sort((a, b) => compare(getSubScaleKey(a), getSubScaleKey(b)));
}

/**
 * Build the grouping config the data and the active groupName imply.
 * @param {CompetenceChartRow[]} chartData
 * @param {string|null} groupName - The scope group, if any.
 * @param {boolean} [hasTeachingQuality] - Whether each group reserves a Unterrichtsqualität slot.
 * @returns {CompetenceGroupingConfig}
 */
export function getGroupingConfig(chartData, groupName, hasTeachingQuality = false) {
    const groupCount = new Set(chartData.filter((d) => d.type === 'group').map((d) => d.name)).size;
    const subjectCount = new Set(chartData.map((d) => d.subject)).size;

    const groupByDomain = groupName ? groupCount <= 1 : subjectCount !== 1 && groupCount <= 1;
    if (groupByDomain && subjectCount > 1) {
        return buildSubjectGrouping(chartData, groupCount > 0, hasTeachingQuality);
    }
    if (groupByDomain) return buildDomainGrouping(chartData, hasTeachingQuality);
    return buildGroupNameGrouping(chartData, hasTeachingQuality);
}

/**
 * The distinct keys of the rows, ordered by their first row's type and then by key:
 * groups, then the school, then the comparisons.
 * @param {CompetenceChartRow[]} chartData
 * @param {(row: CompetenceChartRow) => string} keyOf
 * @returns {string[]}
 */
function sortByFirstType(chartData, keyOf) {
    /** @type {Map<string, string>} key → type of its first row */
    const typeByKey = new Map();
    for (const d of chartData) {
        const key = keyOf(d);
        if (!typeByKey.has(key)) typeByKey.set(key, d.type);
    }
    return [...typeByKey.keys()].sort((a, b) =>
        compareByTypeThenName(
            /** @type {string} */ (typeByKey.get(a)),
            a,
            /** @type {string} */ (typeByKey.get(b)),
            b,
        ),
    );
}

/**
 * The x-axis groups in draw order: Fächer and Fach/Domäne pairs in payload order; a
 * group-name grouping puts the groups first, then the school, then the comparisons.
 * @param {CompetenceChartRow[]} chartData
 * @param {CompetenceGroupingConfig} groupingConfig
 * @returns {string[]}
 */
export function detailXDomain(chartData, groupingConfig) {
    if (!groupingConfig.groupBySubject && !groupingConfig.groupByDomain) {
        return sortByFirstType(chartData, groupingConfig.getGroupKey);
    }
    return payloadOrder(chartData, groupingConfig.getGroupKey);
}

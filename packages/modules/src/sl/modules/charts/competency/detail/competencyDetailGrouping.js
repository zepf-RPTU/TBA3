/**
 * Grouping-config builders for the competency detail chart.
 *
 * Pure functions. Given the prepared chart-data rows (and the active className,
 * if any), they decide how bars are
 * grouped on the x-axis — by subject, by domain, or by class name — and return a
 * `groupingConfig` descriptor with the sub-scale domain plus key/label accessors
 * the renderer uses to place and label bars.
 */

import { getChartDomainAbbreviation } from '../../../../../common/charts/domainLabelFormatter.js';
import { ordinalShortLabel } from '../../../../../common/domain/comparisonGroupLabels.js';
import { TYPE_ORDER } from '../shared/competencyChartConstants.js';
import { getUniqueValues } from '../shared/competencyChartData.js';

/**
 * The distinct Landesschnitt rows, one per track — a state that splits its average by
 * track ships several, and each gets its own ordinal.
 * @param {Array<object>} chartData - The prepared rows.
 * @returns {Array<object>} One entry per track, in first-seen order.
 */
function getStateEntries(chartData) {
    const byKey = new Map();
    for (const entry of chartData) {
        if (entry.type !== 'landesschnitt') continue;
        const key = entry.renderKey ?? entry.name;
        if (!byKey.has(key)) byKey.set(key, entry);
    }
    return [...byKey.values()];
}

/**
 * The key a Landesschnitt row is identified by across renders.
 * @param {object} entry - A Landesschnitt row.
 * @returns {string} Its render key, falling back to its name.
 */
function getStateRenderKey(entry) {
    return entry.renderKey ?? entry.name ?? 'landesschnitt';
}

/**
 * The ordinal tag a Landesschnitt bar carries (`L`, `L1`, `L2`, …). A lone track needs
 * no ordinal; several do, or the legend's `L1 = …` would decode nothing.
 * @param {object} entry - The row being labelled.
 * @param {Array<object>} stateEntries - All tracks, which fix the ordinals.
 * @returns {string} The tag.
 */
function getStateShortLabel(entry, stateEntries) {
    const index = stateEntries.findIndex(
        (state) => getStateRenderKey(state) === getStateRenderKey(entry),
    );
    return ordinalShortLabel('L', index, stateEntries.length);
}

/**
 * Derives shared context (unique names, mode flags) used by all grouping strategies.
 * @param {Array<object>} chartData - The prepared rows.
 * @param {string|null} className - The class the view is scoped to, if any.
 * @returns {object} The rows plus the distinct names and the mode flags the strategies branch on.
 */
function buildGroupingContext(chartData, className) {
    const uniqueClassNames = getUniqueValues(
        chartData.filter((d) => d.type === 'class'),
        (d) => d.name,
    );
    const uniqueSubjects = getUniqueValues(chartData, (d) => d.subject);

    const isByClassesMode = !!className;
    const isSingleSubjectView = uniqueSubjects.length === 1;
    const groupByDomain = isByClassesMode
        ? uniqueClassNames.length <= 1
        : !isSingleSubjectView && uniqueClassNames.length <= 1;
    const groupBySubject = groupByDomain && uniqueSubjects.length > 1;

    return {
        chartData,
        uniqueClassNames,
        uniqueSubjects,
        isByClassesMode,
        isSingleSubjectView,
        groupByDomain,
        groupBySubject,
    };
}

/**
 * Build subject-based grouping config with domain-suffixed sub-scale keys.
 * @param {object} ctx - The shared context from `buildGroupingContext`.
 * @param {boolean} hasTeachingQuality - Whether each group reserves a Unterrichtsqualität slot.
 * @returns {object} The grouping config.
 */
function buildSubjectGrouping(ctx, hasTeachingQuality) {
    const { chartData, uniqueClassNames } = ctx;
    const stateEntries = getStateEntries(chartData);
    const stateKeys = stateEntries.map(getStateRenderKey);
    const subjectDomainCounts = {};
    const subjectDomainOrder = {};
    const hasClassData = uniqueClassNames.length > 0;

    chartData.forEach((d) => {
        if (!subjectDomainCounts[d.subject]) {
            subjectDomainCounts[d.subject] = new Set();
            subjectDomainOrder[d.subject] = [];
        }
        subjectDomainCounts[d.subject].add(d.domain);
        if (!subjectDomainOrder[d.subject].includes(d.domain)) {
            subjectDomainOrder[d.subject].push(d.domain);
        }
    });

    const maxDomains = Math.max(...Object.values(subjectDomainCounts).map((s) => s.size));
    const hasTwoDomainSubjects = Array.from(Object.values(subjectDomainCounts)).some(
        (s) => s.size === 2,
    );

    let subScaleDomain = [];
    if (hasTwoDomainSubjects) {
        if (hasClassData) subScaleDomain.push('class_d0');
        subScaleDomain.push('school_d0', ...stateKeys.map((key) => `${key}_d0`));
        if (hasClassData) subScaleDomain.push('class_d1');
        subScaleDomain.push('school_d1', ...stateKeys.map((key) => `${key}_d1`));
        if (hasTeachingQuality) subScaleDomain.push('teachingQuality');
    } else {
        if (hasClassData) subScaleDomain.push('class');
        subScaleDomain.push('school', ...stateKeys);
        if (hasTeachingQuality) subScaleDomain.push('teachingQuality');
    }

    return {
        groupByDomain: false,
        groupBySubject: true,
        subScaleDomain,
        subjectDomainCounts,
        subjectDomainOrder,
        maxDomains,
        getGroupKey: (d) => d.subject,
        getSubScaleKey: (d) => {
            const domainCount = subjectDomainCounts[d.subject].size;
            const domainIndex = subjectDomainOrder[d.subject].indexOf(d.domain);

            if (domainCount === 1) {
                if (hasTwoDomainSubjects) {
                    return d.type === 'landesschnitt'
                        ? `${getStateRenderKey(d)}_d0`
                        : d.type === 'school'
                          ? 'school_d0'
                          : 'class_d0';
                } else {
                    return d.type === 'landesschnitt'
                        ? getStateRenderKey(d)
                        : d.type === 'school'
                          ? 'school'
                          : 'class';
                }
            } else {
                const domainSuffix = `_d${domainIndex}`;
                return d.type === 'landesschnitt'
                    ? `${getStateRenderKey(d)}${domainSuffix}`
                    : d.type === 'school'
                      ? `school${domainSuffix}`
                      : `class${domainSuffix}`;
            }
        },
        getLabelText: (d) =>
            d.type === 'class'
                ? d.name
                : d.type === 'school'
                  ? 'S'
                  : getStateShortLabel(d, stateEntries),
    };
}

/**
 * Build domain-based grouping config keyed by subject|domain composite.
 * @param {object} ctx - The shared context from `buildGroupingContext`.
 * @param {boolean} hasTeachingQuality - Whether each group reserves a Unterrichtsqualität slot.
 * @returns {object} The grouping config.
 */
function buildDomainGrouping(ctx, hasTeachingQuality) {
    const { chartData } = ctx;
    const stateEntries = getStateEntries(chartData);
    const names = new Set();
    // First-seen type per name so the sort comparator is O(1) per comparison
    // instead of re-scanning chartData with find() on every comparison.
    const typeByName = new Map();
    chartData.forEach((d) => {
        names.add(d.name);
        if (!typeByName.has(d.name)) typeByName.set(d.name, d.type);
    });
    const subScaleDomain = Array.from(names).sort((a, b) => {
        const aType = typeByName.get(a) || 'class';
        const bType = typeByName.get(b) || 'class';
        return TYPE_ORDER[aType] !== TYPE_ORDER[bType]
            ? TYPE_ORDER[aType] - TYPE_ORDER[bType]
            : a.localeCompare(b);
    });

    if (hasTeachingQuality) subScaleDomain.push('teachingQuality');

    return {
        groupByDomain: true,
        groupBySubject: false,
        subScaleDomain,
        getGroupKey: (d) => `${d.subject}|${d.domain}`,
        getSubScaleKey: (d) => d.name,
        getLabelText: (d) =>
            d.type === 'class'
                ? d.name
                : d.type === 'school'
                  ? 'S'
                  : getStateShortLabel(d, stateEntries),
    };
}

/**
 * Build class-name grouping config with subject|domainLabel sub-bars.
 * @param {object} ctx - The shared context from `buildGroupingContext`.
 * @param {Array<object>} chartData - The prepared rows.
 * @param {boolean} hasTeachingQuality - Whether each group reserves a Unterrichtsqualität slot.
 * @returns {object} The grouping config.
 */
function buildClassNameGrouping(ctx, chartData, hasTeachingQuality) {
    const subScaleDomain = [
        ...new Set(chartData.map((d) => `${d.subject}|${d.domainLabel}`)),
    ].sort();
    if (hasTeachingQuality) subScaleDomain.push('teachingQuality');

    const subjectDomainCounts = {};
    const subjectDomainOrder = {};
    const subjectLabels = {};
    chartData.forEach((d) => {
        if (!subjectDomainCounts[d.subject]) {
            subjectDomainCounts[d.subject] = new Set();
            subjectDomainOrder[d.subject] = [];
            subjectLabels[d.subject] = d.subjectLabel || d.subject.charAt(0).toUpperCase();
        }
        subjectDomainCounts[d.subject].add(d.domain);
        if (!subjectDomainOrder[d.subject].includes(d.domainLabel)) {
            subjectDomainOrder[d.subject].push(d.domainLabel);
        }
    });

    let subjectGapsCount = 0;
    let lastSubject = null;
    subScaleDomain.forEach((key) => {
        if (key === 'teachingQuality') return;
        const subject = key.split('|')[0];
        if (lastSubject !== null && subject !== lastSubject) subjectGapsCount++;
        lastSubject = subject;
    });

    return {
        groupByDomain: false,
        groupBySubject: false,
        subScaleDomain,
        subjectDomainCounts,
        subjectDomainOrder,
        subjectLabels,
        subjectGapsCount,
        getGroupKey: (d) => d.name,
        getSubScaleKey: (d) => `${d.subject}|${d.domainLabel}`,
        getLabelText: (d) => {
            const domainCount = subjectDomainCounts[d.subject]?.size || 1;
            if (domainCount === 1) {
                return d.subjectLabel
                    ? d.subjectLabel.charAt(0)
                    : d.subject.charAt(0).toUpperCase();
            }
            return d.displayDomainLabel || getChartDomainAbbreviation(d.domainLabel);
        },
    };
}

/**
 * Dispatch: build the grouping config for the given chart data + active className.
 * @param {Array<object>} chartData - The prepared rows.
 * @param {string|null} className - The class the view is scoped to, if any.
 * @param {boolean} [hasTeachingQuality] - Whether each group reserves a Unterrichtsqualität slot.
 * @returns {object} The grouping config for the mode the data implies.
 */
export function getGroupingConfig(chartData, className, hasTeachingQuality = false) {
    const ctx = buildGroupingContext(chartData, className);
    if (ctx.groupBySubject) return buildSubjectGrouping(ctx, hasTeachingQuality);
    if (ctx.groupByDomain) return buildDomainGrouping(ctx, hasTeachingQuality);
    return buildClassNameGrouping(ctx, chartData, hasTeachingQuality);
}

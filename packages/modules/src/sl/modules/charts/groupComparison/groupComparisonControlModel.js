/**
 * Group-comparison control model — pure decision logic for the chart's selectors:
 * category validity, default groups, the option lists and their unique-value scans.
 * Every function takes the selection plus the chart's payloads
 * and returns a decision, with no chart/DOM coupling; the chart owns `state`, the data
 * fields and the render triggering. What a chart type allows is its registry row's.
 */

import { compareText } from '../../../../common/utils/compare.js';
import { MISSING_VALUE } from '../../../../common/utils/numberFormat.js';
import { CHART_TYPE_CONFIG } from './groupComparisonChartTypes.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { formatChartSubjectDomainLabel } from '../../../../common/charts/domainLabelFormatter.js';
import { CATEGORY_FIELDS } from './groupComparisonDataUtils.js';

/** @typedef {import('./groupComparisonDataUtils.js').SubjectDomainEntry} SubjectDomainEntry */
/** @typedef {import('./groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */
/** @typedef {import('./groupComparisonChartTypes.js').GroupComparisonSources} GroupComparisonSources */

/**
 * Option list for the "Diagrammtyp" selector: every measure whose payload carries rows,
 * in the registry's order. The Lösungsquote stays listed but disabled for a pair tested
 * with different booklets of one Fach, whose rates are not comparable.
 * @param {GroupComparisonSources} sources
 * @param {{pointsMixedBooklets: boolean}} pair - Whether the selected pair mixes booklets.
 * @returns {Array<{value: string, text: string, disabled: boolean}>}
 */
export function buildChartTypeOptions(sources, { pointsMixedBooklets }) {
    return Object.entries(CHART_TYPE_CONFIG)
        .filter(([, config]) => (config.source(sources)?.length ?? 0) > 0)
        .map(([value, config]) => ({
            value,
            text: config.label,
            disabled: value === 'points' && pointsMixedBooklets,
        }));
}

/**
 * Valid "Kategorie" options for the current scope + chart type.
 * - Schule (no scope filter): Lerngruppe, Geschlecht
 * - A specific group: Geschlecht, and Fach for a measure that has one
 * @param {{scopeFilter: string|null, chartType: GroupComparisonSelection['chartType']}} context
 * @returns {Array<{value: string, text: string}>}
 */
export function getValidCategoryOptions({ scopeFilter, chartType }) {
    if (scopeFilter) {
        const options = [{ value: 'gender', text: TERM_CONSTANTS.GENDER }];
        if (CHART_TYPE_CONFIG[chartType].subjectScope !== 'none') {
            options.push({ value: 'subject', text: TERM_CONSTANTS.SUBJECT });
        }
        return options;
    }
    return [
        { value: 'group', text: TERM_CONSTANTS.GROUP },
        { value: 'gender', text: TERM_CONSTANTS.GENDER },
    ];
}

/**
 * Returns `category` if it is valid for the given scope + chart type, otherwise the
 * first valid option (auto-recovery so a scope/chart-type change can't leave the
 * Kategorie control on an option that no longer exists).
 * @param {string} category
 * @param {{scopeFilter: string|null, chartType: GroupComparisonSelection['chartType']}} context
 * @returns {string}
 */
export function ensureValidCategory(category, context) {
    const validValues = getValidCategoryOptions(context).map((o) => o.value);
    return validValues.includes(category) ? category : validValues[0];
}

/**
 * Choose default group1/group2 for a category from its unique values. Ensures the two
 * groups differ when possible.
 * - gender: prefer female + male
 * - subject: prefer the current Fach (or Fach/Domäne) as group1 + the first other one as group2
 * @param {Array<string>} uniqueValues
 * @param {{category?: string, currentSubject?: string|null}} [context] - The category, and for a Fach comparison the value of the current Fach/Domäne (`subjectGroupOf`).
 * @returns {{group1: string, group2: string|null}|null} The two defaults; a sole value is group 1 alone (nothing to compare it with), and `null` when there are no values — the caller then clears both groups.
 */
export function resolveDefaultGroups(uniqueValues, { category, currentSubject } = {}) {
    if (uniqueValues.length >= 2) {
        if (category === 'gender') {
            if (uniqueValues.includes('female') && uniqueValues.includes('male')) {
                return { group1: 'female', group2: 'male' };
            }
        }
        if (category === 'subject' && currentSubject && uniqueValues.includes(currentSubject)) {
            return {
                group1: currentSubject,
                group2: uniqueValues.find((v) => v !== currentSubject) || uniqueValues[0],
            };
        }
        return { group1: uniqueValues[0], group2: uniqueValues[1] };
    }
    if (uniqueValues.length === 1) {
        return { group1: uniqueValues[0], group2: null };
    }
    return null;
}

/**
 * Option list for a group selector: the unique values minus the value already chosen
 * for the *other* group (falling back to the full list if that would empty it).
 * @param {Array<string>} uniqueValues
 * @param {string|null} excludedValue
 * @param {(value: string) => string} labelOf - How a value reads (`groupLabelOf`).
 * @returns {Array<{value: string, text: string}>}
 */
export function buildGroupOptions(uniqueValues, excludedValue, labelOf) {
    const optionValues = uniqueValues.filter((value) => value !== excludedValue);
    const resolvedValues = optionValues.length > 0 ? optionValues : uniqueValues;

    return resolvedValues.map((value) => ({
        value,
        text: labelOf(value),
    }));
}

/**
 * The Fach/Domäne selector's state for the current measure (its `subjectScope`): disabled
 * with a placeholder for Kategorie Fach and a measure without a Fach, one option per Fach
 * for a per-Fach measure, and one per Fach/Domäne otherwise.
 * @param {Pick<GroupComparisonSelection, 'chartType'|'category'|'subjectIndex'>} selection
 * @param {SubjectDomainEntry[]} subjectDomainList
 * @param {string} noSubjectLabel - The placeholder of a measure without a Fach (from the glossary).
 * @returns {{disabled: boolean, selectedValue: string, options: Array<{value: string, text: string}>}}
 */
export function buildSubjectControl(selection, subjectDomainList, noSubjectLabel) {
    const { subjectScope } = CHART_TYPE_CONFIG[selection.chartType];

    if (selection.category === 'subject') {
        return {
            disabled: true,
            selectedValue: String(selection.subjectIndex),
            options: [{ value: String(selection.subjectIndex), text: MISSING_VALUE }],
        };
    }

    if (subjectScope === 'none') {
        return {
            disabled: true,
            selectedValue: '0',
            options: [{ value: '0', text: noSubjectLabel }],
        };
    }

    if (subjectScope === 'subject') {
        const seenSubjects = new Set();
        const options = subjectDomainList.flatMap((sd, index) => {
            if (seenSubjects.has(sd.subjectName)) return [];
            seenSubjects.add(sd.subjectName);
            return [{ value: String(index), text: sd.subjectName }];
        });

        const currentSubjectName = subjectDomainList[selection.subjectIndex]?.subjectName;
        const selectedOption =
            options.find((option) => {
                const optionIndex = Number.parseInt(option?.value ?? '', 10);
                return subjectDomainList[optionIndex]?.subjectName === currentSubjectName;
            }) || options[0];

        return {
            disabled: false,
            selectedValue: selectedOption?.value ?? '0',
            options,
        };
    }

    return {
        disabled: false,
        selectedValue: String(selection.subjectIndex),
        options: subjectDomainList.map((sd, index) => {
            const hasSingleDomain = domainCountForSubject(subjectDomainList, sd.subjectName) === 1;
            const text = formatChartSubjectDomainLabel(
                sd.subjectName,
                hasSingleDomain ? null : sd.domainName,
                { abbreviate: false },
            );
            return { value: String(index), text };
        }),
    };
}

/**
 * @param {SubjectDomainEntry[]} subjectDomainList
 * @param {string} subjectName
 * @returns {number}
 */
function domainCountForSubject(subjectDomainList, subjectName) {
    return subjectDomainList.filter((sd) => sd.subjectName === subjectName).length;
}

/**
 * The distinct values of `category` in the rows a selection draws: the genders,
 * groups or Fächer (Fach/Domänen for Kompetenzstufen) with data there. Under the
 * Kategorie Fach the rows are every Fach's, so every Fach with data is offered.
 * @param {import('./groupComparisonChartTypes.js').ComparisonRecord[]|null} rows - The selection's rows (`COMPARISON_ROWS`).
 * @param {GroupComparisonSelection['category']} category
 * @returns {string[]} Fächer and Fach/Domänen in payload order, the rest sorted.
 */
export function getUniqueValuesForCategory(rows, category) {
    const { field } = CATEGORY_FIELDS[category];
    // The filter drops every empty value, which it cannot say as a type.
    const values = /** @type {string[]} */ ((rows ?? []).map((row) => row[field]).filter(Boolean));
    const unique = [...new Set(values)];
    return category === 'subject' ? unique : unique.sort(compareText);
}

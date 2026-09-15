/**
 * Group-comparison control model — pure decision logic for the chart's interactive
 * selectors (category validity, default-group resolution, group option lists, and the
 * control-state key).
 *
 * Scope note: only the *pure* control decisions live here — the functions take the
 * current selection + already-derived values and return the next decision, with no
 * chart/DOM/state coupling, so they are unit-testable in isolation. The chart still
 * owns `state`, the data fields (`_domainResults`, `domainArray`, `comparison*`), the
 * unique-value scans, and the render triggering, because those are read ~100× across
 * the drawing code; moving them into a stateful sub-object was deliberately declined
 * (see the plan's S2 progress log).
 */

import { CHART_TYPE_LABELS, getGenderLabel } from './groupComparisonDataUtils.js';

/**
 * Option list for the "Diagrammtyp" selector: Kompetenzstufen is always available, the
 * other three measures only when their payload carries rows.
 * @param {{hasPoints: boolean, hasSelfEfficacy: boolean, hasTeachingQuality: boolean}} availability - Which optional payloads are present.
 * @returns {Array<{value: string, text: string}>} The selectable chart types, in strip order.
 */
export function buildChartTypeOptions({ hasPoints, hasSelfEfficacy, hasTeachingQuality }) {
    const options = [{ value: 'ks', text: CHART_TYPE_LABELS.ks }];

    if (hasPoints) {
        options.push({ value: 'points', text: CHART_TYPE_LABELS.points });
    }
    if (hasSelfEfficacy) {
        options.push({ value: 'selfEfficacy', text: CHART_TYPE_LABELS.selfEfficacy });
    }
    if (hasTeachingQuality) {
        options.push({ value: 'teachingQuality', text: CHART_TYPE_LABELS.teachingQuality });
    }

    return options;
}

/**
 * Valid "Kategorie" options for the current scope + chart type.
 * - Schule (no scope filter): Klasse, Geschlecht
 * - A specific class: Geschlecht, and Fach (except selfEfficacy, which has no Fach)
 * @param {{scopeFilter: string|null, chartType: string}} context - The current scope and measure.
 * @returns {Array<{value: string, text: string}>} The categories the control may offer.
 */
export function getValidCategoryOptions({ scopeFilter, chartType }) {
    const isClassScope = !!scopeFilter;
    const isSelfEfficacy = chartType === 'selfEfficacy';

    if (isClassScope) {
        const options = [{ value: 'gender', text: 'Geschlecht' }];
        // Fach is available for ks and teachingQuality but not selfEfficacy
        if (!isSelfEfficacy) {
            options.push({ value: 'fach', text: 'Fach' });
        }
        return options;
    }
    // School-level scope
    return [
        { value: 'class', text: 'Klasse' },
        { value: 'gender', text: 'Geschlecht' },
    ];
}

/**
 * Returns `category` if it is valid for the given scope + chart type, otherwise the
 * first valid option (auto-recovery so a scope/chart-type change can't leave the
 * Kategorie control on an option that no longer exists).
 * @param {string} category - The currently selected category.
 * @param {{scopeFilter: string|null, chartType: string}} context - The current scope and measure.
 * @returns {string} The category to use.
 */
export function ensureValidCategory(category, context) {
    const validValues = getValidCategoryOptions(context).map((o) => o.value);
    return validValues.includes(category) ? category : validValues[0];
}

/**
 * Choose default group1/group2 for a category from its unique values. Ensures the two
 * groups differ when possible. Returns `null` when there are no values, so the caller
 * leaves the current selection unchanged.
 * - gender: prefer female + male, in the payload's own vocabulary (`female`/`male`),
 *   with the single-letter spellings as compatibility fallbacks
 * - fach: prefer the current subject as group1 + the first other subject as group2
 * @param {Array<string>} uniqueValues - The values the category offers.
 * @param {{category?: string, currentSubjectName?: string|null}} [context] - The category, and the Fach the view is on for a Fach comparison.
 * @returns {{group1: string, group2: string}|null} The two defaults, or `null` when there are no values — the caller then keeps its current selection.
 */
export function resolveDefaultGroups(uniqueValues, { category, currentSubjectName } = {}) {
    if (uniqueValues.length >= 2) {
        if (category === 'gender') {
            // Most-preferred spelling first. The data ships the long forms; the letters
            // stay as fallbacks. Without `female`/`male` here the search found neither
            // and the pairing became "whatever the first two values happen to be".
            const weiblich = ['female', 'f', 'w'].find((value) => uniqueValues.includes(value));
            const maennlich = ['male', 'm'].find((value) => uniqueValues.includes(value));
            if (weiblich && maennlich) {
                return { group1: weiblich, group2: maennlich };
            }
            return { group1: uniqueValues[0], group2: uniqueValues[1] };
        }
        if (category === 'fach') {
            if (currentSubjectName && uniqueValues.includes(currentSubjectName)) {
                return {
                    group1: currentSubjectName,
                    group2: uniqueValues.find((v) => v !== currentSubjectName) || uniqueValues[0],
                };
            }
            return { group1: uniqueValues[0], group2: uniqueValues[1] };
        }
        return { group1: uniqueValues[0], group2: uniqueValues[1] };
    }
    if (uniqueValues.length === 1) {
        return { group1: uniqueValues[0], group2: uniqueValues[0] };
    }
    return null;
}

/**
 * Human-readable label for a group value in the current category.
 * @param {string} value - The raw group value.
 * @param {string} category - What the groups are split by, which decides how the value reads.
 * @returns {string} The label to show.
 */
export function getGroupDisplayValue(value, category) {
    if (category === 'gender') return getGenderLabel(value);
    return value;
}

/**
 * Option list for a group selector: the unique values minus the value already chosen
 * for the *other* group (falling back to the full list if that would empty it).
 * @param {Array<string>} uniqueValues - The values the category offers.
 * @param {string} excludedValue - The other group's current value.
 * @param {string} category - What the groups are split by, which decides how the values read.
 * @returns {Array<{value: string, text: string}>} The selectable options.
 */
export function buildGroupOptions(uniqueValues, excludedValue, category) {
    const optionValues = uniqueValues.filter((value) => value !== excludedValue);
    const resolvedValues = optionValues.length > 0 ? optionValues : uniqueValues;

    return resolvedValues.map((value) => ({
        value,
        text: getGroupDisplayValue(value, category),
    }));
}

/**
 * Stable key for the full selection, used to skip redundant control re-syncs.
 * @param {{chartType: string, subjectIndex: number, category: string, scopeFilter: string|null, group1: string|null, group2: string|null}} state - The full selection.
 * @returns {string} A key that changes exactly when the controls would need rebuilding.
 */
export function buildControlStateKey(state) {
    return `${state.chartType}|${state.subjectIndex}|${state.category}|${state.scopeFilter}|${state.group1}|${state.group2}`;
}

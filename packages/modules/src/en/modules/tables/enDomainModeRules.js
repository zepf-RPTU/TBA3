/**
 * enDomainModeRules.js — the pure domain-mode rules shared by the EN class and
 * student-info tables: how a domain's result counts become the percentage/count
 * fields the progress-bar column reads, which columns are visible in which
 * domain mode, and how the hidden style fields are re-pointed at the selected
 * domain's values.
 *
 * Module-level pure functions on purpose (pattern: enItemTaskGrouping.js,
 * enTableColumns.js): the table modules keep the Tabulator choreography
 * (bulk `updateData` vs per-row `row.update`), while these rules stay testable
 * without a table.
 */

/**
 * One domain's Ergebnis frequencies, keyed by what they count, as the student adapter
 * reads them by value. A bucket the payload omits is absent.
 * @typedef {object} DomainResultCounts
 * @property {number|null} [total] - The payload's own denominator
 * @property {number} [correct] - Items scored `Richtig`
 * @property {number} [incorrect] - Items scored `Falsch`
 * @property {number} [notAttempted] - Items left `Unbearbeitet`
 */

/**
 * Derive the per-domain progress-bar fields from a domain's result counts.
 *
 * A bucket the payload omits leaves its own two fields `null` and shifts none of the
 * others. Shares are over the payload's `total`; without one, or for a domain the
 * student has no row in, every share is `null`, which the progress bar draws empty.
 * @param {string} prefix - Domain field prefix ('d0' or 'd1')
 * @param {DomainResultCounts|undefined} counts - The domain's counts, absent for a domain without a row
 * @returns {{[fieldName: string]: number|null}} The six `${prefix}*` fields
 */
export function deriveDomainResultFields(prefix, counts) {
    const { total = null, correct = null, incorrect = null, notAttempted = null } = counts ?? {};
    const share = (count) =>
        count !== null && total !== null && total > 0 ? (count / total) * 100 : null;

    return {
        [`${prefix}PercentageCorrect`]: share(correct),
        [`${prefix}PercentageIncorrect`]: share(incorrect),
        [`${prefix}PercentageNotAttempted`]: share(notAttempted),
        [`${prefix}CorrectCount`]: correct,
        [`${prefix}IncorrectCount`]: incorrect,
        [`${prefix}NotAttemptedCount`]: notAttempted,
    };
}

/**
 * Whether a column is visible in the given domain mode.
 *
 * Single-domain mode hides the *other* domain's progress-bar and GER columns
 * and shows the style columns; 'all' mode shows both domains and hides the
 * style columns (styles are only meaningful for one domain at a time).
 * @param {string} field - The column's field name
 * @param {string} mode - 'all' or a domain id (domainIds[0] / domainIds[1])
 * @param {string[]} domainIds - The two EN domain ids, in order
 * @param {Set<string>} styleFields - Field names of the style columns
 * @returns {boolean} Whether the column belongs in the table in this mode.
 */
export function shouldShowColumnForMode(field, mode, domainIds, styleFields) {
    if (mode === domainIds[0]) {
        return field !== 'd1Percentages' && field !== 'd1GerHtml';
    }
    if (mode === domainIds[1]) {
        return field !== 'd0Percentages' && field !== 'd0GerHtml';
    }
    return !styleFields.has(field);
}

/**
 * Build the row-update object that re-points the visible style fields at the
 * selected domain's nested style values.
 * @param {{[fieldName: string]: number}|undefined} domainStyleData - The row's nested style
 *   object for the selected domain (`rowData[mode]`); absent when the student has no row in it
 * @param {Array<{fieldName: string}>} styleCategories - EN style categories
 * @returns {{[fieldName: string]: number|null}} fieldName → value update object; `null`
 *   where the student has no value, which the percent cells show as "N/A"
 */
export function buildStyleFieldUpdate(domainStyleData, styleCategories) {
    /** @type {{[fieldName: string]: number|null}} */
    const update = {};
    for (const cat of styleCategories) {
        update[cat.fieldName] = domainStyleData?.[cat.fieldName] ?? null;
    }
    return update;
}

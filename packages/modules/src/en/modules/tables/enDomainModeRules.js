/**
 * The pure EN domain-mode rules: the per-domain row fields a student record yields,
 * how a domain's result counts become the percentage/count fields the progress-bar
 * column reads, and which columns are visible in which domain mode. Pure, so the
 * rules are testable without a table.
 */

import { percentOf } from '../../../common/domain/itemResultCounts.js';
import { distributionFields } from '../../../common/tables/distributionFields.js';

/** @typedef {import('../../../common/domain/resultAggregations.js').ResultCounts} ResultCounts */

/**
 * The part of the EN config the visibility rules read.
 * @typedef {{domainIds: string[], styleCategories: Array<{fieldName: string}>}} EnModeConfig
 */

/** The row-field prefix of each domain, in `enConfig.domainIds` order. */
export const DOMAIN_FIELD_PREFIXES = Object.freeze(/** @type {const} */ (['d0', 'd1']));

/** @typedef {(typeof DOMAIN_FIELD_PREFIXES)[number]} DomainFieldPrefix */

/**
 * The per-domain row fields of one student, under the prefixes the columns read: the
 * GER level, the progress-bar fields, and the domain's style shares under the domain
 * id, which the style columns read for the domain in force.
 * @param {Pick<import('../../utils/enStudentDataAdapter.js').EnStudentRecord, 'domains'>} student
 * @param {{domainIds: string[]}} enConfig - Their order assigns the prefixes.
 * @returns {{[field: string]: unknown}}
 */
export function buildEnDomainFields(student, enConfig) {
    /** @type {{[field: string]: unknown}} */
    const fields = {};
    enConfig.domainIds.forEach((domainId, index) => {
        const key = DOMAIN_FIELD_PREFIXES[index];
        const domain = student.domains[domainId];
        const ger = domain?.competenceLevelName || null;
        Object.assign(fields, {
            [`${key}Ger`]: ger,
            ...deriveDomainResultFields(key, domain?.resultCounts),
            // A student without a value group in a domain has no style shares; the cells
            // show the missing mark rather than 0 %.
            [domainId]: domain?.styles ?? {},
        });
    });
    return fields;
}

/**
 * Derive the per-domain progress-bar fields from a domain's result counts.
 *
 * A bucket the payload omits leaves its own two fields `null` and shifts none of the
 * others. Shares are over the payload's `total`; without one, or for a domain the
 * student has no value group in, every share is `null`, which the progress bar draws empty.
 * @param {DomainFieldPrefix} prefix
 * @param {ResultCounts|undefined} counts
 * @returns {{[fieldName: string]: number|null}} The six `${prefix}*` fields
 */
function deriveDomainResultFields(prefix, counts) {
    const { total = null, correct = null, incorrect = null, notAttempted = null } = counts ?? {};
    const share = (/** @type {number|null} */ count) =>
        count !== null && total !== null ? percentOf(count, total) : null;
    const fields = distributionFields(prefix);

    return {
        [fields.correct]: share(correct),
        [fields.incorrect]: share(incorrect),
        [fields.notAttempted]: share(notAttempted),
        [fields.correctCount]: correct,
        [fields.incorrectCount]: incorrect,
        [fields.notAttemptedCount]: notAttempted,
    };
}

/**
 * Whether a column is visible in the given domain mode, for the columns the mode
 * governs: each domain's progress-bar and GER columns, and the style columns.
 *
 * Single-domain mode hides the other domain's progress-bar and GER columns
 * and shows the style columns; 'all' mode shows both domains and hides the
 * style columns (styles belong to one domain at a time). Any other
 * column is not the mode's to decide, so a column the user hid stays hidden.
 * @param {string} field
 * @param {string} mode - 'all' or a domain id (domainIds[0] / domainIds[1])
 * @param {EnModeConfig} enConfig
 * @returns {boolean|undefined} `undefined` for a column the mode does not govern.
 */
export function shouldShowColumnForMode(field, mode, { domainIds, styleCategories }) {
    if (styleCategories.some((category) => category.fieldName === field)) {
        return mode !== 'all';
    }
    const domainIndex = DOMAIN_FIELD_PREFIXES.findIndex(
        (key) => field === distributionFields(key).bar || field === `${key}Ger`,
    );
    if (domainIndex === -1) return undefined;
    return mode === 'all' || mode === domainIds[domainIndex];
}

/**
 * Column definitions with the visibility a domain mode gives them, for a table built
 * while the mode is already set. A column the mode does not govern keeps its own; a
 * column group passes the rule down to its columns (Tabulator hides a group whose
 * columns are all hidden).
 * @template {{field?: string, visible?: boolean, columns?: TColumn[]}} TColumn
 * @param {TColumn[]} columns
 * @param {string} mode - 'all' or a domain id.
 * @param {EnModeConfig} enConfig
 * @returns {TColumn[]} A new array; each mode-dependent definition is a copy with its `visible`.
 */
export function applyModeVisibility(columns, mode, enConfig) {
    return columns.map((column) => {
        if (Array.isArray(column.columns)) {
            return { ...column, columns: applyModeVisibility(column.columns, mode, enConfig) };
        }
        const visible = column.field
            ? shouldShowColumnForMode(column.field, mode, enConfig)
            : undefined;
        return visible === undefined ? column : { ...column, visible };
    });
}

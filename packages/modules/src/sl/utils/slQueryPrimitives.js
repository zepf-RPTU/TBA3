/**
 * The primitives every SL data query is built from: target normalisation, the row filters
 * for a target's state rows and a subject's rows, and the ratio fold.
 *
 * Pure functions over payload rows. The competence-share queries (`slCompetenceShares.js`),
 * the Lösungsquote queries (`slSolutionRates.js`) and the info-box selection verbs all
 * compose these; none of them re-implements a filter.
 */

import { isStateEntry } from '../slCompetenceLevelIndex.js';

/**
 * Bring the two shapes a target arrives in — a name (`'school'`, `'state'` or a class
 * name) or a `{type, ids|classNames}` object — into one descriptor the queries branch on.
 * Idempotent: a descriptor this returned normalises to itself, `ids` included, so a query
 * may hand a normalised target on to another query.
 * @param {*} [target] - The target as the caller expressed it.
 * @param {string} [moduleId] - Names the caller in the warning for an unsupported shape.
 * @returns {{type: 'school'|'state'|'classes', classNames: string[], ids?: string[]}|null} The normalised descriptor, or `null` for an unsupported shape.
 */
export function normalizeTarget(target = null, moduleId = 'unknown') {
    // A placeholder whose class could not be resolved hands its query `null`, which reads
    // as the whole school — the same answer `'school'` asks for.
    if (target === null || target === undefined || target === 'school') {
        return { type: 'school', classNames: [] };
    }

    if (target === 'state') {
        return { type: 'state', classNames: [], ids: [] };
    }

    if (typeof target === 'string') {
        const className = target.trim();
        return className ? { type: 'classes', classNames: [className] } : null;
    }

    if (typeof target === 'object') {
        if (target.type === 'school') {
            return { type: 'school', classNames: [] };
        }

        if (target.type === 'state') {
            return { type: 'state', classNames: [], ids: cleanNames(target.ids) };
        }

        if (Array.isArray(target.classNames)) {
            const classNames = cleanNames(target.classNames);
            return classNames.length > 0 ? { type: 'classes', classNames } : null;
        }
    }

    console.warn(`InfoBoxModule[${moduleId}]: Unsupported competence target`, target);
    return null;
}

/**
 * Trimmed, deduplicated names; anything that is not a non-blank string is dropped.
 * @param {*} names - The names as the caller supplied them.
 * @returns {string[]} The cleaned list.
 */
function cleanNames(names) {
    return [
        ...new Set(
            (Array.isArray(names) ? names : [])
                .filter((name) => typeof name === 'string')
                .map((name) => name.trim())
                .filter(Boolean),
        ),
    ];
}

/**
 * The Landesschnitt rows of a payload, narrowed to the ids a state target names.
 * @param {any[]|null|undefined} rows - Rows of either payload.
 * @param {{ids?: string[]}|null} [target] - A normalised state target; without ids every state row is kept.
 * @returns {any[]} The matching state rows.
 */
export function filterStateRows(rows, target) {
    const stateRows = (rows ?? []).filter(isStateEntry);
    if (!target?.ids?.length) return stateRows;

    const allowedIds = new Set(target.ids);
    return stateRows.filter((entry) => allowedIds.has(entry?.id));
}

/**
 * Rows for one subject, optionally narrowed to a domain. `domainId` is optional but not
 * tri-state: `undefined` keeps the whole subject scope (no domain filter); otherwise rows
 * are filtered to the (possibly null) domain id via `getDomainId`.
 * @param {object} params - Which rows to narrow, and to what.
 * @param {any[]} [params.rows] - The rows to filter.
 * @param {string} params.subjectName - Fach to keep.
 * @param {string|null} [params.domainId] - Domäne to keep; `undefined` keeps the whole subject.
 * @param {(row: any) => (string|null)} [params.getDomainId] - Reads a row's domain id, for row shapes that carry it elsewhere.
 * @returns {any[]} The matching rows.
 */
export function filterSubjectRows({
    rows,
    subjectName,
    domainId = undefined,
    getDomainId = (row) => row?.domain?.id ?? null,
} = /** @type {any} */ ({})) {
    const subjectRows = (Array.isArray(rows) ? rows : []).filter(
        (row) => row?.subject?.name === subjectName,
    );

    if (subjectRows.length === 0) {
        return [];
    }

    if (domainId === undefined) {
        return subjectRows;
    }

    const normalizedDomainId = domainId ?? null;
    return subjectRows.filter((row) => getDomainId(row) === normalizedDomainId);
}

/**
 * Sum a per-row counter into one ratio.
 *
 * A counter may report `covered: false` to mean "this row cannot express the question
 * that was asked" (see `#extractCompetenceLevelCounts` in `slCompetenceShares.js`). When no
 * row could, the answer is null — not the zero the arithmetic would otherwise give.
 * Counters that omit the flag, such as item-success counts, are always covered.
 * @param {any[]} rows - The rows to sum over.
 * @param {(row: any) => object} getCounts - Reads one row's numerator (`matchedCount`), denominator and coverage flag.
 * @returns {number|null} The ratio, or `null` when no row could express the question.
 */
export function sumRatio(rows, getCounts) {
    if (!Array.isArray(rows) || typeof getCounts !== 'function') {
        return null;
    }

    let matchedCount = 0;
    let totalCount = 0;
    let anyCovered = false;

    rows.forEach((row) => {
        const counts = getCounts(row) ?? {};
        matchedCount += Number(counts.matchedCount) || 0;
        totalCount += Number(counts.totalCount) || 0;
        anyCovered = anyCovered || (counts.covered ?? true);
    });

    if (!anyCovered) {
        return null;
    }

    return totalCount > 0 ? matchedCount / totalCount : null;
}

/**
 * The distinct Fach names a set of rows carries, sorted.
 * @param {any[]|null|undefined} rows - Rows of either payload.
 * @returns {string[]} Sorted, deduplicated subject names.
 */
export function getSubjectNamesFromRows(rows) {
    return [
        ...new Set(
            (Array.isArray(rows) ? rows : [])
                .map((row) => row?.subject?.name)
                .filter((subjectName) => typeof subjectName === 'string' && subjectName.trim()),
        ),
    ].sort((a, b) => a.localeCompare(b));
}

/**
 * The Lösungsquote queries — item-based solution rates for a school, its classes or the
 * Landesschnitt, per Fach and Domäne.
 *
 * **No info box states a Lösungsquote.** A rate is an unweighted `Σ frequency / Σ total`
 * over whichever items a row's booklet held, and the classes an SL box compares may sit
 * different booklets within one subject, mostly across Schwierigkeit A/B/C, so the
 * pooling is biased rather than merely noisy. A KS distribution is equated per booklet by
 * the Äquivalenztabelle before it reaches the client and does not have that problem.
 *
 * These queries therefore serve callers outside the boxes only: the Überblick's
 * `Lösungsquote` metric (`slSchoolSummaryMetrics.js`) and the Material pages
 * (`materialContentResolver.js`), where the rate is what the reader asked to see. Do not
 * reintroduce either into a placeholder.
 */

import { emptySlData } from '../slData.js';
import {
    filterStateRows,
    filterSubjectRows,
    normalizeTarget,
    sumRatio,
} from './slQueryPrimitives.js';

export class SolutionRateQueries {
    #moduleId;
    #slData;

    /**
     * @param {object} [options] - Where the data comes from.
     * @param {string} [options.moduleId] - Names the caller in warnings.
     * @param {import('../slData.js').SlData} [options.slData] - The SL data port; without one every rate is `null`.
     */
    constructor({ moduleId, slData } = /** @type {any} */ ({})) {
        this.#moduleId = moduleId ?? 'unknown';
        this.#slData = slData ?? emptySlData();
    }

    /**
     * Solution rate of one subject×domain for a target.
     * @param {object} params - What to read.
     * @param {*} [params.target] - School, state or class target; see `normalizeTarget`.
     * @param {string} params.subjectName - Fach to read.
     * @param {string|null} [params.domainId] - Domäne to read; tri-state, see `#getRowsForSolutionRateSubjectDomain`.
     * @returns {number|null} The rate, or `null` when nothing matched.
     */
    getSolutionRate({
        target = null,
        subjectName,
        domainId = undefined,
    } = /** @type {any} */ ({})) {
        const normalizedTarget = normalizeTarget(target, this.#moduleId);
        if (!normalizedTarget || !subjectName) {
            return null;
        }

        const rows = this.#getRowsForSolutionRateTarget(normalizedTarget);
        const matchingRows = this.#getRowsForSolutionRateSubjectDomain({
            rows,
            subjectName,
            domainId,
        });

        if (matchingRows.length === 0) {
            return null;
        }

        return sumRatio(matchingRows, (row) => this.#extractItemSuccessCounts(row));
    }

    /**
     * Solution rate aggregated over a whole Fach; a school target pools its class rows.
     * @param {object} params - What to read.
     * @param {*} [params.target] - School, state or class target; see `normalizeTarget`.
     * @param {string} params.subjectName - Fach to read.
     * @param {string|null} [params.domainId] - Domäne to keep; `undefined` keeps the whole Fach.
     * @returns {number|null} The rate, or `null` when nothing matched.
     */
    getSubjectSolutionRate({
        target = null,
        subjectName,
        domainId = undefined,
    } = /** @type {any} */ ({})) {
        const normalizedTarget = normalizeTarget(target, this.#moduleId);
        if (!normalizedTarget || !subjectName) {
            return null;
        }

        const rows = this.#getRowsForSubjectAggregateSolutionTarget(normalizedTarget);
        const matchingRows = filterSubjectRows({
            rows,
            subjectName,
            domainId,
            getDomainId: (row) => this.#getItemRowDomainId(row),
        });

        if (matchingRows.length === 0) {
            return null;
        }

        return sumRatio(matchingRows, (row) => this.#extractItemSuccessCounts(row));
    }

    #getRowsForSolutionRateTarget(target) {
        const items = this.#slData.items();
        if (!items.length || !target) {
            return [];
        }

        const { schoolId } = this.#slData.competenceLevelIndex();
        if (!schoolId) {
            return [];
        }

        if (target.type === 'school') {
            return items.filter((entry) => entry?.id === schoolId);
        }

        if (target.type === 'state') {
            return filterStateRows(items, target);
        }

        if (target.type === 'classes') {
            const allowedClasses = new Set(target.classNames);
            const classNameByGroupId = this.#getVerifiedClassNameByGroupId();
            return items.filter((entry) =>
                allowedClasses.has(this.#getItemRowClassName(entry, classNameByGroupId)),
            );
        }

        return [];
    }

    /**
     * Item rows for one subject's solution rate, narrowed to a domain. `domainId`
     * is tri-state: `undefined` infers a single-domain subject (warns otherwise),
     * `null` targets the whole subject, a string targets that specific domain.
     * @param {object} params - Which rows to narrow, and to what.
     * @param {any[]} [params.rows] - The item rows to filter.
     * @param {string} params.subjectName - Fach to keep.
     * @param {string|null} [params.domainId] - Domäne to keep; see the tri-state above.
     * @returns {any[]} The matching rows.
     */
    #getRowsForSolutionRateSubjectDomain({ rows, subjectName, domainId = undefined }) {
        const subjectRows = (Array.isArray(rows) ? rows : []).filter(
            (row) => row?.subject?.name === subjectName,
        );

        if (subjectRows.length === 0) {
            return [];
        }

        const availableDomainIds = [
            ...new Set(subjectRows.map((row) => this.#getItemRowDomainId(row))),
        ];

        if (domainId === undefined) {
            if (availableDomainIds.length === 1 && availableDomainIds[0] === null) {
                domainId = null;
            } else {
                console.warn(
                    `InfoBoxModule[${this.#moduleId}]: domainId is required for multi-domain solution-rate subject "${subjectName}"`,
                );
                return [];
            }
        }

        const normalizedDomainId = domainId ?? null;

        // `domainId: null` asks for the whole subject, and the two files may describe
        // that subject at different granularities: the exports split Mathematik into
        // five item domains while competence-levels.json carries one `domain: null`
        // Mathematik row, so filtering to a literal null domain matches nothing. Sum
        // every domain instead — but only when no row is domain-less, since `sl` puts
        // its Mathematik items on `domain: null` too and there the filter is exact.
        if (normalizedDomainId === null && !availableDomainIds.includes(null)) {
            return subjectRows;
        }

        return subjectRows.filter((row) => this.#getItemRowDomainId(row) === normalizedDomainId);
    }

    #getRowsForSubjectAggregateSolutionTarget(target) {
        const items = this.#slData.items();
        if (!items.length || !target) {
            return [];
        }

        if (target.type === 'school') {
            const classNameByGroupId = this.#getVerifiedClassNameByGroupId();
            return items.filter((entry) => this.#getItemRowClassName(entry, classNameByGroupId));
        }

        if (target.type === 'state') {
            return filterStateRows(items, target);
        }

        if (target.type === 'classes') {
            const allowedClasses = new Set(target.classNames);
            const classNameByGroupId = this.#getVerifiedClassNameByGroupId();
            return items.filter((entry) =>
                allowedClasses.has(this.#getItemRowClassName(entry, classNameByGroupId)),
            );
        }

        return [];
    }

    #extractItemSuccessCounts(row) {
        let matchedCount = 0;
        let totalCount = 0;

        (Array.isArray(row?.items) ? row.items : []).forEach((item) => {
            const total = Number(item?.descriptiveStatistics?.total);
            const frequency = Number(item?.descriptiveStatistics?.frequency);
            const safeTotal = Number.isFinite(total) ? total : 0;
            const safeFrequency = Number.isFinite(frequency) ? frequency : 0;

            totalCount += safeTotal;
            matchedCount += safeFrequency;
        });

        return {
            matchedCount,
            totalCount,
        };
    }

    /**
     * An item row's domain, keyed the way the competence-levels aggregates key
     * theirs (`domain.id`), because that is what the callers compare against.
     * `domain.name` is the human label ("Leseverstehen") and names no aggregate row.
     * @param {object} row - An item row.
     * @returns {string|null} Its domain id, or `null` when it carries none.
     */
    #getItemRowDomainId(row) {
        const domainId = typeof row?.domain?.id === 'string' ? row.domain.id.trim() : '';
        return domainId || null;
    }

    /**
     * The Testgruppen of this dataset, keyed by the id both payloads identify them
     * by, valued with the name the competence-levels aggregates spell them with —
     * which is the vocabulary every caller targets, since `normalizeTarget` builds
     * its `classNames` from the same rows `listClassColumns` reads.
     *
     * Joining on the id is what makes the two files agree on what a class is called.
     * Reading the class out of the *shape* of an id or a name does not: two attempts
     * at that regex fail, because `sl` puts the class in the id (`8a-deutsch`) and prose
     * in the name (`Lerngruppe 8a-deutsch`), while a state export puts an opaque numeric
     * group id in `id` and a free-text Lerngruppen-Kürzel in `name` (`E_E1_08_ABCD`)
     * that no `8a`-shaped pattern matches.
     * @returns {Map<string, string>} Group id → class name.
     */
    #getClassNameByGroupId() {
        const byId = new Map();
        for (const row of this.#slData.competenceLevelIndex().classRows) {
            const id = typeof row?.id === 'string' ? row.id.trim() : '';
            const name = typeof row?.name === 'string' ? row.name.trim() : '';
            if (id && name) {
                byId.set(id, name);
            }
        }

        return byId;
    }

    /**
     * The class an item row belongs to, or `null` when it belongs to none — which is
     * also what makes a row *not* part of the school aggregate, and is what keeps the
     * school's own row and the Landesschnitt out of it.
     * @param {object} row - An item row.
     * @param {Map<string, string>} classNameByGroupId - From `#getClassNameByGroupId`.
     * @returns {string|null} Its class name, or `null` when its id names no Testgruppe.
     */
    #getItemRowClassName(row, classNameByGroupId) {
        const id = typeof row?.id === 'string' ? row.id.trim() : '';
        return (id && classNameByGroupId.get(id)) || null;
    }

    /**
     * `#getClassNameByGroupId`, warning once per call when the items payload carries
     * Testgruppen that join to nothing.
     *
     * The join failing is not a data-free state: it means the two payloads disagree
     * about the ids of the same groups, and every Klassen-scoped Lösungsquote then
     * comes back `null` while the competence shares beside it keep working. That is
     * how the previous regex survived two rounds of review — it failed silently.
     * @returns {Map<string, string>} Group id → class name.
     */
    #getVerifiedClassNameByGroupId() {
        const classNameByGroupId = this.#getClassNameByGroupId();
        const groupRows = this.#slData.items().filter((row) => row?.type === 'group');
        if (
            groupRows.length > 0 &&
            !groupRows.some((row) => this.#getItemRowClassName(row, classNameByGroupId))
        ) {
            console.warn(
                `InfoBoxModule[${this.#moduleId}]: no item row's group id matches a competence-levels class row — every Klassen-scoped Lösungsquote will be null`,
            );
        }

        return classNameByGroupId;
    }
}

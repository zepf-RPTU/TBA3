/**
 * The primitives every SL data query is built from: target normalisation, the value-group
 * filters for a comparison population's and a subject's value groups, and the ratio fold.
 * Pure functions over payload value groups.
 */

import { rollup } from 'd3-array';
import { isExternalPopulation } from '../../common/domain/comparisonGroupLabels.js';

/**
 * A `competence-levels.json` value group, as the SL queries read it.
 * @typedef {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup
 */

/**
 * A value group of either payload the queries filter: competence levels or aggregations.
 * @typedef {CompetenceLevelsValueGroup|import('../../common/data/schemas/aggregations.js').AggregationsValueGroup} PayloadValueGroup
 */

/**
 * A query target as callers express it: `'school'`, a group name, or a
 * `{type: 'comparison', id}` / `{groupNames}` descriptor; `null` reads as the school.
 * @typedef {string|{type?: string, id?: string, groupNames?: ReadonlyArray<string>}|null} QueryTarget
 */

/**
 * One value group's contribution to a ratio: numerator, denominator and whether the value
 * group could express the question (omitted means covered). One the payload gives no counts for —
 * a Landesschnitt, whose source stores shares only — reports its `share` instead.
 * @typedef {{matchedCount?: number, totalCount?: number, share?: number, covered?: boolean}} RatioCounts
 */

/**
 * Bring the two shapes a target arrives in — a name (`'school'` or a group name) or a
 * `{type, id|groupNames}` object — into one descriptor the queries branch on. Idempotent:
 * a descriptor this returned normalises to itself, so a query may hand a normalised
 * target on to another query.
 *
 * A comparison target names exactly one population by its payload `id`. There is no
 * "every comparison" target: a Landesschnitt split by track, or a Landesschnitt beside a
 * district average, are different populations.
 * @param {QueryTarget} [target]
 * @param {string} [moduleId] - Names the caller in the warning for an unsupported shape.
 * @returns {{type: 'school'|'groups', groupNames: string[]}|{type: 'comparison', groupNames: string[], id: string}|null} `null` for an unsupported shape.
 */
export function normalizeTarget(target = null, moduleId = 'unknown') {
    // A placeholder whose group could not be resolved hands its query `null`, which reads
    // as the whole school — the same answer `'school'` asks for.
    if (target === null || target === undefined || target === 'school') {
        return { type: 'school', groupNames: [] };
    }

    if (typeof target === 'string') {
        const groupName = target.trim();
        return groupName ? { type: 'groups', groupNames: [groupName] } : null;
    }

    if (typeof target === 'object') {
        if (target.type === 'school') {
            return { type: 'school', groupNames: [] };
        }

        if (target.type === 'comparison' && typeof target.id === 'string' && target.id.trim()) {
            return { type: 'comparison', groupNames: [], id: target.id.trim() };
        }

        if (Array.isArray(target.groupNames)) {
            const groupNames = cleanNames(target.groupNames);
            return groupNames.length > 0 ? { type: 'groups', groupNames } : null;
        }
    }

    console.warn(`normalizeTarget[${moduleId}]: Unsupported competence target`, target);
    return null;
}

/**
 * Trimmed, deduplicated names; blank ones are dropped.
 * @param {ReadonlyArray<string>} names
 * @returns {string[]}
 */
function cleanNames(names) {
    return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

/**
 * The key one comparison population is drawn and toggled under in the competence charts'
 * bars and legend pills, where it shares one key space with the Schulschnitt (`school`)
 * and the groups: prefixed, so no payload id can collide with theirs. Keyed by the payload
 * `id`, so several tracks of one `type` stay separately toggleable.
 * @param {string} id - The population's payload id.
 * @returns {string} `comparison:<id>`.
 */
export function comparisonAverageId(id) {
    return `comparison:${id}`;
}

/**
 * The value groups of one comparison population.
 * @template {PayloadValueGroup} R
 * @param {R[]|null|undefined} valueGroups
 * @param {string} id - The population's payload id.
 * @returns {R[]} Its value groups, one per Fach and Domäne it was delivered for.
 */
export function filterComparisons(valueGroups, id) {
    return (valueGroups ?? []).filter((entry) => isExternalPopulation(entry) && entry.id === id);
}

/**
 * The Domänen a query reads, decided once where the question is put (the info-box resolver,
 * a verb, a metric): one Domäne by id, `null` for the value group without a Domäne (a Fach
 * not split, such as Mathematik), or `ALL_DOMAINS`, the Fach as a whole.
 * @typedef {string|null|typeof ALL_DOMAINS} DomainScope
 */

/** The `DomainScope` of a question about a whole Fach. */
export const ALL_DOMAINS = Symbol('allDomains');

/**
 * A value group's Domäne id, `null` for one without a Domäne: such a value group stands for the
 * whole Fach. The schema has already trimmed the id and refused a blank one.
 * @param {{domain?: {id?: string}}} valueGroup
 * @returns {string|null}
 */
export function domainIdOf(valueGroup) {
    return valueGroup.domain?.id ?? null;
}

/**
 * Value groups of one subject in a domain scope: `ALL_DOMAINS` keeps every one of the
 * subject's, a Domäne id or `null` only the value groups of that (possibly missing) Domäne.
 * @template {PayloadValueGroup} R
 * @param {object} params
 * @param {R[]} params.valueGroups
 * @param {string} params.subjectName
 * @param {DomainScope} params.domainId
 * @returns {Array<R & {subject: {name: string}}>}
 */
export function filterBySubject({ valueGroups, subjectName, domainId }) {
    const ofSubject = valueGroups.filter(
        /** @type {(valueGroup: R) => valueGroup is R & {subject: {name: string}}} */ (
            (valueGroup) => valueGroup.subject?.name === subjectName
        ),
    );
    if (domainId === ALL_DOMAINS) return ofSubject;
    return ofSubject.filter((valueGroup) => domainIdOf(valueGroup) === domainId);
}

/**
 * Value groups of one subject, narrowed to the one Domäne a per-Domäne figure is read for.
 * `ALL_DOMAINS` is that of a subject whose value groups carry no Domäne (and warns for any
 * other subject, which has no single per-Domäne figure), `null` the domain-less value
 * group, a string that one Domäne.
 *
 * `wholeSubjectWhenSplit` covers two documents describing one subject at different
 * granularities: the exports split Mathematik into five item domains in
 * `aggregations.json` while `competence-levels.json` carries one domain-less value group, so
 * `null` there would match nothing. With the flag, `null` on a subject whose value groups all
 * carry a domain sums every domain; where a domain-less one exists the filter stays exact.
 * @template {PayloadValueGroup} R
 * @param {object} params
 * @param {R[]} params.valueGroups
 * @param {string} params.subjectName
 * @param {DomainScope} params.domainId
 * @param {boolean} [params.wholeSubjectWhenSplit] - Read `null` on an all-split subject as the whole subject.
 * @param {string} params.caller - Names the query in the warning.
 * @returns {Array<R & {subject: {name: string}}>}
 */
export function narrowToSubjectDomain({
    valueGroups,
    subjectName,
    domainId,
    wholeSubjectWhenSplit = false,
    caller,
}) {
    const ofSubject = filterBySubject({ valueGroups, subjectName, domainId: ALL_DOMAINS });
    if (ofSubject.length === 0) return [];

    const availableDomainIds = new Set(ofSubject.map(domainIdOf));
    if (domainId === ALL_DOMAINS) {
        if (availableDomainIds.size !== 1 || !availableDomainIds.has(null)) {
            console.warn(
                `${caller}: domainId is required for multi-domain subject "${subjectName}"`,
            );
            return [];
        }
        domainId = null;
    }

    if (domainId === null && wholeSubjectWhenSplit && !availableDomainIds.has(null)) {
        return ofSubject;
    }
    return filterBySubject({ valueGroups: ofSubject, subjectName, domainId });
}

/**
 * Sum a per-value-group counter into one ratio.
 *
 * A counter may report `covered: false`: this value group cannot express the question
 * (see `extractCompetenceLevelCounts` in `slCompetenceShares.js`). When no value group
 * could, the answer is null rather than the arithmetic's zero. Counters that omit the
 * flag, such as item-success counts, are always covered.
 *
 * A value group with a `share` but no counts answers on its own but cannot be pooled:
 * nothing says how much it weighs against the others. Pooling it answers null.
 * @template R
 * @param {R[]} valueGroups
 * @param {(valueGroup: R) => RatioCounts|null} getCounts - Reads one value group's numerator (`matchedCount`), denominator and coverage flag, or its uncounted `share`.
 * @returns {number|null} The ratio, or `null` when no value group could express the question or value groups without counts would have to be pooled.
 */
export function sumRatio(valueGroups, getCounts) {
    const allCounts = valueGroups.map((valueGroup) => getCounts(valueGroup) ?? {});
    const covered = allCounts.filter((counts) => counts.covered ?? true);
    if (covered.length === 0) {
        return null;
    }

    const uncounted = covered.filter((counts) => Number.isFinite(counts.share));
    if (uncounted.length > 0) {
        return covered.length === 1 ? /** @type {number} */ (uncounted[0].share) : null;
    }

    // Uncovered value groups still contribute their denominators — they measured students, just
    // not on the levels asked for.
    let matchedCount = 0;
    let totalCount = 0;
    allCounts.forEach((counts) => {
        matchedCount += Number(counts.matchedCount) || 0;
        totalCount += Number(counts.totalCount) || 0;
    });

    return totalCount > 0 ? matchedCount / totalCount : null;
}

/**
 * The distinct Fach names a set of value groups carries, in payload order.
 * @param {PayloadValueGroup[]|null|undefined} valueGroups
 * @returns {string[]}
 */
export function subjectNamesOf(valueGroups) {
    return [
        ...new Set(
            (Array.isArray(valueGroups) ? valueGroups : [])
                .map((valueGroup) => valueGroup?.subject?.name)
                .filter(
                    /** @type {(subjectName: string|undefined) => subjectName is string} */ (
                        (subjectName) => subjectName !== undefined
                    ),
                ),
        ),
    ];
}

/**
 * The first entry per key, in first-seen order: what `Array.prototype.find` would pick
 * for each key.
 * @template T
 * @param {Iterable<T>} entries
 * @param {(entry: T) => string} keyOf
 * @returns {Map<string, T>}
 */
export function firstPerKey(entries, keyOf) {
    return rollup(entries, (perKey) => perKey[0], keyOf);
}

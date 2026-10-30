/**
 * Merges the EN competence-level and style-aggregation person documents into one record
 * per student, its domain values keyed by domain id.
 */

import { readStyleShares } from './enStyleAggregationAdapter.js';
import {
    readCorrectShare,
    readItemResults,
    readResultCounts,
    readStudentIdentity,
    toPercent,
} from '../../common/domain/index.js';
import { readItemLevelSpan } from '../../common/services/competenceScalePayload.js';

/** @typedef {import('../../common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/** @typedef {import('../../common/data/schemas/aggregations.js').StudentAggregationsValueGroup} AggregationsValueGroup */

/**
 * One domain of an EN student, as its two person documents deliver it.
 * @typedef {object} EnStudentDomain
 * @property {string|null} [competenceLevelName] - The GER level's short name; `null` for a value group without one
 * @property {import('../../common/services/competenceScalePayload.js').ItemLevelSpan|null} [competenceLevelItemSpan] -
 *   The item slots that level covers on the student's own booklet; null when not shipped
 * @property {number} [percentage] - The solved share in %; absent without a `Richtig` mean
 * @property {import('../../common/domain/resultAggregations.js').ResultCounts} [resultCounts] - The result counts, read by value
 * @property {{[style: string]: number}} [styles] - Style share by style value; a style the entry has no aggregation for stays absent, never 0
 */

/**
 * One EN student with both domains merged.
 * @typedef {import('../../common/domain/studentIdentity.js').StudentIdentity & {
 *     domains: {[domainId: string]: EnStudentDomain},
 *     itemResults: Map<string, number>,
 * }} EnStudentRecord
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build one record per student from the two EN person documents: identity, and per
 * domain the GER level, the solved share, the result counts and the style shares,
 * plus the student's result code per item (`RESULT_VALUES`, read by value).
 *
 * A domain the config does not register is skipped.
 * @param {CompetenceLevelsValueGroup[]} competenceLevelsData - students-competence-levels.json
 * @param {AggregationsValueGroup[]} styleAggregationData - students-aggregations.json
 * @param {import('../enConfig.js').EnConfig} enConfig - The registered domains
 * @returns {EnStudentRecord[]}
 */
export function buildGroupStudentRecords(competenceLevelsData, styleAggregationData, enConfig) {
    const domainIds = enConfig.domainIds;
    /** @type {Map<string, EnStudentRecord>} */
    const studentMap = new Map();

    /**
     * @param {CompetenceLevelsValueGroup|AggregationsValueGroup} entry
     * @returns {{student: EnStudentRecord, domain: EnStudentDomain}|null} `null` for an unregistered domain.
     */
    const studentDomainOf = (entry) => {
        const domainId = entry.domain?.id;
        if (!domainId || !domainIds.includes(domainId)) return null;
        let student = studentMap.get(entry.id);
        if (!student) {
            student = {
                ...readStudentIdentity(entry),
                domains: {},
                itemResults: new Map(),
            };
            studentMap.set(entry.id, student);
        }
        return { student, domain: (student.domains[domainId] ??= {}) };
    };

    for (const entry of competenceLevelsData) {
        const found = studentDomainOf(entry);
        if (!found) continue;
        const level = entry.competenceLevels?.[0];
        found.domain.competenceLevelName = level?.nameShort ?? null;
        found.domain.competenceLevelItemSpan = readItemLevelSpan(entry, level);
    }

    for (const entry of styleAggregationData) {
        const found = studentDomainOf(entry);
        if (!found) continue;
        const { student, domain } = found;
        domain.styles = readStyleShares(entry.aggregations);
        const counts = readResultCounts(entry.aggregations);
        domain.resultCounts = counts;

        // Without a `Richtig` aggregation carrying a mean it stays absent, and the
        // scatterplot leaves the student out — a share the payload did not state must
        // never read as a measured 0 %.
        const share = readCorrectShare(entry.aggregations);
        if (share !== null) domain.percentage = toPercent(share);

        for (const [iqbId, code] of readItemResults(entry.aggregations)) {
            student.itemResults.set(iqbId, code);
        }
    }

    return Array.from(studentMap.values());
}

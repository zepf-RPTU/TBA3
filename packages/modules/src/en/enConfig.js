/**
 * EN config — the vocabulary one group's payload defines: its domains, style categories,
 * result types and cut scores. The comparison groups are `EN_DATASETS.STYLE_AVERAGES`'s.
 *
 * Built once per store by the pure `buildEnConfig()` as the `EN_DATASETS.CONFIG` dataset;
 * cards read `documents.getDataset(EN_DATASETS.CONFIG)`, pure helpers and chart renderers
 * receive the resulting `EnConfig` as an explicit argument.
 */

import { AGG_TYPE_STYLE } from '../common/domain/apiValueMaps.js';
import { readResultTypes } from '../common/domain/resultAggregations.js';
import { resolveGroupEquivalenceTable } from '../common/domain/competenceScale.js';

/** @typedef {import('../common/domain/resultAggregations.js').ResultType} ResultType */

/** @typedef {import('../common/domain/competenceScale.js').EquivalenceTable} EquivalenceTable */

/** @typedef {import('../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/** @typedef {import('../common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */

/**
 * The vocabulary derived from one group's payload; every part is data-driven, none of
 * it is hard-coded per state. A frozen record, checked once when it is built.
 * @typedef {Readonly<{
 *   domainIds: string[],
 *   domainLabels: string[],
 *   subjectName: string,
 *   styleCategories: Array<{value: string, fieldName: string, label: string}>,
 *   resultTypes: ResultType[],
 *   equivalenceTables: {[domainId: string]: EquivalenceTable|null},
 * }>} EnConfig
 * `domainIds` are the payload's two domains in the order it delivered them, and
 * `domainLabels` their display names, positionally aligned. `subjectName` is the payload's
 * Fach (`Englisch`), the first name any value group carries; '' when none does.
 * `styleCategories` are the Hör-/Lesestil categories (none for a dataset without style
 * buckets),
 * `resultTypes` the result kinds in the fixed order Richtig, Falsch, Unbearbeitet.
 * `equivalenceTables` holds the raw-score cut scores (Äquivalenztabelle) per domain from
 * the group's own booklet — `null` where the payload shipped none, and callers then draw
 * no bands rather than inventing boundaries.
 */

/**
 * Build the {@link EnConfig} from the raw EN JSON payloads. Pure — no globals.
 * @param {CompetenceLevelsValueGroup[]} competenceLevelsData - students-competence-levels.json
 * @param {AggregationsValueGroup[]} studentStyleAggregationData - students-aggregations.json
 * @param {CompetenceLevelsValueGroup[]} competenceLevelsGroupData - competence-levels.json (the aggregate file, not
 *        the per-student one); supplies the per-domain cut scores.
 * @returns {EnConfig}
 * @throws {Error} when the payload does not carry exactly two domains — the EN dashboard
 *   compares its two domains, and every card and table is laid out for a pair. The
 *   domains are read off the group's own value groups and both person documents, so a domain no
 *   student has a value group in still counts.
 */
export function buildEnConfig(
    competenceLevelsData,
    studentStyleAggregationData,
    competenceLevelsGroupData,
) {
    const allEntries = [
        ...competenceLevelsData,
        ...studentStyleAggregationData,
        ...competenceLevelsGroupData,
    ];

    // Domains — unique domain.id in order of first appearance, named by that first entry.
    // The Fach is the first name any entry carries.
    /** @type {Map<string, string>} */
    const domains = new Map();
    let subjectName = '';
    for (const entry of allEntries) {
        subjectName ||= entry.subject?.name ?? '';
        if (entry.domain && !domains.has(entry.domain.id)) {
            domains.set(entry.domain.id, entry.domain.name);
        }
    }
    const domainIds = [...domains.keys()];
    if (domainIds.length !== 2) {
        throw new Error(
            `Expected exactly 2 domains, but found ${domainIds.length}` +
                `${domainIds.length ? `: ${domainIds.join(', ')}` : ''}. ` +
                'The EN dashboard compares two domains; check the payload.',
        );
    }
    // Every entry's style buckets, in order of first appearance: one entry may carry
    // none (a student with result buckets only).
    const styleValues = new Set(
        studentStyleAggregationData.flatMap((entry) =>
            entry.aggregations.filter((a) => a.type === AGG_TYPE_STYLE).map((a) => a.value),
        ),
    );
    const styleCategories = [...styleValues].map((value) => ({
        value,
        fieldName: `${value}Percent`,
        label: value.charAt(0).toUpperCase() + value.slice(1),
    }));

    // One table per domain: the two domains are scored separately, with different
    // maximum points and band boundaries.
    /** @type {{[domainId: string]: EquivalenceTable|null}} */
    const equivalenceTables = {};
    for (const domainId of domainIds) {
        equivalenceTables[domainId] = resolveGroupEquivalenceTable(
            competenceLevelsGroupData.filter((entry) => entry.domain?.id === domainId),
        );
    }

    return Object.freeze({
        domainIds,
        domainLabels: [...domains.values()],
        subjectName,
        styleCategories,
        resultTypes: readResultTypes(studentStyleAggregationData),
        equivalenceTables,
    });
}

/**
 * School-summary metrics — the four measures of the SL school summary.
 *
 * Each metric reduces one subject×domain to a single share for the school, for
 * every group, and for every comparison population the payload ships (typically the
 * Landesschnitt, possibly split by track), each comparable as its deviation from the
 * school value. The metrics themselves live in
 * `slSchoolSummaryMetricRegistry.js`; this module shapes their values into rows plus the
 * scale shared across all rows. DOM-free and side-effect free.
 */

import { max } from 'd3-array';
import { compareText } from '../../common/utils/compare.js';
import { formatChartSubjectDomainLabel } from '../../common/charts/domainLabelFormatter.js';
import { domainIdOf } from './slQueryPrimitives.js';
import { isFiniteNumber } from '../../common/utils/numberFormat.js';
import { ABSENCE_REASONS } from './slSchoolSummaryMetricRegistry.js';

/** Covariate type under which the server names a group's Stammklasse(n). */
const HOMEROOM_COVARIATE_TYPE = 'homeroom';

/**
 * Half-height of the shared scale (in percentage points) when every group
 * matches the school exactly — keeps the zero baseline off a degenerate scale.
 */
const MIN_DEVIATION_EXTENT_PP = 1;

/** @typedef {import('./slSchoolSummaryMetricRegistry.js').SummaryMetric} SummaryMetric */
/** @typedef {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/**
 * A reference average plotted alongside the groups: resolved through the same metric
 * as a group and drawn as the same kind of deviation bar. The school is the baseline,
 * not a column.
 * @typedef {object} SummaryAverage
 * @property {string} id - Stable key the column's visibility is stored under.
 * @property {string} label - Column header, dropdown entry, and tooltip label
 * @property {{type: 'comparison', id: string}} target - Query target, as `normalizeTarget` reads it
 */

/**
 * One bar of a summary row: a reference average or a group, with its deviation from the school.
 * @typedef {object} SummaryEntry
 * @property {string} name - Query key: the group name, or the average's payload name.
 * @property {string} label - What the column is shown under.
 * @property {'average'|'group'} kind
 * @property {number} value - The metric's value, 0–1.
 * @property {number} deltaPP - Deviation from the school value, in percentage points.
 * @property {string} [averageId] - For an average, its `SummaryAverage.id`, which the ⌀ toggles filter by.
 */

/**
 * One subject×domain under the current metric.
 * @typedef {object} SummaryRow
 * @property {string} subjectName
 * @property {string|null} domainId - `null` for a Fach with no domain split.
 * @property {string|null} domainName
 * @property {string} rowLabel - The heading the row is shown under.
 * @property {number} schoolValue - The school's value, the baseline of every bar.
 * @property {SummaryEntry[]} entries - The columns: averages first, then groups.
 */

/**
 * A subject×domain that has no row under the current metric, and why.
 * @typedef {object} SummaryAbsence
 * @property {string} subjectName
 * @property {string|null} domainId - `null` for a Fach with no domain split.
 * @property {string|null} domainName
 * @property {string} rowLabel - The heading the card is shown under.
 * @property {string} reason - One of `ABSENCE_REASONS`.
 */

/**
 * One subject×domain's card, whether the metric gives it a row or not.
 * @typedef {Pick<SummaryRow, 'subjectName'|'domainId'|'domainName'|'rowLabel'>} SummaryCard
 */

/**
 * One subject×domain of the payload, with its heading.
 * @typedef {Pick<SummaryRow, 'subjectName'|'domainId'|'domainName'|'rowLabel'>} SubjectDomain
 */

/**
 * The summary of one metric.
 * @typedef {object} SummarySelection
 * @property {SummaryMetric} metric
 * @property {SummaryCard[]} cards - Every subject×domain, row or absence, in payload order.
 * @property {SummaryRow[]} rows - The rows to draw, in payload order.
 * @property {SummaryAbsence[]} absences - The subject×domains without a row, and why, in payload order.
 * @property {[number, number]} yDomain - The symmetric scale every row shares.
 * @property {ReadonlyArray<SummaryAverage>} averages - Every delivered reference average.
 */

/**
 * The reference averages this payload carries, one per delivered comparison population
 * (the index's `comparisonTracks`), so a payload that splits its Landesschnitt by track
 * yields one column per track. Their ids (the payload ids) are the keys of the app's
 * comparison state, which the ⌀ toggles write and `selectActiveAverages` reads.
 *
 * No static fallback: a comparison the payload lacks would get a column and a menu
 * entry without a bar.
 * @param {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} index
 * @returns {ReadonlyArray<SummaryAverage>} One average per delivered comparison population, in payload order; empty when the payload names none.
 */
function deriveSummaryAverages(index) {
    return index.comparisonTracks.map((track) =>
        Object.freeze({
            id: track.id,
            label: track.name,
            target: Object.freeze({ type: 'comparison', id: track.id }),
        }),
    );
}

/**
 * What one column's bar says for the school: good news, bad news, or none.
 *
 * Sign alone is not enough: on `le_low` a group above the school value has more
 * struggling students, so the bar reads as worse. And an average bar shows where the
 * reference sits relative to the school, so a Landesschnitt above the school is bad
 * news although the same delta on a group is good.
 *
 * No difference is the difference the card prints: rounded to the one decimal of
 * `formatPercentPoints`, so a bar labelled `0,0 PP` is neither good nor bad news,
 * whichever side of zero its raw value lies.
 * @param {{ kind: string, deltaPP: number }} entry
 * @param {boolean} higherIsBetter
 * @returns {'favourable'|'unfavourable'|'neutral'} Also the key of its glossary label and its bar's class modifier.
 */
export function entryVerdict(entry, higherIsBetter) {
    if (Number(entry.deltaPP.toFixed(1)) === 0) return 'neutral';
    return (entry.deltaPP > 0 === higherIsBetter) !== (entry.kind === 'average')
        ? 'favourable'
        : 'unfavourable';
}

/**
 * Build one row per subject×domain, each holding the school value and the
 * deviation from it of every delivered average and every group, plus the shared
 * y scale. The ⌀ toggles filter the averages afterwards (`selectActiveAverages`): no
 * part of a row but its average entries depends on which are on.
 *
 * A row's `entries` are its columns: a column exists exactly where a bar does.
 * Rows and columns without a resolvable value are omitted rather than zero-filled:
 * a zero-height bar would read as "no deviation". Every omitted subject×domain comes
 * back in `absences` with its `ABSENCE_REASONS` cause.
 *
 * Rows, absences and cards all keep the payload's order of subjects and domains.
 * @param {object} params
 * @param {import('./slSchoolSummaryMetricRegistry.js').SummaryQueries} params.queries
 * @param {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} params.index
 * @param {SummaryMetric} params.metric
 * @returns {SummarySelection}
 */
export function buildSummaryRows({ queries, index, metric }) {
    if (index.subjectDomains.length === 0) {
        return {
            metric,
            cards: [],
            rows: [],
            absences: [],
            yDomain: [-MIN_DEVIATION_EXTENT_PP, MIN_DEVIATION_EXTENT_PP],
            averages: [],
        };
    }

    const averages = deriveSummaryAverages(index);

    /** @type {SummaryRow[]} */
    const rows = [];
    /** @type {SummaryAbsence[]} */
    const absences = [];
    const subjectDomains = listSubjectDomains(index);

    for (const subjectDomain of subjectDomains) {
        const built = buildRow({
            queries,
            metric,
            index,
            averages,
            subjectDomain,
        });
        if (built.row) {
            rows.push(built.row);
        } else {
            absences.push({ ...subjectDomain, reason: built.reason });
        }
    }

    return {
        metric,
        cards: subjectDomains.map(({ subjectName, domainId, domainName, rowLabel }) => ({
            subjectName,
            domainId,
            domainName,
            rowLabel,
        })),
        rows,
        absences,
        yDomain: resolveSharedYDomain(rows),
        averages,
    };
}

/**
 * The summary with only the active averages plotted: each row keeps its groups and the
 * averages whose ⌀ toggle is on, and the shared scale fits what is left. `averages`
 * stays the full delivered list, which the ⌀ menu offers.
 * @param {SummarySelection} summary - The summary with every delivered average.
 * @param {ReadonlyArray<string>|null} activeAverageIds - The active averages' ids; `null` for every one, the unset selection. A list is exact: one id per track.
 * @returns {SummarySelection}
 */
export function selectActiveAverages(summary, activeAverageIds) {
    if (activeAverageIds === null) return summary;
    const active = new Set(activeAverageIds);
    const rows = summary.rows.map((row) => ({
        ...row,
        entries: row.entries.filter(
            (entry) =>
                entry.kind === 'group' || active.has(/** @type {string} */ (entry.averageId)),
        ),
    }));
    return { ...summary, rows, yDomain: resolveSharedYDomain(rows) };
}

/**
 * Every subject×domain the payload describes, flattened and in payload order, each with
 * the heading its row, absence or card is shown under.
 *
 * One list for the rows and the absences alike, so the two together cover exactly the dataset
 * under every metric.
 * @param {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} index
 * @returns {SubjectDomain[]}
 */
function listSubjectDomains(index) {
    return index.subjectDomains.flatMap(({ subjectName, domains }) =>
        domains.map(({ domainId, domainName }) => ({
            subjectName,
            domainId,
            domainName,
            rowLabel: formatChartSubjectDomainLabel(subjectName, domainName, { abbreviate: false }),
        })),
    );
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * One subject×domain under one metric: either a row, or the reason there is none.
 *
 * The two failure points carry different reasons. At the first, with groups present,
 * either the payload has no school value group for this subject×domain (the query layer
 * resolves the school only against one) or the metric cannot be answered on this scale. At the second the
 * metric can be answered and the groups produced no value. A metric that withholds this
 * subject×domain (`absence`) turns it away before either, with its own reason.
 * @param {object} params
 * @param {import('./slSchoolSummaryMetricRegistry.js').SummaryQueries} params.queries
 * @param {SummaryMetric} params.metric
 * @param {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} params.index - Its groups, and whether the school has its own value group for this subject×domain.
 * @param {ReadonlyArray<SummaryAverage>} params.averages
 * @param {SubjectDomain} params.subjectDomain
 * @returns {{row: SummaryRow, reason?: undefined} | {row: null, reason: string}} `reason` is one of `ABSENCE_REASONS`.
 */
function buildRow({ queries, metric, index, averages, subjectDomain }) {
    const { subjectName, domainId } = subjectDomain;
    const withheld = metric.absence?.(queries, subjectName, domainId);
    if (withheld) return { row: null, reason: withheld };
    const groupColumns = listGroupColumns(index.groups, subjectName, domainId);
    const schoolValue = metric.resolve(queries, 'school', subjectName, domainId);

    if (!isFiniteNumber(schoolValue)) {
        return {
            row: null,
            reason:
                groupColumns.length === 0
                    ? ABSENCE_REASONS.NO_GROUP_DATA
                    : index.schoolFor(subjectName, domainId)
                      ? ABSENCE_REASONS.METRIC_UNSUPPORTED
                      : ABSENCE_REASONS.NO_SCHOOL,
        };
    }

    /**
     * @param {string} name
     * @param {'average'|'group'} kind
     * @param {number} value
     * @param {string} [label]
     * @returns {SummaryEntry}
     */
    const toEntry = (name, kind, value, label = name) => ({
        name,
        label,
        kind,
        value,
        deltaPP: (value - schoolValue) * 100,
    });

    // Averages lead the row: they are the reference the groups are read against.
    /** @type {SummaryEntry[]} */
    const entries = [];
    for (const average of averages) {
        const value = metric.resolve(queries, average.target, subjectName, domainId);
        if (!isFiniteNumber(value)) continue;

        entries.push({ ...toEntry(average.label, 'average', value), averageId: average.id });
    }

    const groupCountBefore = entries.length;
    for (const { name, label } of groupColumns) {
        const value = metric.resolve(queries, name, subjectName, domainId);
        if (!isFiniteNumber(value)) continue;

        entries.push(toEntry(name, 'group', value, label));
    }

    // A row of averages with no group behind it says nothing about this school.
    if (entries.length === groupCountBefore) {
        return {
            row: null,
            reason:
                groupColumns.length === 0
                    ? ABSENCE_REASONS.NO_GROUP_DATA
                    : ABSENCE_REASONS.NO_GROUP_VALUES,
        };
    }

    return { row: { ...subjectDomain, schoolValue, entries } };
}

/**
 * The group columns of one subject×domain: `name` is the key every query resolves
 * (the test group's own name), `label` is what the column is shown under. Rows may
 * differ in their columns.
 *
 * A test group's name is the school's free-text label for the sitting unit (`8aDeu`,
 * `D-G 8a`, `M-G1`), and the row heading already says the subject. The server names
 * the Stammklasse the sitters come from in a repeatable `homeroom` covariate, so a
 * group drawn from exactly one Stammklasse is labelled by it (`8a`). A group drawn
 * from several or none keeps its own name. So does a group whose homeroom label
 * another column in the row claims (the G-Kurs and E-Kurs of `8a` would read as two
 * `8a` columns) and any column whose own name a homeroom label would shadow. The
 * tooltip always carries the group's name.
 * Sorted by label so a Stammklasse's several courses sit next to each other.
 * @param {CompetenceLevelsValueGroup[]} groupEntries
 * @param {string} subjectName
 * @param {string|null} domainId
 * @returns {Array<{name: string, label: string}>} Sorted by label, then name.
 */
function listGroupColumns(groupEntries, subjectName, domainId) {
    const rows = groupEntries
        .filter((entry) => entry.subject?.name === subjectName && domainIdOf(entry) === domainId)
        .map((entry) => ({ name: entry.name, homeroom: resolveSingleHomeroom(entry) }));

    const claims = new Map();
    for (const { name, homeroom } of rows) {
        const candidate = homeroom ?? name;
        claims.set(candidate, (claims.get(candidate) ?? 0) + 1);
    }

    return rows
        .map(({ name, homeroom }) => ({
            name,
            label: homeroom !== null && claims.get(homeroom) === 1 ? homeroom : name,
        }))
        .sort(
            (a, b) =>
                compareText(String(a.label), String(b.label)) ||
                compareText(String(a.name), String(b.name)),
        );
}

/**
 * The one Stammklasse a group value group's students come from, or `null` when it names
 * none or several.
 * @param {CompetenceLevelsValueGroup} entry
 * @returns {string|null}
 */
function resolveSingleHomeroom(entry) {
    const homerooms = new Set(
        (Array.isArray(entry.covariates) ? entry.covariates : [])
            .filter(
                (covariate) =>
                    covariate?.type === HOMEROOM_COVARIATE_TYPE &&
                    typeof covariate.value === 'string',
            )
            .map((covariate) => covariate.value.trim())
            .filter(Boolean),
    );
    return homerooms.size === 1 ? [...homerooms][0] : null;
}

/**
 * One symmetric scale for every row, sized to the largest deviation anywhere.
 * Rows must share it — otherwise a 2 pp bar in one subject would look as tall
 * as a 39 pp bar in another.
 * @param {SummaryRow[]} rows
 * @returns {[number, number]} In percentage points, never narrower than `MIN_DEVIATION_EXTENT_PP`.
 */
function resolveSharedYDomain(rows) {
    const maxExtent = max(
        rows.flatMap((row) => row.entries),
        (entry) => Math.abs(entry.deltaPP),
    );

    const extent = Math.max(maxExtent ?? 0, MIN_DEVIATION_EXTENT_PP);
    return [-extent, extent];
}

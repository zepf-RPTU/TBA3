/**
 * School-summary metrics — the four measures behind the SL "Überblick" view
 * (slSummaryViewModule).
 *
 * Each metric reduces one subject×domain to a single share for the school, for
 * every class, and for every reference average — the payload ships one, the
 * Landesschnitt — so the view can plot each of them as its deviation from the
 * school value. The numbers themselves come from `CompetenceShareQueries` (shares) and
 * `SolutionRateQueries` (rates); this module only picks the competence-level aliases and
 * shapes the result into rows plus the scales shared across all rows.
 *
 * DOM-free and side-effect free so it can be unit tested directly.
 */

import { buildCompetenceLevelIndex } from '../slCompetenceLevelIndex.js';
import { getSummaryMetric } from './slSchoolSummaryMetricRegistry.js';

/** Covariate type under which the server names a group's Stammklasse(n). */
const HOMEROOM_COVARIATE_TYPE = 'homeroom';

/**
 * Half-height of the shared scale (in percentage points) when every class
 * matches the school exactly — keeps the zero baseline off a degenerate scale.
 */
const MIN_DEVIATION_EXTENT_PP = 1;

/** @typedef {import('./slSchoolSummaryMetricRegistry.js').SummaryMetric} SummaryMetric */

/**
 * Why a subject×domain has no card under the current metric.
 *
 * Absence is not one thing. A scale that cannot express the requested rank
 * (Niedersachsen's Englisch ladder stops at B1, so it has no top-rank level) is
 * correct behaviour and permanent; a subject the export ships a Landesschnitt for but
 * no classes is a gap in the export, and so is a payload whose
 * classes arrive without the school's own row. Reporting them all as "keine Daten"
 * hides which one a Schulleitung is looking at.
 *
 * Each value is also the key of the reason's sentence among the Überblick card's
 * glossary `messages`; `METRIC_UNSUPPORTED` defers to the metric's `unsupportedMessage`.
 * @enum {string}
 */
export const ABSENCE_REASONS = Object.freeze({
    /** The export has no class rows for this subject×domain at all. */
    NO_CLASS_DATA: 'no-class-data',
    /** Classes exist but the payload has no school row, so no school value resolves. */
    NO_SCHOOL_ROW: 'no-school-row',
    /** Classes and the school row exist, but this metric cannot be answered here — see `unsupportedMessage`. */
    METRIC_UNSUPPORTED: 'metric-unsupported',
    /** The school resolved but no individual class did. */
    NO_CLASS_VALUES: 'no-class-values',
});

/**
 * Shared by the three standard-based metrics: they all fail the same way, when the
 * subject's scale names no level of the requested rank. That is the "unknown, never
 * 0 %" rule doing its job, not missing data — see `#extractCompetenceLevelCounts`.
 */

/**
 * Reference averages plotted alongside the classes. They are resolved through
 * the same metric as a class and drawn as the same kind of deviation bar — the
 * school itself is not listed here because it is the baseline, not a column.
 * @typedef {object} SummaryAverage
 * @property {string} id - Stable key the column's visibility is stored under.
 * @property {string} label - Column header, dropdown entry, and tooltip label
 * @property {string} target - Query target, as `normalizeTarget` reads it
 */

/**
 * The reference averages this payload actually carries, one per delivered state
 * entry, so a payload that splits its Landesschnitt by track yields one column per
 * track. Their ids (`state:<payload id>`) are what `SlAppModule` seeds the app's
 * comparison state with — the ⌀ toggles in the Überblick cards write that state, and
 * `buildSummaryRows` reads it back as `activeAverageIds`.
 * @param {Array<object>} [competenceLevels] - The raw competence-level entries.
 * @returns {ReadonlyArray<object>} One average per delivered state entry, in payload order; empty when the payload names none.
 */
export function deriveSummaryAverages(competenceLevels = []) {
    const byId = new Map();
    for (const entry of competenceLevels ?? []) {
        if (entry?.type !== 'state') continue;
        const sourceId = entry.id;
        const id = `state:${sourceId}`;
        if (byId.has(id)) continue;
        byId.set(
            id,
            Object.freeze({
                id,
                label: entry.name,
                target: Object.freeze({ type: 'state', ids: Object.freeze([sourceId]) }),
                sourceId,
                sourceName: entry.name,
                sourceType: 'state',
            }),
        );
    }

    // No static fallback: a payload with no state rows has no Landesschnitt to plot, and
    // naming one anyway put a column and a menu entry on the card that no bar could ever
    // follow — the same rule the band already applies, that a column exists only where a
    // bar does.
    return [...byId.values()];
}

/**
 * Whether a class deviation reads as "better than the school".
 *
 * Sign alone is not enough: on `below_minimum` a class *above* the school value
 * has more struggling students, so the bar must read as worse.
 * @param {number} deltaPP - The class's deviation from the school, in percentage points.
 * @param {boolean} higherIsBetter - Whether a higher value of this metric is the good direction.
 * @returns {boolean} True when the bar should read as good news.
 */
export function isDeviationFavourable(deltaPP, higherIsBetter) {
    return deltaPP >= 0 === higherIsBetter;
}

/**
 * Whether one column's bar reads as good news for the school.
 *
 * A class bar answers "is this class better than our school?", so it follows
 * `isDeviationFavourable` directly. An average bar answers the opposite
 * question — it shows where the *reference* sits relative to us, so a
 * Landesschnitt above our school is bad news and must read red even though the
 * same delta on a class would be green.
 * @param {{ kind: string, deltaPP: number }} entry - One column's bar: a class or a reference average.
 * @param {boolean} higherIsBetter - Whether a higher value of this metric is the good direction.
 * @returns {boolean} True when the bar should read as good news for the school.
 */
export function isEntryFavourable(entry, higherIsBetter) {
    const favourable = isDeviationFavourable(entry?.deltaPP ?? 0, higherIsBetter);
    return entry?.kind === 'average' ? !favourable : favourable;
}

/**
 * Build one row per subject×domain, each holding the school value and the
 * deviation from it of every active average and every class, plus the shared
 * y scale.
 *
 * A row's `entries` *are* its columns: a column exists exactly where a bar does.
 * Rows and columns without a resolvable value are omitted rather than zero-filled —
 * a zero-height bar would read as "no deviation" instead of "no data". Every omitted
 * subject×domain comes back in `absences` with the reason it could not be built, so
 * the view can say which of the three causes applies instead of leaving a hole.
 *
 * Rows come back sorted best-to-worst by their school value, so the metric's
 * direction (`higherIsBetter`) decides the sort order.
 * @param {object} params - The data source plus the metric and averages currently selected.
 * @param {import('./slSchoolSummaryMetricRegistry.js').SummaryQueries} params.queries - The share and rate helpers a metric reads.
 * @param {Array<any>} params.competenceLevels - Raw competence-levels.json rows
 * @param {string} [params.metricId] - The selected metric; an unknown id falls back to the default.
 * @param {string[]|null} [params.activeAverageIds] - Ids from `deriveSummaryAverages` to plot — the app's active comparisons. Omit (or pass `null`) for every delivered average.
 * @returns {{metric: SummaryMetric, rows: Array<object>, absences: Array<object>, yDomain: [number, number], averages: ReadonlyArray<SummaryAverage>}} The rows to draw, the subject×domains that could not be built and why, the shared scale, and the averages actually present.
 */
export function buildSummaryRows({
    queries,
    competenceLevels,
    metricId,
    activeAverageIds = null,
} = /** @type {any} */ ({})) {
    const metric = getSummaryMetric(metricId);

    if (!queries || !competenceLevels?.length) {
        return {
            metric,
            rows: [],
            absences: [],
            yDomain: [-MIN_DEVIATION_EXTENT_PP, MIN_DEVIATION_EXTENT_PP],
            averages: [],
        };
    }

    // No list means every delivered average — the app seeds its comparison state that
    // way, and a caller without app state gets the same picture. A list is exact: the
    // app holds one key per track, so nothing here widens a selection.
    const allAverages = deriveSummaryAverages(competenceLevels);
    const averages = activeAverageIds
        ? allAverages.filter((average) => activeAverageIds.includes(average.id))
        : [...allAverages];

    const index = buildCompetenceLevelIndex(competenceLevels);
    const classEntries = index.classRows;
    const hasSchoolRow = index.schoolId !== null;
    const rows = [];
    const absences = [];

    for (const { subjectName, domainId, domainName } of listSubjectDomains(index)) {
        const built = buildRow({
            queries,
            metric,
            classEntries,
            hasSchoolRow,
            averages,
            subjectName,
            domainId,
            domainName,
        });
        if (built.row) {
            rows.push(built.row);
        } else {
            absences.push({
                subjectName,
                domainId,
                domainName,
                rowLabel: buildRowLabel(subjectName, domainName),
                reason: built.reason,
            });
        }
    }

    return {
        metric,
        rows: sortRowsBestFirst(rows, metric),
        absences,
        yDomain: resolveSharedYDomain(rows),
        averages: allAverages,
    };
}

/**
 * Every subject×domain the payload describes, flattened and in payload order.
 *
 * Shared by the rows and the absences so the two together always cover exactly the
 * dataset — a card that appears under one metric and vanishes under another would
 * otherwise leave the grid with a hole rather than an explanation.
 * @param {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} index - The indexed payload.
 * @returns {Array<{subjectName: string, domainId: string|null, domainName: string|null}>} One entry per subject×domain, in payload order.
 */
function listSubjectDomains(index) {
    return index.subjectDomains.flatMap(({ subjectName, domains }) =>
        domains.map(({ domainId, domainName }) => ({ subjectName, domainId, domainName })),
    );
}

/**
 * The heading one row is shown under.
 * @param {string} subjectName - Fach name.
 * @param {string|null} domainName - Domäne name, absent for a Fach with no domain split.
 * @returns {string} The label.
 */
function buildRowLabel(subjectName, domainName) {
    return domainName ? `${subjectName}: ${domainName}` : subjectName;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * One subject×domain under one metric: either a row, or the reason there is none.
 *
 * The two failure points are deliberately kept apart. Reaching the second one means
 * the metric *can* be answered here and the classes simply produced no value; reaching
 * the first with classes present means either that the payload has no school row (the
 * query layer resolves the school only against one) or that the metric cannot be
 * answered on this scale at all. Only
 * the caller knows which sentence to print, so each comes back typed rather than
 * collapsed into `null`.
 * @param {object} params - Everything one row is built from.
 * @param {import('./slSchoolSummaryMetricRegistry.js').SummaryQueries} params.queries - The share and rate helpers the metric reads.
 * @param {SummaryMetric} params.metric - The metric being resolved.
 * @param {Array<object>} params.classEntries - The payload's class rows.
 * @param {boolean} params.hasSchoolRow - Whether the payload carries the school's own row.
 * @param {Array<object>} params.averages - The reference averages to plot.
 * @param {string} params.subjectName - Fach this row covers.
 * @param {string|null} params.domainId - Domäne this row covers.
 * @param {string|null} params.domainName - Its display name.
 * @returns {{row: object, reason?: undefined} | {row: null, reason: string}} The row, or `null` plus the ABSENCE reason it could not be built.
 */
function buildRow({
    queries,
    metric,
    classEntries,
    hasSchoolRow,
    averages,
    subjectName,
    domainId,
    domainName,
}) {
    const classColumns = listClassColumns(classEntries, subjectName, domainId);
    const schoolValue = metric.resolve(queries, 'school', subjectName, domainId);

    if (!Number.isFinite(schoolValue)) {
        return {
            row: null,
            reason:
                classColumns.length === 0
                    ? ABSENCE_REASONS.NO_CLASS_DATA
                    : hasSchoolRow
                      ? ABSENCE_REASONS.METRIC_UNSUPPORTED
                      : ABSENCE_REASONS.NO_SCHOOL_ROW,
        };
    }

    // Cast: the `Number.isFinite` guard above already returned for a null school value,
    // but `Number.isFinite` is not a type predicate, so the compiler cannot see it.
    const schoolBaseline = /** @type {number} */ (schoolValue);
    const toEntry = (name, kind, value, label = name) => ({
        name,
        label,
        kind,
        value,
        deltaPP: (value - schoolBaseline) * 100,
    });

    // Averages lead the row: they are the reference the classes are read against.
    const entries = [];
    for (const average of averages) {
        const value = metric.resolve(queries, average.target, subjectName, domainId);
        if (!Number.isFinite(value)) continue;

        entries.push({
            ...toEntry(average.sourceName, 'average', value),
            averageId: average.id,
            sourceId: average.sourceId,
            sourceName: average.sourceName,
            sourceType: average.sourceType,
        });
    }

    const classCountBefore = entries.length;
    for (const { name, label } of classColumns) {
        const value = metric.resolve(queries, name, subjectName, domainId);
        if (!Number.isFinite(value)) continue;

        entries.push(toEntry(name, 'class', value, label));
    }

    // A row of averages with no class behind it says nothing about this school.
    if (entries.length === classCountBefore) {
        return {
            row: null,
            reason:
                classColumns.length === 0
                    ? ABSENCE_REASONS.NO_CLASS_DATA
                    : ABSENCE_REASONS.NO_CLASS_VALUES,
        };
    }

    return {
        row: {
            subjectName,
            domainId,
            domainName,
            rowLabel: buildRowLabel(subjectName, domainName),
            schoolValue,
            entries,
        },
    };
}

/**
 * The class columns of one subject×domain: `name` is the key every query resolves
 * (the test group's own name), `label` is what the column is shown under. Ragged by
 * design — only Mathe has 8d.
 *
 * A test group's name is the school's free-text label for the sitting unit — on live
 * data `8aDeu`, `D-G 8a`, `M-G1` — and the row heading already says the subject. The
 * server names the Stammklasse the sitters come from in a repeatable `homeroom`
 * covariate, so a group drawn from exactly one class is labelled by that class (`8a`).
 * A group drawn from several classes, or from none, keeps its own name: there is no
 * single class to name it after. So does a group whose class label another column in
 * the row already claims — `8a`'s Deutsch G-Kurs and E-Kurs would otherwise read as
 * two identical `8a` columns — and any column whose own name a homeroom label would
 * shadow. The tooltip always carries the group's name, so nothing is lost.
 * Sorted by label so a class's several courses sit next to each other.
 * @param {Array<object>} classEntries - The payload's class rows.
 * @param {string} subjectName - Fach to match.
 * @param {string|null} domainId - Domäne to match.
 * @returns {Array<{name: string, label: string}>} The columns, sorted by label then name.
 */
function listClassColumns(classEntries, subjectName, domainId) {
    const rows = classEntries
        .filter(
            (entry) =>
                entry.subject?.name === subjectName && (entry.domain?.id ?? null) === domainId,
        )
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
                String(a.label).localeCompare(String(b.label)) ||
                String(a.name).localeCompare(String(b.name)),
        );
}

/**
 * The one Stammklasse a class row's students come from, or `null` when the row names
 * none or several.
 * @param {object} entry - A class row.
 * @returns {string|null} The homeroom name.
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
 * Best row first. "Best" follows the metric: on `below_minimum` the *lowest*
 * school value is the strongest result, so the order flips.
 * Ties keep a stable, label-based order rather than input order.
 * @param {Array<object>} rows - The rows to sort.
 * @param {SummaryMetric} metric - Supplies the direction that counts as "best".
 * @returns {Array<object>} The rows, best first.
 */
function sortRowsBestFirst(rows, metric) {
    return [...rows].sort((a, b) => {
        const delta = metric.higherIsBetter
            ? b.schoolValue - a.schoolValue
            : a.schoolValue - b.schoolValue;

        return delta !== 0 ? delta : a.rowLabel.localeCompare(b.rowLabel);
    });
}

/**
 * One symmetric scale for every row, sized to the largest deviation anywhere.
 * Rows must share it — otherwise a 2 pp bar in one subject would look as tall
 * as a 39 pp bar in another.
 * @param {Array<object>} rows - The rows whose deviations the scale must fit.
 * @returns {[number, number]} The symmetric domain, never narrower than the minimum extent.
 */
function resolveSharedYDomain(rows) {
    const maxExtent = rows.reduce(
        (currentMax, row) =>
            row.entries.reduce(
                (rowMax, entry) => Math.max(rowMax, Math.abs(entry.deltaPP)),
                currentMax,
            ),
        0,
    );

    const extent = Math.max(maxExtent, MIN_DEVIATION_EXTENT_PP);
    return [-extent, extent];
}

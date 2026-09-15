/**
 * EN Item Data Adapter — Builds item-level records from JSON data.
 *
 * - buildItemArray: class-level item records for EnItemTableModule, ItemLollipopChart, EnItemDetailModule
 * - buildStudentItemRecords: per-student item records for EnStudentDataTableModule
 * - buildItemComparisonGroups: the comparison groups of items.json, for the item lollipop
 */

import { AGG_TYPE_RESULT } from '../enConstants.js';
import { AGG_TYPE_STYLE } from '@tba3/modules/en-domain';
import {
    assignComparisonOrdinals,
    buildItemMeansMap,
    buildItemResultCounts,
    computePilotierung,
    NO_RESULT_COUNTS,
    RESULT_VALUES,
    resultShare,
    sortItemsWithinExercises,
    toPercent,
} from '@tba3/modules/domain';

/**
 * @typedef {object} ItemComparisonGroup
 * @property {string} id - The value group's own key; also its comparison toggle id
 * @property {string} type - The payload's own type; `resolveAverageRole` maps it to the role it draws as
 * @property {string} name - Display name (`Schulschnitt`, `Landesschnitt GY`, …)
 * @property {number} typeIndex - Position among the groups sharing this role, 0-based
 * @property {string|null} shortLabel - `L1`/`L2`/… when several groups share the role, `null` when one does
 * @property {Map<string, number>} meanMap - iqbId → percentage correct (0–100)
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build an array of enriched item records from items.json.
 *
 * Each record spreads the raw API item and adds only computed/derived fields
 * that don't exist in the API: domain context (from parent group), a shortcut
 * alias for the deeply-nested competence level, count/percentage fields, and
 * the Pilotierungswert benchmark with its difference to the class mean.
 *
 * The three `percentage*` shares all come from the per-item result breakdown, so the
 * progress bar's segments partition the same responses; `meanPercentage` is the
 * item's `mean` from items.json, the statistic the comparison groups carry too.
 * @param {Array} itemsData - items.json (array of group objects with items[])
 * @param {Array|null} studentStyleAggData - students_aggregation.json, the source of
 *   the per-item solver / non-solver name lists.
 * @param {Array|null} itemAggData - items_aggregation.json, the API's per-item
 *   Richtig/Falsch/Unbearbeitet breakdown.
 * @returns {Array<object>} Enriched item records
 */
export function buildItemArray(itemsData, studentStyleAggData, itemAggData) {
    // Per-item result counts, as served by the API
    const resultCounts = buildItemResultCounts(itemAggData);
    // Build per-item solver / non-solver student groups
    const studentGroups = _buildItemStudentGroups(studentStyleAggData);

    const items = [];

    for (const group of itemsData) {
        const domainId = group.domain?.id;
        if (!domainId) continue;
        const domainLabel = group.domain?.name;

        for (const item of sortItemsWithinExercises(group.items)) {
            const stats = item.descriptiveStatistics ?? {};
            const params = item.parameters ?? {};
            const { total, correctCount, incorrectCount, notAttemptedCount } =
                resultCounts.get(item.iqbId) ?? NO_RESULT_COUNTS;
            const mean = stats.mean ?? 0;

            const { pilotierungswert, pilotierungsDiff } = computePilotierung(params, mean);

            // Group arrays are shared across all records built from the same
            // aggregation payload (see _buildItemStudentGroups) — consumers must
            // treat them as read-only.
            const { solvers = [], nonSolvers = [] } = studentGroups.get(item.iqbId) ?? {};

            items.push({
                // Preserve raw API item (iqbId, name, exercise, parameters, descriptiveStatistics)
                ...item,
                // Computed: parent group context (not present on raw item)
                domain: domainId,
                domainLabel,
                // Shortcut: parameters.competenceLevel.nameShort is 4 levels deep
                competenceLevel: params.competenceLevel?.nameShort ?? '',
                style: (params.competences ?? [])
                    .filter((c) => c.type === AGG_TYPE_STYLE && c.name)
                    .map((c) => c.name),
                correctCount,
                incorrectCount,
                notAttemptedCount,
                percentageCorrect: resultShare(correctCount, total),
                percentageIncorrect: resultShare(incorrectCount, total),
                percentageNotAttempted: resultShare(notAttemptedCount, total),
                meanPercentage: toPercent(mean),
                pilotierungswert,
                pilotierungsDiff,
                total,
                solvers,
                nonSolvers,
            });
        }
    }

    return items;
}

/**
 * Every comparison group items.json carries, one entry per group id in payload order,
 * with its per-item means. A group ships one row per domain; those rows merge into one
 * entry. The ordinals follow the same per-role rule as the style groups, so a group
 * reads `L1`/`L2` alike in every EN chart.
 * @param {Array|null|undefined} itemGroups - The comparison rows of items.json.
 * @returns {ItemComparisonGroup[]} The groups, in payload order.
 * @throws {Error} For a row without `id` or `name`, which key and label its series, and
 *   for a group without `type` — a malformed row, unlike an unrecognised type, which
 *   draws with the catch-all mark.
 */
export function buildItemComparisonGroups(itemGroups) {
    /** @type {Map<string, ItemComparisonGroup>} */
    const groupsById = new Map();

    for (const row of itemGroups ?? []) {
        const id = _requireComparisonText(row?.id, 'id', row);
        let group = groupsById.get(id);
        if (!group) {
            group = {
                id,
                type: row.type,
                name: _requireComparisonText(row.name, 'name', row),
                typeIndex: 0,
                shortLabel: null,
                meanMap: new Map(),
            };
            groupsById.set(id, group);
        }
        for (const [iqbId, percentage] of buildItemMeansMap([row])) {
            group.meanMap.set(iqbId, percentage);
        }
    }

    const groups = [...groupsById.values()];
    assignComparisonOrdinals(groups);
    return groups;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Read a required text field off a comparison row, or fail loudly naming what is missing.
 * @param {*} value - The field as it arrived.
 * @param {string} fieldName - Which field is being read, for the message.
 * @param {object} row - The row it came from, named in the message.
 * @returns {string} The value, once it is a non-empty string.
 * @private
 */
function _requireComparisonText(value, fieldName, row) {
    if (typeof value === 'string' && value.trim()) return value;
    throw new Error(
        `EN item comparison group is missing required ${fieldName}: ${row?.id ?? row?.name ?? '(unnamed)'}`,
    );
}

// Class-wide student groups are invariant per studentStyleAggData payload but
// would be rebuilt on every buildStudentItemRecords call (once per student
// selection) — cache by aggregation-data reference so repeated calls in the same
// class session reuse the same computed Map instead of rescanning every student.
const _studentGroupsCache = new WeakMap();

/**
 * Build a Map<iqbId, {solvers, nonSolvers}> of the class's per-item student
 * groups, by aggregating the Ergebnis aggregations' includedIqbIds across all
 * students.
 *
 * `solvers` holds the students coded "Richtig". `nonSolvers` merges "Falsch" and
 * "Unbearbeitet" into one list and flags the latter with `attempted: false`, so
 * the detail panel can show a single non-solver list while still marking who
 * never attempted the item. Each aggregation is filed by its `value`: the spec fixes
 * no order of `aggregations[]`.
 *
 * Membership stays client-derived on purpose: the inverted form would duplicate in
 * the payload information `students_aggregation.json` already carries, to save one
 * cached pass. Only the *counts* come from the API — see
 * {@link buildItemResultCounts}.
 *
 * No domain filtering is needed: iqbIds are unique across domains (see
 * buildStudentItemRecords, which relies on the same assumption).
 * @param {Array|null} studentStyleAggData - student style aggregation data
 * @returns {Map<string, {solvers: Array<object>, nonSolvers: Array<object>}>} Per iqbId, the students coded `Richtig` and those coded anything else.
 * @private
 */
function _buildItemStudentGroups(studentStyleAggData) {
    if (!studentStyleAggData) return new Map();

    const cached = _studentGroupsCache.get(studentStyleAggData);
    if (cached) return cached;

    /** @type {Map<string, {solvers: Array<object>, nonSolvers: Array<object>}>} */
    const groups = new Map();
    const groupFor = (iqbId) => {
        let group = groups.get(iqbId);
        if (!group) {
            group = { solvers: [], nonSolvers: [] };
            groups.set(iqbId, group);
        }
        return group;
    };

    for (const entry of studentStyleAggData) {
        const student = _studentIdentity(entry);
        for (const agg of entry.aggregations ?? []) {
            const code = RESULT_VALUES[agg.value];
            if (agg.type !== AGG_TYPE_RESULT || code === undefined) continue;
            for (const iqbId of agg.includedIqbIds ?? []) {
                _fileStudent(groupFor(iqbId), student, code);
            }
        }
    }

    _studentGroupsCache.set(studentStyleAggData, groups);
    return groups;
}

/**
 * File one student into an item's groups by result code. The `attempted` flag is
 * decided here, in one place, so consumers only ever see "solver" vs "non-solver".
 * @param {{solvers: Array<object>, nonSolvers: Array<object>}} group - The item's groups.
 * @param {{studentId: string, firstName: string, lastName: string}} student - Who to file.
 * @param {number} code - `RESULT_VALUES` code of the student's result on the item.
 * @private
 */
function _fileStudent(group, student, code) {
    switch (code) {
        case 1:
            group.solvers.push(student);
            break;
        case 0:
            group.nonSolvers.push({ ...student, attempted: true });
            break;
        case -1:
            group.nonSolvers.push({ ...student, attempted: false });
            break;
        default:
            break;
    }
}

/**
 * Extract the display identity of a student from an aggregation entry.
 * @param {object} entry - student style aggregation entry
 * @returns {{studentId: string, firstName: string, lastName: string}} The identity the item-detail lists render.
 * @private
 */
function _studentIdentity(entry) {
    const props = entry.properties ?? [];
    return {
        studentId: entry.id,
        firstName: props.find((p) => p.key === 'firstName')?.value ?? '',
        lastName: props.find((p) => p.key === 'lastName')?.value ?? '',
    };
}

/**
 * Build per-student per-item result records from JSON data.
 *
 * Derives item results from the includedIqbIds in Ergebnis aggregations
 * of students_aggregation.json, each read by its `value`.
 *
 * Output records include `studentId` (required by base class
 * _prepareStudentRows which filters rows by student ID).
 * @param {Array} itemsData - items.json
 * @param {Array} studentStyleAggData - students_aggregation.json
 * @param {Array|null} itemAggData - items_aggregation.json
 * @param {string} studentId - Student id
 * @returns {Array<object>} Per-item records for the given student
 */
export function buildStudentItemRecords(itemsData, studentStyleAggData, itemAggData, studentId) {
    // Class-level counts, from the same API payload buildItemArray reads — the
    // Student view shows them next to the student's own result.
    const resultCounts = buildItemResultCounts(itemAggData);
    // Build per-item solver / non-solver groups (class-wide, not scoped to studentId)
    const studentGroups = _buildItemStudentGroups(studentStyleAggData);

    // This student's result code per item, read by value: the spec fixes no order of
    // `aggregations[]`, so the n-th Ergebnis entry means nothing.
    /** @type {Map<string, number>} */
    const resultCodeByIqbId = new Map();
    for (const entry of studentStyleAggData) {
        if (entry.id !== studentId) continue;

        for (const agg of entry.aggregations ?? []) {
            const code = RESULT_VALUES[agg.value];
            if (agg.type !== AGG_TYPE_RESULT || code === undefined) continue;
            for (const iqbId of agg.includedIqbIds ?? []) {
                resultCodeByIqbId.set(iqbId, code);
            }
        }
    }

    const records = [];

    for (const group of itemsData) {
        const domainKey = group.domain?.id;
        if (!domainKey) continue;
        const domainLabel = group.domain?.name;

        for (const item of sortItemsWithinExercises(group.items)) {
            const iqbId = item.iqbId;

            const ergebnis = resultCodeByIqbId.get(iqbId);
            if (ergebnis === undefined) continue; // in no bucket → student not tested

            const { solvers = [], nonSolvers = [] } = studentGroups.get(iqbId) ?? {};
            const { total, correctCount, incorrectCount, notAttemptedCount } =
                resultCounts.get(iqbId) ?? NO_RESULT_COUNTS;

            records.push({
                studentId,
                iqbId,
                name: item.name,
                exercise: item.exercise ?? { name: '' },
                domain: domainKey,
                domainLabel,
                ergebnis,
                competenceLevel: item.parameters?.competenceLevel?.nameShort ?? '',
                correctCount,
                incorrectCount,
                notAttemptedCount,
                total,
                solvers,
                nonSolvers,
            });
        }
    }

    return records;
}

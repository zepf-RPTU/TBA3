/**
 * The data half of the Materialien pages: reads the SL data port and answers one plain
 * context object per Fach — metrics per class and for the school, the Kompetenzstufen
 * distributions, the state deltas and the best class per Kennzahl. It formats nothing;
 * the wording and the HTML live in `materialContentResolver.js`.
 */

import { getCompetencyColor } from '../../../common/services/themeService.js';
import { resolveScaleId } from '../../../common/services/competenceLevelPalette.js';
import { emptySlData } from '../../slData.js';
import { CompetenceShareQueries } from '../../utils/slCompetenceShares.js';
import { SolutionRateQueries } from '../../utils/slSolutionRates.js';
import { resolveCompetenceLevelRankAlias } from '../../utils/slCompetenceLevels.js';
import { normalizeDataSubjectName } from '../../utils/slSubjectConfig.js';
import { EPSILON, buildRange, isFiniteNumber } from './materialFormat.js';

/**
 * Normalise a gender code to the lower-case token the counts key off.
 * @param {any} value - The code as the payload delivers it.
 * @returns {string|null} The token, or `null` when the entry carries none.
 */
function normalizeGender(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmedValue = value.trim().toLowerCase();
    return trimmedValue || null;
}

/**
 * The class an entry belongs to, read from its covariates.
 * @param {any} [covariates] - The entry's covariates.
 * @returns {string|null} The class name, or `null` when no group covariate is present.
 */
function extractClassName(covariates = []) {
    return Array.isArray(covariates)
        ? (covariates.find((covariate) => covariate?.type === 'group')?.value ?? null)
        : null;
}

/**
 * Build a pre-indexed lookup of material student stats from raw
 * `students_competence-levels.json` rows.
 *
 * Deduplicates students with the same `${className}|${id}` identity as the
 * context did when scanning per class, and preserves subject and gender
 * normalization. Returned structure is private to this helper; use
 * {@link readMaterialStudentStats} to read counts/shares from it.
 * @param {Array<object>} studentsData Raw student rows
 * @returns {Map<string, Map<string, Map<string, string|null>>>}
 *          normalizedSubject -> className -> studentKey -> normalized gender
 */
export function buildMaterialStudentStatsIndex(studentsData = []) {
    const bySubject = new Map();

    (Array.isArray(studentsData) ? studentsData : []).forEach((entry) => {
        const normalizedSubjectName = normalizeDataSubjectName(entry?.subject?.name);
        if (!normalizedSubjectName) {
            return;
        }

        const entryClassName = extractClassName(entry?.covariates);
        if (!entryClassName) {
            return;
        }

        let classesForSubject = bySubject.get(normalizedSubjectName);
        if (!classesForSubject) {
            classesForSubject = new Map();
            bySubject.set(normalizedSubjectName, classesForSubject);
        }

        let studentsForClass = classesForSubject.get(entryClassName);
        if (!studentsForClass) {
            studentsForClass = new Map();
            classesForSubject.set(entryClassName, studentsForClass);
        }

        const studentKey = `${entryClassName}|${entry.id}`;
        if (studentsForClass.has(studentKey)) {
            return;
        }

        const gender = normalizeGender(
            Array.isArray(entry?.covariates)
                ? entry.covariates.find((covariate) => covariate?.type === 'gender')?.value
                : null,
        );

        studentsForClass.set(studentKey, gender);
    });

    return bySubject;
}

/**
 * Read `{ count, femaleShare }` for a `(subjectName, className)` pair, or for
 * `(subjectName, null)` to aggregate all classes of the subject (school level).
 * @param {Map<any, Map<string, Map<string, string|null>>>} index - The index from `buildMaterialStudentStatsIndex`. The outer key is a canonical subject name; it is typed `any` because an unnormalisable subject looks it up as `null`, which simply misses.
 * @param {string}      subjectName - Fach to read.
 * @param {string|null} className - Class to read, or `null` to aggregate the Fach's classes.
 * @returns {{ count: number, femaleShare: number|null }} The headcount and the female share among the students whose gender the payload states; the share stays `null` when no student carries one rather than reading as zero.
 */
export function readMaterialStudentStats(index, subjectName, className = null) {
    const fallback = { count: 0, femaleShare: null };
    const normalizedSubjectName = normalizeDataSubjectName(subjectName);
    const classesForSubject = index?.get?.(normalizedSubjectName);
    if (!classesForSubject) {
        return fallback;
    }

    let count = 0;
    let genderKnownCount = 0;
    let femaleCount = 0;

    const accumulate = (studentsForClass) => {
        for (const gender of studentsForClass.values()) {
            count += 1;
            // A student without a gender covariate is neither female nor not female.
            if (gender === null) continue;
            genderKnownCount += 1;
            if (gender === 'female') {
                femaleCount += 1;
            }
        }
    };

    if (className) {
        const studentsForClass = classesForSubject.get(className);
        if (!studentsForClass) {
            return fallback;
        }
        accumulate(studentsForClass);
    } else {
        for (const studentsForClass of classesForSubject.values()) {
            accumulate(studentsForClass);
        }
    }

    return {
        count,
        femaleShare: genderKnownCount > 0 ? femaleCount / genderKnownCount : null,
    };
}

/**
 * The competence-level bars one row draws, with their share and colour.
 * @param {any} row - A payload row.
 * @returns {Array<object>} One entry per band, empty when the row carries no levels.
 */
export function buildDistributionLevels(row) {
    if (!Array.isArray(row?.competenceLevels)) {
        return [];
    }

    // The row's own ladder: the material page can show a Fach whose level names another
    // Fach on the page shares, so a bare name would resolve to the wrong ramp.
    const scaleId = resolveScaleId(row.competenceLevels.map((level) => level?.nameShort));

    return row.competenceLevels.map((level) => {
        const total = Number(level?.descriptiveStatistics?.total);
        const mean = Number(level?.descriptiveStatistics?.mean);
        const frequency = Number(level?.descriptiveStatistics?.frequency);
        const share = Number.isFinite(mean)
            ? mean
            : Number.isFinite(total) && total > 0 && Number.isFinite(frequency)
              ? frequency / total
              : null;

        return {
            label: level?.nameShort ?? '',
            share,
            scaleId,
            color: getCompetencyColor(level?.nameShort ?? '', scaleId),
        };
    });
}

/**
 * Map a Domäne id to a map key, giving a domainless Fach a key of its own so it can sit
 * in the same map as domain-split ones.
 * @param {any} domainId - The Domäne id, or nothing.
 * @returns {string} The key.
 */
function normalizeDomainKey(domainId) {
    return domainId == null ? '__single__' : String(domainId);
}

/**
 * Reverse of `normalizeDomainKey`.
 * @param {string} domainKey - The map key.
 * @returns {string|null} The Domäne id, or `null` for a domainless Fach.
 */
function denormalizeDomainKey(domainKey) {
    return domainKey === '__single__' ? null : domainKey;
}

/**
 * The classes holding the best value of one metric — a set, not a single class, because
 * a tie must not silently name only one of them.
 * @param {Array<object>} rows - One row per class.
 * @param {string} metricKey - The metric to compare.
 * @returns {Set<string>} The class names at the maximum; empty when no row carries the metric.
 */
export function buildBestClassSet(rows, metricKey) {
    const numericValues = rows.map((row) => row?.[metricKey]).filter(isFiniteNumber);

    if (numericValues.length === 0) {
        return new Set();
    }

    const maxValue = Math.max(...numericValues);
    return new Set(
        rows
            .filter(
                (row) =>
                    isFiniteNumber(row?.[metricKey]) &&
                    Math.abs(row[metricKey] - maxValue) <= EPSILON,
            )
            .map((row) => row.className),
    );
}

export class MaterialSubjectContext {
    #slData;
    #queryHelper;
    #solutionRates;
    /** @type {ReturnType<typeof buildMaterialStudentStatsIndex>|null} */
    #materialStudentStatsIndex = null;
    /** @type {Array<object>|null} The student rows the index above was built from. */
    #materialStudentStatsRows = null;

    /**
     * @param {object} [options] - Where the data comes from.
     * @param {import('../../slData.js').SlData} [options.slData] - The SL data port; without one every section answers empty.
     */
    constructor({ slData } = /** @type {any} */ ({})) {
        this.#slData = slData ?? emptySlData();
        this.#queryHelper = new CompetenceShareQueries({
            moduleId: 'sl-material-content',
            slData: this.#slData,
        });
        this.#solutionRates = new SolutionRateQueries({
            moduleId: 'sl-material-content',
            slData: this.#slData,
        });
    }

    /**
     * Everything one Materialien page reads about a Fach, in one object.
     * @param {string} subjectName - The canonical Fach name.
     * @returns {object} The context the render methods read.
     */
    buildSubjectContext(subjectName) {
        const classMetrics = this.#getSubjectClassNames(subjectName)
            .map((className) => this.#buildSubjectMetrics({ subjectName, className }))
            .filter((metrics) => Number.isFinite(metrics.studentCount) && metrics.studentCount > 0);
        const schoolMetrics = this.#buildSubjectMetrics({ subjectName, className: null });
        const regularStandardLevels = resolveCompetenceLevelRankAlias('ge_3') ?? [];
        const stateSolutionRate = this.#solutionRates.getSubjectSolutionRate({
            target: 'state',
            subjectName,
        });
        const stateRegularStandardShare = this.#queryHelper.getSubjectCompetenceShare({
            target: 'state',
            subjectName,
            levelNames: regularStandardLevels,
        });

        return {
            subjectName,
            classStage: this.#deriveClassStage(classMetrics.map((metrics) => metrics.className)),
            schoolMetrics,
            classMetrics,
            // Asked of the dataset, not of this subject: a subject that happens to carry
            // no value while the scale exists should still show its column with an
            // em-dash. Only a dataset with no questionnaire at all drops the column.
            ...this.#getSurveyScales(),
            ranges: {
                solutionRate: buildRange(classMetrics.map((metrics) => metrics.solutionRate)),
                regularStandardShare: buildRange(
                    classMetrics.map((metrics) => metrics.regularStandardShare),
                ),
                teachingQualityMean: buildRange(
                    classMetrics.map((metrics) => metrics.teachingQualityMean),
                ),
                selfEfficacyMean: buildRange(
                    classMetrics.map((metrics) => metrics.selfEfficacyMean),
                ),
            },
            distributionGroups: this.#getSubjectDistributionGroups(subjectName),
            solutionRateDelta:
                isFiniteNumber(schoolMetrics.solutionRate) && isFiniteNumber(stateSolutionRate)
                    ? schoolMetrics.solutionRate - stateSolutionRate
                    : null,
            regularStandardDelta:
                isFiniteNumber(schoolMetrics.regularStandardShare) &&
                isFiniteNumber(stateRegularStandardShare)
                    ? schoolMetrics.regularStandardShare - stateRegularStandardShare
                    : null,
            bestClasses: {
                solutionRate: buildBestClassSet(classMetrics, 'solutionRate'),
                regularStandardShare: buildBestClassSet(classMetrics, 'regularStandardShare'),
                teachingQualityMean: buildBestClassSet(classMetrics, 'teachingQualityMean'),
                selfEfficacyMean: buildBestClassSet(classMetrics, 'selfEfficacyMean'),
            },
        };
    }

    #buildSubjectMetrics({ subjectName, className = null } = /** @type {any} */ ({})) {
        const target = className ?? 'school';
        const studentStats = this.#getStudentStats({ subjectName, className });
        const regularStandardLevels = resolveCompetenceLevelRankAlias('ge_3') ?? [];

        return {
            className,
            studentCount: studentStats.count,
            femaleShare: studentStats.femaleShare,
            solutionRate: this.#solutionRates.getSubjectSolutionRate({ target, subjectName }),
            regularStandardShare: this.#queryHelper.getSubjectCompetenceShare({
                target,
                subjectName,
                levelNames: regularStandardLevels,
            }),
            teachingQualityMean: this.#getTeachingQualityMean({ subjectName, className }),
            selfEfficacyMean: this.#getSelfEfficacyMean({ className }),
        };
    }

    #getStudentStats({ subjectName, className = null } = /** @type {any} */ ({})) {
        return readMaterialStudentStats(
            this.#getMaterialStudentStatsIndex(),
            subjectName,
            className,
        );
    }

    #getMaterialStudentStatsIndex() {
        // Built once per set of student rows: keyed on the rows' identity, so a port that
        // answers with new rows gets a fresh index and one that answers the same rows does not.
        const rows = this.#getStudentsData();
        let index = this.#materialStudentStatsIndex;
        if (!index || this.#materialStudentStatsRows !== rows) {
            index = buildMaterialStudentStatsIndex(rows);
            this.#materialStudentStatsIndex = index;
            this.#materialStudentStatsRows = rows;
        }

        return index;
    }

    #getSubjectClassNames(subjectName) {
        const index = this.#slData.competenceLevelIndex();
        if (!index.schoolId) {
            return [];
        }

        return [
            ...new Set(
                index.classRows
                    .filter(
                        (entry) => normalizeDataSubjectName(entry?.subject?.name) === subjectName,
                    )
                    .map((entry) => entry?.name)
                    .filter(Boolean),
            ),
        ].sort((left, right) => left.localeCompare(right));
    }

    #getSubjectDistributionGroups(subjectName) {
        const index = this.#slData.competenceLevelIndex();
        if (!index.schoolId) {
            return [];
        }

        const schoolRows = index.schoolRows.filter(
            (entry) => normalizeDataSubjectName(entry?.subject?.name) === subjectName,
        );
        const stateRows = index.stateRows.filter(
            (entry) => normalizeDataSubjectName(entry?.subject?.name) === subjectName,
        );

        const orderedDomainKeys = [
            ...new Set([
                ...schoolRows.map((entry) => normalizeDomainKey(entry?.domain?.id)),
                ...stateRows.map((entry) => normalizeDomainKey(entry?.domain?.id)),
            ]),
        ];

        return orderedDomainKeys
            .map((domainKey) => {
                const normalizedDomainId = denormalizeDomainKey(domainKey);
                const schoolRow =
                    schoolRows.find(
                        (entry) => (entry?.domain?.id ?? null) === normalizedDomainId,
                    ) ?? null;
                const stateRow =
                    stateRows.find((entry) => (entry?.domain?.id ?? null) === normalizedDomainId) ??
                    null;
                const domainName = schoolRow?.domain?.name ?? stateRow?.domain?.name ?? null;

                return {
                    domainId: normalizedDomainId,
                    domainName,
                    schoolDistribution: schoolRow
                        ? { levels: buildDistributionLevels(schoolRow) }
                        : null,
                    stateDistribution: stateRow
                        ? { levels: buildDistributionLevels(stateRow) }
                        : null,
                };
            })
            .filter((group) => group.schoolDistribution || group.stateDistribution);
    }

    #getTeachingQualityMean({ subjectName, className = null } = /** @type {any} */ ({})) {
        const normalizedSubjectName = normalizeDataSubjectName(subjectName);
        const expectedClassName = className ?? 'Schule';

        const teachingQualityRows = this.#slData.teachingQuality();

        const match = teachingQualityRows.find(
            (row) =>
                row?.className === expectedClassName &&
                normalizeDataSubjectName(row?.subjectName) === normalizedSubjectName,
        );

        return match?.statistics?.mean ?? null;
    }

    #getSelfEfficacyMean({ className = null } = /** @type {any} */ ({})) {
        const schoolSummary = this.#slData.selfEfficacySchool();

        if (!className) {
            return schoolSummary?.statistics?.mean ?? null;
        }

        const classSummaries = this.#slData.selfEfficacyByClass();
        const match = classSummaries.find((summary) => summary?.className === className);

        return match?.statistics?.mean ?? null;
    }

    #deriveClassStage(classNames = []) {
        const stages = [
            ...new Set(
                classNames
                    .map((className) => className?.match(/^\d+/)?.[0] ?? null)
                    .filter(Boolean),
            ),
        ];

        return stages.length === 1 ? stages[0] : null;
    }

    #getStudentsData() {
        return this.#slData.studentsCompetenceLevels();
    }

    #getSurveyScales() {
        return this.#slData.surveyScales();
    }
}

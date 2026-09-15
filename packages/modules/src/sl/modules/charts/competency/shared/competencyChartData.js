/**
 * Pure data preparation for the SL Kompetenzstufen charts.
 *
 * Shapes the raw competence-level payload into the entries the overview and
 * detail renderers plot, builds their tooltip rows, and derives the level list.
 * No D3, no DOM — testable in the node environment.
 */

import { sortCompetencyLevels } from '../../../../../common/charts/chartUtils.js';
import { getChartDomainAbbreviation } from '../../../../../common/charts/domainLabelFormatter.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import { getCompetencyColor } from '../../../../../common/services/themeService.js';
import { parseCompetenceLevels } from '../../../../../common/charts/competenceLevelAdapter.js';
import { TYPE_ORDER } from './competencyChartConstants.js';
import { glossaryAnnotator } from '../../../../../common/glossary/glossaryAnnotator.js';

/**
 * Sort comparator: type order (class→school→LS), then alphabetical name.
 * Used by: detailRenderer only
 * @param {{type: string, name: string, domain?: string}} a - First entry.
 * @param {{type: string, name: string, domain?: string}} b - Second entry.
 * @returns {number} Negative, zero or positive in the usual comparator sense.
 */
function sortByTypeAndName(a, b) {
    if (TYPE_ORDER[a.type] !== TYPE_ORDER[b.type]) {
        return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    }
    if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
    }
    return (a.domain || '').localeCompare(b.domain || '');
}

const reportedMissingLandesschnitt = new Set();

/**
 * Warn once per Fach/Domäne that no Landesschnitt distribution was delivered, so the
 * omitted comparison is visible in the console without one warning per re-render.
 * @param {string|null} subject - The Fach with the gap.
 * @param {string|null} domain - The Domäne with the gap.
 */
function warnMissingLandesschnitt(subject, domain) {
    const key = `${subject ?? '(unknown subject)'}|${domain ?? '(no domain)'}`;
    if (reportedMissingLandesschnitt.has(key)) return;
    reportedMissingLandesschnitt.add(key);
    console.warn(
        `[CompetencyChart] Missing Landesschnitt distribution for ${key}; comparison omitted.`,
    );
}

/**
 * Bring one Landesschnitt reference into the shape the chart draws from.
 * @param {any} result - A reference entry as the payload delivers it.
 * @returns {object|null} The normalised reference, or `null` when the entry is not usable.
 */
function normalizeLandesschnittReference(result) {
    if (!result || typeof result !== 'object') return null;
    const distribution =
        result.distribution && typeof result.distribution === 'object'
            ? result.distribution
            : result;
    if (!distribution || Object.keys(distribution).length === 0) return null;

    const sourceEntry = result.entry ?? null;
    return {
        distribution: { ...distribution },
        counts: result.counts ?? null,
        sourceId: result.sourceId ?? sourceEntry?.id ?? 'state',
        sourceType: result.sourceType ?? sourceEntry?.type ?? 'state',
        sourceName: result.sourceName ?? sourceEntry?.name ?? null,
        totalStudents: result.totalStudents ?? null,
    };
}

/**
 * Normalise however many Landesschnitt references the payload delivered — a state that
 * splits its average by track ships several, and all of them are drawn.
 * @param {any} result - One reference or a list of them.
 * @returns {Array<object>} The usable references, in payload order.
 */
function normalizeLandesschnittReferences(result) {
    const rawReferences = Array.isArray(result) ? result : [result];
    return rawReferences
        .map((reference) => normalizeLandesschnittReference(reference))
        .filter(Boolean);
}

/**
 * Creates a normalized chart data entry with standard fields.
 * Used by: detailRenderer only
 * @param {object} entryInput - The row's identity, its Fach/Domäne, and the figures it draws.
 * @param {string} entryInput.name - Display name of the row (class, school or Landesschnitt).
 * @param {string} entryInput.type - What the row stands for: `class`, `school` or `landesschnitt`.
 * @param {string|null} [entryInput.classId] - The class's id, for a class row.
 * @param {string|null} [entryInput.sourceId] - Id of the comparison population the row came from.
 * @param {string|null} [entryInput.sourceName] - Its name, as the payload gave it.
 * @param {string|null} [entryInput.sourceType] - Its own type, kept unresolved so an unrecognised population still draws.
 * @param {string} [entryInput.renderType] - Type the renderer styles by; defaults to `type`.
 * @param {string} [entryInput.renderKey] - Key the renderer groups by; defaults to `type`.
 * @param {string} [entryInput.subject] - Fach id.
 * @param {string} [entryInput.subjectLabel] - Fach display name.
 * @param {string} [entryInput.domain] - Domäne id.
 * @param {string} [entryInput.domainLabel] - Domäne display name.
 * @param {string} [entryInput.displayDomainLabel] - Abbreviated Domäne name for tight axes.
 * @param {any} [entryInput.competencyLevels] - The scale's bands, in scale order.
 * @param {string|undefined} [entryInput.scaleId] - The registered ladder those bands sit on, so a name another Fach shares resolves on this one.
 * @param {any} [entryInput.distribution] - Share per band.
 * @param {{[level: string]: number}|null} [entryInput.counts] - Headcount per band as the payload delivered it; `null` where none was delivered, so the tooltip shows no count rather than an estimate.
 * @param {number|null} [entryInput.totalStudents] - Headcount the shares are of.
 * @param {any} [entryInput.teachingQuality] - Unterrichtsqualität statistics for this row, when the payload carries them.
 * @param {number|null} [entryInput.subjectDomainCount] - How many Domänen this Fach has, which decides how the group is labelled.
 * @returns {object} The normalised chart row.
 */
function createChartDataEntry({
    name,
    type,
    classId = null,
    sourceId = null,
    sourceName = null,
    sourceType = null,
    renderType = type,
    renderKey = type,
    subject,
    subjectLabel,
    domain,
    domainLabel,
    displayDomainLabel = '',
    competencyLevels,
    scaleId,
    distribution,
    counts = null,
    totalStudents,
    teachingQuality = null,
    subjectDomainCount = null,
}) {
    const entry = {
        name,
        type,
        renderType,
        renderKey,
        classId,
        sourceId: sourceId ?? classId,
        sourceName: sourceName ?? name,
        sourceType: sourceType ?? type,
        subject,
        domain,
        competencyLevels,
        scaleId,
        distribution,
        counts,
        totalStudents,
    };
    const normalizedDomainLabel = domainLabel || '';
    const resolvedSubjectDomainCount = subjectDomainCount ?? null;

    if (subjectLabel) entry.subjectLabel = subjectLabel;
    entry.domainLabel = normalizedDomainLabel;
    entry.displayDomainLabel =
        displayDomainLabel ||
        (normalizedDomainLabel &&
        resolvedSubjectDomainCount !== null &&
        resolvedSubjectDomainCount > 1
            ? getChartDomainAbbreviation(normalizedDomainLabel)
            : normalizedDomainLabel);
    if (teachingQuality) entry.teachingQuality = teachingQuality;
    if (resolvedSubjectDomainCount !== null) entry.subjectDomainCount = resolvedSubjectDomainCount;

    return entry;
}

/**
 * The school-wide distribution, summed from its classes rather than read from a school
 * row — the payload does not always ship one, and summing keeps the shares consistent
 * with the class bars beside them.
 * @param {{groups: Array<{counts: object, total: number}>}} parsed - The parsed class groups.
 * @param {string[]} levels - The scale's bands, in scale order.
 * @returns {{totalStudentsSchool: number, schoolDistribution: object, schoolCounts: object}} The headcount, the share per band in percent, and the summed count per band.
 */
function buildSchoolDistribution(parsed, levels) {
    const totalStudentsSchool = parsed.groups.reduce((sum, group) => sum + group.total, 0);
    const schoolDistribution = {};
    const schoolCounts = {};

    for (const level of levels) {
        const totalCount = parsed.groups.reduce(
            (sum, group) => sum + (group.counts[level] || 0),
            0,
        );
        schoolCounts[level] = totalCount;
        schoolDistribution[level] =
            totalStudentsSchool > 0 ? (totalCount / totalStudentsSchool) * 100 : 0;
    }

    return {
        totalStudentsSchool,
        schoolDistribution,
        schoolCounts,
    };
}

/**
 * The Landesschnitt references to draw for one Fach/Domäne, warning once when the
 * payload delivers none rather than silently omitting the comparison.
 * @param {object} query - What is being looked up, and how.
 * @param {Function} query.lookupLandesschnittDistribution - Resolves the references for a Fach/Domäne pair.
 * @param {string|null} query.subject - Fach id.
 * @param {string|null} query.domain - Domäne id.
 * @returns {Array<object>} The references, empty when none were delivered.
 */
function resolveLandesschnittReferences({ lookupLandesschnittDistribution, subject, domain }) {
    if (typeof lookupLandesschnittDistribution === 'function') {
        const persistedReferences = normalizeLandesschnittReferences(
            lookupLandesschnittDistribution({
                subject,
                domain,
            }),
        );

        if (persistedReferences.length > 0) {
            return persistedReferences;
        }
    }

    warnMissingLandesschnitt(subject, domain);
    return [];
}

/**
 * Append one chart row per delivered Landesschnitt reference — a state that splits its
 * average by track ships several, and each becomes its own row.
 * @param {Array<object>} chartData - The rows built so far; appended to in place.
 * @param {object} context - The references plus the Fach/Domäne identity the rows inherit.
 * @param {Array<object>} context.references - The normalised references.
 * @param {string} context.subject - Fach id.
 * @param {string} context.subjectLabel - Fach display name.
 * @param {string} context.domain - Domäne id.
 * @param {string} context.domainLabel - Domäne display name.
 * @param {string[]} context.levels - The scale's bands, in scale order.
 * @param {string|undefined} context.scaleId - The registered ladder those bands sit on.
 * @param {number|null} context.subjectDomainCount - How many Domänen this Fach has.
 */
function appendLandesschnittEntries(
    chartData,
    { references, subject, subjectLabel, domain, domainLabel, levels, scaleId, subjectDomainCount },
) {
    for (const landesschnitt of references) {
        chartData.push(
            createChartDataEntry({
                name: landesschnitt.sourceName,
                type: 'landesschnitt',
                renderType: 'landesschnitt',
                renderKey: `state:${landesschnitt.sourceId}`,
                sourceId: landesschnitt.sourceId,
                sourceName: landesschnitt.sourceName,
                sourceType: landesschnitt.sourceType,
                subject,
                subjectLabel,
                domain,
                domainLabel,
                competencyLevels: levels,
                scaleId,
                distribution: landesschnitt.distribution,
                // The state's own headcount or none; never the school's.
                counts: landesschnitt.counts,
                totalStudents: landesschnitt.totalStudents,
                subjectDomainCount,
            }),
        );
    }
}

/**
 * Build the detail rows for a single Domäne: one per class, plus the school row and
 * whatever Landesschnitte the payload delivered.
 * @param {Array<object>} chartInput - The domain's class entries.
 * @param {object} options - The lookups and display flags the rows are built with.
 * @returns {Array<object>} The rows, sorted class → school → Landesschnitt.
 */
function prepareSingleDomainDetailChartData(chartInput, options) {
    const { lookupTeachingQuality, lookupLandesschnittDistribution } = options;
    const chartData = [];

    const first = chartInput[0];
    const subject = first.subject?.name;
    const domain = first.domain?.id;
    const domainLabel = first.domain?.name || domain;
    const subjectLabel = first.subject?.name;
    const subjectDomainCount = 1;

    const parsed = parseCompetenceLevels(chartInput);
    const { levels, scaleId } = parsed;

    parsed.groups.forEach((group) => {
        chartData.push(
            createChartDataEntry({
                name: group.name,
                type: 'class',
                classId: group.id,
                subject,
                subjectLabel,
                domain,
                domainLabel,
                competencyLevels: levels,
                scaleId,
                distribution: group.percentages,
                counts: group.counts,
                totalStudents: group.total,
                teachingQuality: lookupTeachingQuality(group.name, subject),
                subjectDomainCount,
            }),
        );
    });

    const { totalStudentsSchool, schoolDistribution, schoolCounts } = buildSchoolDistribution(
        parsed,
        levels,
    );

    chartData.push(
        createChartDataEntry({
            name: 'Schulschnitt',
            type: 'school',
            subject,
            subjectLabel,
            domain,
            domainLabel,
            competencyLevels: levels,
            scaleId,
            distribution: schoolDistribution,
            counts: schoolCounts,
            totalStudents: totalStudentsSchool,
            teachingQuality: lookupTeachingQuality('Schule', subject),
            subjectDomainCount,
        }),
    );

    appendLandesschnittEntries(chartData, {
        references: resolveLandesschnittReferences({
            lookupLandesschnittDistribution,
            subject,
            domain,
        }),
        subject,
        subjectLabel,
        domain,
        domainLabel,
        levels,
        scaleId,
        subjectDomainCount,
    });

    return chartData.sort(sortByTypeAndName);
}

/**
 * Build the detail rows across several Domänen, so one chart can hold a Fach's Domänen
 * side by side.
 * @param {Array<Array<object>>} chartInput - One class-entry array per Domäne.
 * @param {object} options - The lookups and display flags the rows are built with.
 * @returns {Array<object>} The rows, sorted class → school → Landesschnitt.
 */
function prepareMultiDomainDetailChartData(chartInput, options) {
    const {
        className,
        showOnlySchoolData,
        lookupTeachingQuality,
        lookupLandesschnittDistribution,
    } = options;
    const chartData = [];

    const subjectDomainCounts = {};
    chartInput.forEach((domainGroup) => {
        const subject = domainGroup[0]?.subject?.name;
        const domain = domainGroup[0]?.domain?.id ?? null;
        if (!subject) {
            return;
        }

        if (!subjectDomainCounts[subject]) {
            subjectDomainCounts[subject] = new Set();
        }
        subjectDomainCounts[subject].add(domain);
    });

    if (!showOnlySchoolData) {
        const classNames = new Set();
        chartInput.forEach((domainGroup) => {
            domainGroup.forEach((entry) => {
                if (entry.name) {
                    classNames.add(entry.name);
                }
            });
        });

        const sortedClassNames = className ? [className] : Array.from(classNames).sort();
        const tqAttached = new Set();

        sortedClassNames.forEach((classLabel) => {
            chartInput.forEach((domainGroup) => {
                const first = domainGroup[0];
                const subject = first.subject?.name;
                const domain = first.domain?.id;
                const domainLabel = first.domain?.name || domain;
                const subjectLabel = first.subject?.name;
                const subjectDomainCount = subjectDomainCounts[subject]?.size || 1;

                const classEntry = domainGroup.find((entry) => entry.name === classLabel);
                if (!classEntry) {
                    return;
                }

                const parsed = parseCompetenceLevels([classEntry]);
                if (!parsed.levels.length) {
                    return;
                }

                const tqKey = `${classLabel}|${subject}`;
                const teachingQuality = !tqAttached.has(tqKey)
                    ? lookupTeachingQuality(classLabel, subject)
                    : null;
                if (teachingQuality) {
                    tqAttached.add(tqKey);
                }

                chartData.push(
                    createChartDataEntry({
                        name: classLabel,
                        type: 'class',
                        classId: classEntry.id,
                        subject,
                        subjectLabel,
                        domain,
                        domainLabel,
                        competencyLevels: parsed.levels,
                        scaleId: parsed.scaleId,
                        distribution: parsed.groups[0].percentages,
                        counts: parsed.groups[0].counts,
                        totalStudents: parsed.groups[0].total,
                        teachingQuality,
                        subjectDomainCount,
                    }),
                );
            });
        });
    }

    const schoolTqAttached = new Set();

    chartInput.forEach((domainGroup) => {
        const first = domainGroup[0];
        const subject = first.subject?.name;
        const domain = first.domain?.id;
        const domainLabel = first.domain?.name || domain;
        const subjectLabel = first.subject?.name;
        const subjectDomainCount = subjectDomainCounts[subject]?.size || 1;

        const parsed = parseCompetenceLevels(domainGroup);
        const { levels, scaleId } = parsed;
        const { totalStudentsSchool, schoolDistribution, schoolCounts } = buildSchoolDistribution(
            parsed,
            levels,
        );

        const schoolTeachingQuality = !schoolTqAttached.has(subject)
            ? lookupTeachingQuality('Schule', subject)
            : null;
        if (schoolTeachingQuality) {
            schoolTqAttached.add(subject);
        }

        chartData.push(
            createChartDataEntry({
                name: 'Schulschnitt',
                type: 'school',
                subject,
                subjectLabel,
                domain,
                domainLabel,
                competencyLevels: levels,
                scaleId,
                distribution: schoolDistribution,
                counts: schoolCounts,
                totalStudents: totalStudentsSchool,
                teachingQuality: schoolTeachingQuality,
                subjectDomainCount,
            }),
        );

        appendLandesschnittEntries(chartData, {
            references: resolveLandesschnittReferences({
                lookupLandesschnittDistribution,
                subject,
                domain,
            }),
            subject,
            subjectLabel,
            domain,
            domainLabel,
            levels,
            scaleId,
            subjectDomainCount,
        });
    });

    return chartData.sort(sortByTypeAndName);
}

/**
 * Unwrap whatever shape the caller handed in — a flat class array, or a payload object
 * carrying one or more domain groups — to the entries the preparation works on.
 * @param {any} data - The renderer's data as it was given.
 * @returns {Array} The class entries, empty when the shape carries none.
 */
export function resolveCompetencyDetailChartInput(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (!data) {
        return [];
    }

    if (data.isMultiDomain && data.domainGroups) {
        return data.domainGroups;
    }

    if (data.domainGroups && data.domainGroups.length === 1) {
        return data.domainGroups[0];
    }

    return data.domainGroup || data.domainGroups?.[0] || [];
}

/**
 * Prepare the normalized competency detail chart rows used by the detail renderer.
 * @param {any} data - The renderer's data: a flat class array, or an object carrying domain groups.
 * @param {object} [options] - The lookups (Unterrichtsqualität, Landesschnitt) and display flags the rows are built with.
 * @returns {Array<object>} The rows, sorted class → school → Landesschnitt; empty when the input carries no entries.
 */
export function prepareCompetencyDetailChartData(data, options = {}) {
    const chartInput = resolveCompetencyDetailChartInput(data);
    if (!Array.isArray(chartInput) || chartInput.length === 0) {
        return [];
    }

    const {
        className = '',
        showOnlySchoolData = false,
        lookupTeachingQuality = () => null,
        lookupLandesschnittDistribution = null,
    } = options;

    if (Array.isArray(chartInput[0])) {
        return prepareMultiDomainDetailChartData(chartInput, {
            className,
            showOnlySchoolData,
            lookupTeachingQuality,
            lookupLandesschnittDistribution,
        });
    }

    return prepareSingleDomainDetailChartData(chartInput, {
        lookupTeachingQuality,
        lookupLandesschnittDistribution,
    });
}

/**
 * Extract unique values from array using a key function
 * @param {Array} data - The rows to read.
 * @param {(row: any) => any} keyFn - Maps a row to the value being collected.
 * @returns {Array} The distinct values, in first-seen order.
 */
export function getUniqueValues(data, keyFn) {
    return [...new Set(data.map(keyFn))];
}

/**
 * Builds the shared rows for a competency bar tooltip.
 * Both overview and detail renderers delegate to this for the common logic
 * (null-check, share, student count, row construction).
 *
 * Every figure is read off the bar's own stacked row — its share, its `frequency` per
 * band and its `total` — never estimated from the share and never taken from the group
 * the bar stands in: an overview class bar sits in its Fach's group, whose headcount is
 * the school's.
 * @param {object} barRow - The bar's own stacked row: `<level>_value` shares plus its `counts` and `totalStudents`.
 * @param {string} level - Competency level key
 * @returns {{ noData: boolean, rows: Array, percentage: number, studentCount: number|null }} The tooltip rows plus the figures behind them; `studentCount` stays `null` for a row that carries no counts.
 */
export function buildCompetencyTooltipRows(barRow, level) {
    if (!barRow?.totalStudents) {
        return {
            noData: true,
            rows: [
                {
                    label: 'Status',
                    value: glossaryAnnotator.getRequiredEntryText('general.messages.no-data-short'),
                },
            ],
            percentage: 0,
            studentCount: null,
        };
    }

    const percentage = barRow[`${level}_value`] || 0;
    const studentCount = barRow.counts ? (barRow.counts[level] ?? 0) : null;

    const rows = /** @type {Array<{label: string, value: string|number}>} */ ([
        { label: 'Kompetenzstufe', value: `${level}: ${percentage.toFixed(1)}%` },
    ]);

    if (studentCount !== null) {
        rows.push({ label: `Anzahl ${TERM_CONSTANTS.STUDENTS}`, value: studentCount });
        rows.push({ label: 'Gesamtanzahl', value: barRow.totalStudents });
    }

    return { noData: false, rows, percentage, studentCount };
}

/**
 * Prepares competency levels and color function from chart data.
 *
 * The rows can sit on several ladders (the Überblick stacks every Fach), and two ladders
 * can share a level name — NRW's Deutsch and Mathematik both have `KS 2 … KS 5`. So a
 * level is resolved on the ladder of the row being painted, and where only a name is
 * known (the union list, the legend) on the ladder of the first row that carries it.
 * That is the legend's one remaining approximation: a shared name gets one swatch.
 * @param {Array<object>} chartData - The prepared rows, read for the bands they carry.
 * @returns {{competencyLevels: string[], getColorForLevel: (level: string, row?: object) => string, scaleIdForLevel: (level: string) => string|undefined}} The union of bands in scale order, the colour lookup the bars use, and the ladder a bare name resolves on.
 */
export function prepareCompetencyLevels(chartData) {
    const allLevels = new Set();
    /** @type {Map<string, string|undefined>} level → ladder of the first row carrying it that names one */
    const scaleIdByLevel = new Map();
    chartData.forEach((data) => {
        if (data.competencyLevels) {
            data.competencyLevels.forEach((level) => {
                allLevels.add(level);
                if (scaleIdByLevel.get(level) === undefined)
                    scaleIdByLevel.set(level, data.scaleId);
            });
        }
    });
    const scaleIdForLevel = (level) => scaleIdByLevel.get(level);
    const competencyLevels = sortCompetencyLevels(Array.from(allLevels), scaleIdForLevel);
    const getColorForLevel = (level, row) =>
        getCompetencyColor(level, row?.scaleId ?? scaleIdForLevel(level));
    return { competencyLevels, getColorForLevel, scaleIdForLevel };
}

/**
 * Creates stacked data structure for D3 stacked bar chart
 * @param {Array} chartData - Chart data
 * @param {Array} competencyLevels - Array of competency levels
 * @param {string} distributionKey - Key to access distribution data (default: 'distribution')
 * @returns {Array} Stacked data
 */
export function createStackedData(chartData, competencyLevels, distributionKey = 'distribution') {
    return chartData.map((data) => {
        const stackedEntry = { ...data };
        let cumulative = 0;

        competencyLevels.forEach((level) => {
            const levelKey = level.stufe || level;
            const value = data[distributionKey]?.[levelKey] || 0;
            stackedEntry[`${levelKey}_start`] = cumulative;
            stackedEntry[`${levelKey}_end`] = cumulative + value;
            stackedEntry[`${levelKey}_value`] = value;
            cumulative += value;
        });

        return stackedEntry;
    });
}

// ============================================================================
// LOOKUPS OVER THE DATASTORE ROWS
// ============================================================================

/**
 * The persisted Landesschnitt distributions for one Fach/Domäne, one per state row that
 * carries percentages (a state split by track ships several).
 * @param {Array|null} stateEntries - The state-average competence rows.
 * @param {{subject: string, domain: string|null}} target - The Fach and Domäne to match.
 * @returns {Array<{entry: object, distribution: object, counts: object, totalStudents: number}>} One item per usable row, with the state row's own counts and headcount.
 */
export function lookupLandesschnittDistribution(stateEntries, { subject, domain }) {
    const normalizedDomain = domain ?? null;
    const matching =
        stateEntries?.filter(
            (entry) =>
                entry.subject?.name === subject && (entry.domain?.id ?? null) === normalizedDomain,
        ) ?? [];

    // One row per parse, so `groups[0]` is that state row itself.
    return matching.flatMap((stateEntry) => {
        const stateGroup = parseCompetenceLevels([stateEntry]).groups[0];
        const persistedDistribution = stateGroup?.percentages;
        if (persistedDistribution && Object.keys(persistedDistribution).length > 0) {
            return {
                entry: stateEntry,
                distribution: persistedDistribution,
                counts: stateGroup.counts,
                totalStudents: stateGroup.total,
            };
        }
        return [];
    });
}

/**
 * The Unterrichtsqualität statistics for one class and Fach, in the shape the
 * renderer's box drawer expects.
 * @param {Array|null} teachingQuality - The derived teaching-quality rows from the DataStore.
 * @param {string} className - Class name (or 'Schule' for school aggregate)
 * @param {string} subjectName - Subject name (e.g. 'Deutsch')
 * @returns {object | null} The class's statistics, or `null` when the payload carries none for that pair.
 */
export function lookupTeachingQuality(teachingQuality, className, subjectName) {
    if (!teachingQuality || !className || !subjectName) return null;
    const entry = teachingQuality.find(
        (tq) => tq.className === className && tq.subjectName === subjectName,
    );
    if (!entry?.statistics) return null;
    // The whole statistics object, not a mean/SD pair: it already carries the real
    // quartiles, fences and extremes, and the box drawer used to re-approximate
    // those from mean ± z·SD because this adapter had dropped them.
    return {
        ...entry.statistics,
        count: entry.count,
        values: Array.isArray(entry.values) ? entry.values : [],
    };
}

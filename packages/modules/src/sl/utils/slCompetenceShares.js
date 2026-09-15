/**
 * DOM-free competence-share queries over the SL payload: the share of students on the
 * requested levels for a target, per Fach and Domäne or per whole Fach, plus the "what is
 * there" lookups (rows, selections, candidate classes) the info-box selection verbs rank
 * over. Read by the info boxes, the Überblick metrics and the Material pages.
 *
 * The Lösungsquote queries live beside this in `slSolutionRates.js`, serve the Überblick
 * metric and the Material pages only, and must not enter an info-box placeholder — see
 * that file for why.
 */

import {
    filterStateRows,
    filterSubjectRows,
    normalizeTarget,
    sumRatio,
} from './slQueryPrimitives.js';
import {
    getPaletteVersion,
    getScaleLevelNames,
    resolveScaleId,
    scaleHasStandardRanks,
} from '../../common/services/competenceLevelPalette.js';

/**
 * Scales already reported as unrankable, so the warning below fires once per scale
 * rather than once per row per render.
 *
 * Keyed by palette version as well as scale id: the registry can be replaced (tests reset
 * it, and `getPaletteVersion` exists so downstream caches can tell), and a cache that
 * outlived the reset would swallow the warning for a scale registered afresh.
 * @type {Set<string>}
 */
const warnedUnrankedScales = new Set();

class CompetenceShareQueries {
    #moduleId;
    #slData;

    /**
     * @param {object} [options] - Where the data comes from.
     * @param {string} [options.moduleId] - Names the caller in warnings.
     * @param {import('../slData.js').SlData} options.slData - The SL data port.
     */
    constructor({ moduleId, slData } = /** @type {any} */ ({})) {
        this.#moduleId = moduleId ?? 'unknown';
        this.#slData = slData;
    }

    /**
     * Weighted share of the requested levels for one subject×domain of a target.
     * @param {object} params - What to read.
     * @param {*} [params.target] - School, state or class target; see `normalizeTarget`.
     * @param {string[]} [params.levelNames] - The levels the share counts.
     * @param {string} params.subjectName - Fach to read.
     * @param {string|null} [params.domainId] - Domäne to read; tri-state, see `#getRowsForSubjectDomain`.
     * @returns {number|null} The share, or `null` when nothing matched or the scale cannot express the levels.
     */
    getCompetenceLevelShare({
        target = null,
        levelNames = [],
        subjectName,
        domainId = undefined,
    } = /** @type {any} */ ({})) {
        const normalizedTarget = normalizeTarget(target, this.#moduleId);
        if (!normalizedTarget || !subjectName) {
            return null;
        }

        if (levelNames.length === 0) {
            return null;
        }

        const rows = this.getRowsForTarget(normalizedTarget);
        const matchingRows = this.#getRowsForSubjectDomain({
            rows,
            subjectName,
            domainId,
        });

        if (matchingRows.length === 0) {
            return null;
        }

        const levelNameSet = new Set(levelNames);
        return sumRatio(matchingRows, (row) =>
            this.#extractCompetenceLevelCounts(row, levelNameSet),
        );
    }

    /**
     * The same share aggregated over a whole Fach; a school target pools its class rows.
     * @param {object} params - What to read.
     * @param {*} [params.target] - School, state or class target; see `normalizeTarget`.
     * @param {string[]} [params.levelNames] - The levels the share counts.
     * @param {string} params.subjectName - Fach to read.
     * @param {string|null} [params.domainId] - Domäne to keep; `undefined` keeps the whole Fach.
     * @returns {number|null} The share, or `null` when nothing matched or the scale cannot express the levels.
     */
    getSubjectCompetenceShare({
        target = null,
        levelNames = [],
        subjectName,
        domainId = undefined,
    } = /** @type {any} */ ({})) {
        const normalizedTarget = normalizeTarget(target, this.#moduleId);
        if (!normalizedTarget || !subjectName) {
            return null;
        }

        if (levelNames.length === 0) {
            return null;
        }

        const rows = this.getRowsForSubjectAggregateTarget(normalizedTarget);
        const matchingRows = filterSubjectRows({
            rows,
            subjectName,
            domainId,
            getDomainId: (row) => row?.domain?.id ?? null,
        });

        if (matchingRows.length === 0) {
            return null;
        }

        const levelNameSet = new Set(levelNames);
        return sumRatio(matchingRows, (row) =>
            this.#extractCompetenceLevelCounts(row, levelNameSet),
        );
    }

    /**
     * The competence rows a target is measured on: the school's own rows, the
     * Landesschnitt rows, or the named classes' rows.
     * @param {ReturnType<typeof normalizeTarget>} target - A normalised target.
     * @returns {any[]} The rows; empty when the payload names no school.
     */
    getRowsForTarget(target) {
        const index = this.#slData.competenceLevelIndex();
        if (!target || !index.schoolId) {
            return [];
        }

        if (target.type === 'school') {
            return index.schoolRows;
        }

        if (target.type === 'state') {
            return filterStateRows(index.stateRows, target);
        }

        if (target.type === 'classes') {
            const allowedClasses = new Set(target.classNames);
            return index.classRows.filter((entry) => allowedClasses.has(entry?.name));
        }

        return [];
    }

    /**
     * The rows a Fach aggregate is summed over — a school resolves to its class rows,
     * because the school's own row reports one Domäne at a time.
     * @param {ReturnType<typeof normalizeTarget>} target - A normalised target.
     * @returns {any[]} The rows; empty when the payload names no school.
     */
    getRowsForSubjectAggregateTarget(target) {
        const index = this.#slData.competenceLevelIndex();
        if (!target || !index.schoolId) {
            return [];
        }

        const classRows = index.classRows;
        if (target.type === 'school') {
            return classRows;
        }

        if (target.type === 'state') {
            return filterStateRows(index.stateRows, target);
        }

        if (target.type === 'classes') {
            const allowedClasses = new Set(target.classNames);
            return classRows.filter((entry) => allowedClasses.has(entry?.name));
        }

        return [];
    }

    /**
     * Every subject×domain a target has competence rows for, sorted by Fach then Domäne.
     * @param {*} [target] - School, state or class target; see `normalizeTarget`.
     * @returns {Array<{subjectName: string, domainId: string|null, domainName: string|null}>} The selections.
     */
    getAvailableSubjectDomainSelections(target = null) {
        const normalizedTarget = normalizeTarget(target, this.#moduleId);
        if (!normalizedTarget) {
            return [];
        }

        const rows = this.getRowsForTarget(normalizedTarget);
        const selectionMap = new Map();

        rows.forEach((row) => {
            const subjectName = row?.subject?.name;
            if (!subjectName) {
                return;
            }

            if (!Array.isArray(row?.competenceLevels) || row.competenceLevels.length === 0) {
                return;
            }

            const domainId = row?.domain?.id ?? null;
            const domainName = row?.domain?.name ?? null;
            const key = `${subjectName}|${domainId ?? 'null'}`;

            if (!selectionMap.has(key)) {
                selectionMap.set(key, {
                    subjectName,
                    domainId,
                    domainName,
                });
            }
        });

        return Array.from(selectionMap.values()).sort(
            (a, b) =>
                a.subjectName.localeCompare(b.subjectName) ||
                String(a.domainName ?? a.domainId ?? '').localeCompare(
                    String(b.domainName ?? b.domainId ?? ''),
                ),
        );
    }

    /**
     * The Domänen of a Fach in payload order, as selection objects.
     * @param {string} subjectName - The Fach.
     * @returns {Array<{type: 'subjectDomain', subjectName: string, domainId: string|null, domainName: string|null}>} Its domains; empty for an unknown Fach.
     */
    getOrderedDomainsForSubject(subjectName) {
        if (!subjectName) {
            return [];
        }

        const subjectDomainMap = this.#slData.competenceLevelIndex().subjectDomains;
        const subjectInfo = subjectDomainMap.find((entry) => entry?.subjectName === subjectName);
        if (!subjectInfo) {
            return [];
        }

        return (Array.isArray(subjectInfo.domains) ? subjectInfo.domains : []).map((domain) => ({
            type: 'subjectDomain',
            subjectName,
            domainId: domain?.domainId ?? null,
            domainName: domain?.domainName ?? null,
        }));
    }

    /**
     * The classes a selection verb ranks over: the named ones, or every class of the
     * school, sorted by name.
     * @param {*} [target] - School or class target; see `normalizeTarget`.
     * @returns {string[]} Sorted class names.
     */
    getCandidateClassNames(target = 'school') {
        const normalizedTarget = normalizeTarget(target, this.#moduleId);
        if (!normalizedTarget) {
            return [];
        }

        if (normalizedTarget.type === 'classes') {
            return [...normalizedTarget.classNames].sort((a, b) => a.localeCompare(b));
        }

        const index = this.#slData.competenceLevelIndex();
        if (!index.schoolId) {
            return [];
        }

        return [
            ...new Set(
                index.classRows
                    .map((entry) => entry?.name)
                    .filter((className) => typeof className === 'string' && className.trim()),
            ),
        ].sort((a, b) => a.localeCompare(b));
    }

    /**
     * Rows for one subject, narrowed to a single domain. `domainId` is tri-state:
     * `undefined` infers the domain of a single-domain subject (warns otherwise),
     * `null` targets the whole subject, a string targets that specific domain.
     * @param {object} params - Which rows to narrow, and to what.
     * @param {any[]} [params.rows] - The rows to filter.
     * @param {string} params.subjectName - Fach to keep.
     * @param {string|null} [params.domainId] - Domäne to keep; see the tri-state above.
     * @returns {any[]} The matching rows.
     */
    #getRowsForSubjectDomain({ rows, subjectName, domainId = undefined }) {
        const subjectRows = (Array.isArray(rows) ? rows : []).filter(
            (row) => row?.subject?.name === subjectName,
        );

        if (subjectRows.length === 0) {
            return [];
        }

        const availableDomainIds = [...new Set(subjectRows.map((row) => row?.domain?.id ?? null))];

        if (domainId === undefined) {
            if (availableDomainIds.length === 1 && availableDomainIds[0] === null) {
                domainId = null;
            } else {
                console.warn(
                    `InfoBoxModule[${this.#moduleId}]: domainId is required for multi-domain subject "${subjectName}"`,
                );
                return [];
            }
        }

        const normalizedDomainId = domainId ?? null;
        return subjectRows.filter((row) => (row?.domain?.id ?? null) === normalizedDomainId);
    }

    /**
     * Count the students this row places at one of `levelNameSet`.
     *
     * `covered` reports whether the row's **scale** contains any of the requested
     * levels at all, independent of how many students landed there. Without it a
     * request the scale cannot express (asking for `ReStd` of a row measured in
     * `A1.1…B1.2`) produces `0 / 40` — a finite zero that survives every downstream
     * "is this a number?" guard and is drawn as a real measurement. A share that the
     * scale cannot express is unknown, not zero.
     *
     * The scale is the registered ladder, not the levels the row happens to list: a row
     * omitting a level its scale has (nobody reached `OptStd`) is a genuine zero and must
     * not vanish from a view it belongs in.
     * @param {object} row - The payload row to count in.
     * @param {Set<string>} levelNameSet - The levels being asked about.
     * @returns {{matchedCount: number, totalCount: number, covered: boolean}} The headcount and denominator, plus whether the row's scale could express the question at all.
     */
    #extractCompetenceLevelCounts(row, levelNameSet) {
        let matchedCount = 0;
        const levels = Array.isArray(row?.competenceLevels) ? row.competenceLevels : [];
        // The denominator is the row's `total` — every student of the value-group, the base
        // the spec defines `mean` against — not the sum of the level frequencies, which
        // leaves out a student the payload assigns no level.
        const total = Number(levels[0]?.descriptiveStatistics?.total);
        const totalCount = Number.isFinite(total) ? total : 0;
        const scaleId = resolveScaleId(levels.map((level) => level?.nameShort));
        // Only a resolved ladder may widen coverage: a bare name resolves to whichever
        // ladder registered it last, which on a page holding two could claim the other
        // Fach's level as this row's zero.
        const scaleLevelNames =
            scaleId === undefined ? [] : getScaleLevelNames(levels[0]?.nameShort, scaleId);
        let covered = scaleLevelNames.some((name) => levelNameSet.has(String(name).trim()));

        levels.forEach((level) => {
            const frequency = Number(level?.descriptiveStatistics?.frequency);
            const safeFrequency = Number.isFinite(frequency) ? frequency : 0;

            if (levelNameSet.has(String(level?.nameShort ?? '').trim())) {
                covered = true;
                matchedCount += safeFrequency;
            }
        });

        if (!covered) {
            this.#warnUnrankedScale(row, scaleId);
        }

        return {
            matchedCount,
            totalCount,
            covered,
        };
    }

    /**
     * Report a scale that cannot answer a standard-based question, once per scale.
     * The symptom is otherwise invisible — the metric simply stops appearing.
     *
     * Only an **unrankable scale** is reported. A row also matches no requested level when
     * the scale names its standards perfectly well but has no level of the rank asked for
     * (`e_5` against a ladder topping out at "Regelstandard plus"). Warning there would
     * name the wrong cause and point the reader at a field that is already correct.
     * @param {object} row - The row whose scale could not answer.
     * @param {string|undefined} resolvedScaleId - The row's registered scale, when the palette could name it.
     */
    #warnUnrankedScale(row, resolvedScaleId) {
        const levels = Array.isArray(row?.competenceLevels) ? row.competenceLevels : [];
        if (scaleHasStandardRanks(levels[0]?.nameShort, resolvedScaleId)) {
            return;
        }

        const scaleId = resolvedScaleId ?? levels.map((level) => level?.nameShort).join('|');
        const cacheKey = `${getPaletteVersion()}:${scaleId}`;
        if (!scaleId || warnedUnrankedScales.has(cacheKey)) {
            return;
        }

        warnedUnrankedScales.add(cacheKey);
        console.warn(
            `[slCompetenceShares] The competence scale "${scaleId}" names no KMK standards ` +
                '(competenceLevels[].name), so standard-based shares are reported as unknown ' +
                'rather than 0 %.',
        );
    }
}

export { CompetenceShareQueries };

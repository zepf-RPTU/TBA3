/**
 * DOM-free competence-share queries over the SL payload: the share of students on the
 * requested levels for a target, per Fach and Domäne or per whole Fach, plus the "what is
 * there" lookups (value groups, selections, candidate groups) a selection ranks over. Read
 * through one `COMPETENCE_SHARES` dataset per store, whose answers are parameterised datasets.
 *
 * The Lösungsquote queries live beside this in `slSolutionRates.js`.
 */

import { dataset } from '../../common/data/documentStore.js';
import { compareText } from '../../common/utils/compare.js';
import { readLevelShare, readLevelsTotal } from '../../common/domain/competenceLevelShare.js';
import {
    filterComparisons,
    filterBySubject,
    narrowToSubjectDomain,
    normalizeTarget,
    subjectNamesOf,
    domainIdOf,
    sumRatio,
} from './slQueryPrimitives.js';
import { SL_DATASETS } from '../slDatasets.js';
import { groupNamesOf, domainsOfSubject, findSoleStateTrack } from '../slCompetenceLevelIndex.js';
import { subjectDomainKey } from './slLevelDefinitions.js';
import { resolveCompetenceLevelBandAlias, warnUnresolvableAlias } from './slCompetenceLevels.js';

/** @typedef {import('../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} CompetenceLevelPalette */
/** @typedef {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} CompetenceLevelIndex */
/** @typedef {import('./slQueryPrimitives.js').DomainScope} DomainScope */

/** Names the share queries in the warnings of a target or selection they cannot read. */
const CALLER = 'CompetenceShareQueries';

/** @typedef {NonNullable<ReturnType<typeof normalizeTarget>>} NormalizedTarget */
/** @typedef {{subjectName: string, domainId: string|null, domainName: string|null}} SubjectDomainSelection */

/**
 * The level names a band alias (`ge_medium`) counts across every loaded scale, once per
 * store and alias (`resolveCompetenceLevelBandAlias`); an alias no scale can express is
 * warned here, once. Read after `competence-levels.json`, which registers the scales.
 */
const ALIAS_LEVELS = dataset('sl.aliasLevels', {
    inputs: [SL_DATASETS.COMPETENCE_LEVEL_INDEX],
    params: (/** @type {string} */ levelAlias) => [levelAlias],
    build: (_index, { palette }, levelAlias) => {
        const levelNames = resolveCompetenceLevelBandAlias(palette, levelAlias);
        if (levelNames?.length === 0) warnUnresolvableAlias(levelAlias);
        return levelNames;
    },
});

/**
 * One share question of a normalised target, once per store and question: the info-box
 * verbs rank every Lerngruppe over every Fach×Domäne, and a box asks the same question in
 * several sentences. The palette's revision is no part of the key: whether a value group's
 * scale can express a level depends only on the registered scales, fixed once
 * `competence-levels.json` has landed. `pooled` picks the per-Fach question: a school
 * target pools its groups' value groups, narrowed to the Fach instead of the Domäne.
 */
const COMPETENCE_SHARE = dataset('sl.competenceShare', {
    inputs: [SL_DATASETS.COMPETENCE_LEVEL_INDEX, ALIAS_LEVELS],
    params: (
        /** @type {NormalizedTarget} */ target,
        /** @type {string} */ levelAlias,
        /** @type {string} */ subjectName,
        /** @type {DomainScope} */ domainId,
        /** @type {boolean} */ pooled,
    ) => [target, levelAlias, subjectName, domainId, pooled],
    build: (index, levelsOf, { palette }, target, levelAlias, subjectName, domainId, pooled) => {
        const levelNames = levelsOf(levelAlias) ?? [];
        if (levelNames.length === 0) return null;
        const valueGroups = valueGroupsOf(index, target, pooled);
        const narrowed = pooled
            ? filterBySubject({ valueGroups, subjectName, domainId })
            : narrowToSubjectDomain({ valueGroups, subjectName, domainId, caller: CALLER });
        return competenceLevelShare(palette, narrowed, levelNames);
    },
});

/** Every subject×domain a normalised target has competence value groups for, in payload order */
const SUBJECT_DOMAIN_SELECTIONS = dataset('sl.subjectDomainSelections', {
    inputs: [SL_DATASETS.COMPETENCE_LEVEL_INDEX],
    params: (/** @type {NormalizedTarget} */ target) => [target],
    build: (index, _context, target) => collectSubjectDomainSelections(index, target),
});

/** The groups a selection verb ranks over for a normalised target, sorted by name */
const CANDIDATE_GROUP_NAMES = dataset('sl.candidateGroupNames', {
    inputs: [SL_DATASETS.COMPETENCE_LEVEL_INDEX],
    params: (/** @type {NormalizedTarget} */ target) => [target],
    build: (index, _context, target) =>
        target.type === 'groups' ? [...target.groupNames].sort(compareText) : groupNamesOf(index),
});

/**
 * The share queries of the loaded dataset, one per store; each answer is memoised by the
 * store. Building it reports, once, every scale that tags no standard band: a
 * standard-based share over it is unknown rather than 0 %, and would otherwise vanish
 * without a message.
 */
export const COMPETENCE_SHARES = dataset('sl.competenceShares', {
    inputs: [
        SL_DATASETS.COMPETENCE_LEVEL_INDEX,
        ALIAS_LEVELS,
        COMPETENCE_SHARE,
        SUBJECT_DOMAIN_SELECTIONS,
        CANDIDATE_GROUP_NAMES,
    ],
    build: (index, levelsOf, share, selections, candidates, { palette }) => {
        warnUntaggedScales(palette, [...index.schools, ...index.groups, ...index.comparisons]);
        return new CompetenceShareQueries({ index, levelsOf, share, selections, candidates });
    },
});

class CompetenceShareQueries {
    #index;
    #levelsOf;
    #share;
    #selections;
    #candidates;

    /**
     * Built by `COMPETENCE_SHARES` over the store's memoised answers.
     * @param {object} sources
     * @param {CompetenceLevelIndex} sources.index
     * @param {(levelAlias: string) => string[]|null} sources.levelsOf
     * @param {(target: NormalizedTarget, levelAlias: string, subjectName: string, domainId: DomainScope, pooled: boolean) => number|null} sources.share
     * @param {(target: NormalizedTarget) => SubjectDomainSelection[]} sources.selections
     * @param {(target: NormalizedTarget) => string[]} sources.candidates
     */
    constructor({ index, levelsOf, share, selections, candidates }) {
        this.#index = index;
        this.#levelsOf = levelsOf;
        this.#share = share;
        this.#selections = selections;
        this.#candidates = candidates;
    }

    /**
     * The target a sentence about "the Landesschnitt" compares with: the payload's sole
     * `state` track (`findSoleStateTrack`).
     * @returns {{type: 'comparison', id: string}|null} `null` when the payload delivers none or several.
     */
    getSoleStateTarget() {
        const track = findSoleStateTrack(this.#index);
        return track ? { type: 'comparison', id: track.id } : null;
    }

    /**
     * The level names a band alias (`ge_medium`) counts across the loaded scales.
     * @param {string|undefined} levelAlias
     * @returns {string[]|null} `[]` when no loaded scale tags the band; `null` when the input is not an alias.
     */
    getAliasLevels(levelAlias) {
        return levelAlias ? this.#levelsOf(levelAlias) : null;
    }

    /**
     * Weighted share of a band alias's levels for one subject×domain of a target.
     * @param {object} params
     * @param {import('./slQueryPrimitives.js').QueryTarget} [params.target]
     * @param {string} [params.levelAlias] - `ge_medium` and the like (`getAliasLevels`).
     * @param {string} params.subjectName
     * @param {DomainScope} params.domainId - The one Domäne (`narrowToSubjectDomain`).
     * @returns {number|null} 0–1; `null` when nothing matched or the scale cannot express the levels.
     */
    getCompetenceLevelShare({ target = null, levelAlias = '', subjectName, domainId }) {
        return this.#query(target, levelAlias, subjectName, domainId, false);
    }

    /**
     * The same share aggregated over a whole Fach; a school target pools its groups' value groups.
     *
     * A Fach split into Domänen has competence levels per Domäne only, so with `domainId`
     * `ALL_DOMAINS` its share is over student×Domäne results: a student measured in two Domänen
     * counts twice. A per-student level for such a Fach is in no payload.
     * @param {object} params
     * @param {import('./slQueryPrimitives.js').QueryTarget} [params.target]
     * @param {string} [params.levelAlias] - `ge_medium` and the like (`getAliasLevels`).
     * @param {string} params.subjectName
     * @param {DomainScope} params.domainId - `ALL_DOMAINS` pools the whole Fach.
     * @returns {number|null} 0–1; `null` when nothing matched or the scale cannot express the levels.
     */
    getSubjectCompetenceShare({ target = null, levelAlias = '', subjectName, domainId }) {
        return this.#query(target, levelAlias, subjectName, domainId, true);
    }

    /**
     * The Fächer a Fach aggregate of a target is summed over, in payload order — a school
     * resolves to its groups', so the school figure is the sum of the rows it is shown
     * beside (a student in no Testgruppe is left out of it).
     * @param {import('./slQueryPrimitives.js').QueryTarget} [target]
     * @returns {string[]} Empty when the payload names no school.
     */
    getSubjectNames(target = null) {
        return subjectNamesOf(valueGroupsOf(this.#index, normalizeTarget(target, CALLER), true));
    }

    /**
     * Every subject×domain a target has competence value groups for, in payload order.
     * @param {import('./slQueryPrimitives.js').QueryTarget} [target]
     * @returns {SubjectDomainSelection[]}
     */
    getAvailableSubjectDomainSelections(target = null) {
        const normalizedTarget = normalizeTarget(target, CALLER);
        return normalizedTarget ? this.#selections(normalizedTarget) : [];
    }

    /**
     * The Domänen of a Fach in payload order, as selection objects.
     * @param {string} subjectName
     * @returns {Array<{type: 'subjectDomain', subjectName: string, domainId: string|null, domainName: string|null}>} Empty for an unknown Fach.
     */
    getOrderedDomainsForSubject(subjectName) {
        if (!subjectName) {
            return [];
        }

        return domainsOfSubject(this.#index, subjectName).map(({ domainId, domainName }) => ({
            type: 'subjectDomain',
            subjectName,
            domainId,
            domainName,
        }));
    }

    /**
     * The groups a selection verb ranks over: the named ones, or every group of the
     * school, sorted by name. Memoised, so the array is shared: read it, never edit it.
     * @param {import('./slQueryPrimitives.js').QueryTarget} [target] - School or group target.
     * @returns {string[]}
     */
    getCandidateGroupNames(target = 'school') {
        const normalizedTarget = normalizeTarget(target, CALLER);
        return normalizedTarget ? this.#candidates(normalizedTarget) : [];
    }

    /**
     * @param {import('./slQueryPrimitives.js').QueryTarget} target
     * @param {string} levelAlias
     * @param {string} subjectName
     * @param {DomainScope} domainId - Domäne the narrowing keeps.
     * @param {boolean} pooled - Whether a school target pools its groups' value groups instead of reading its own.
     * @returns {number|null} 0–1; `null` when nothing matched or the scale cannot express the levels.
     */
    #query(target, levelAlias, subjectName, domainId, pooled) {
        const normalizedTarget = normalizeTarget(target, CALLER);
        if (!normalizedTarget || !subjectName || !levelAlias) {
            return null;
        }
        return this.#share(normalizedTarget, levelAlias, subjectName, domainId, pooled);
    }
}

/**
 * @param {CompetenceLevelIndex} index
 * @param {ReturnType<typeof normalizeTarget>} target
 * @param {boolean} pooled - Whether a school target resolves to its groups' value groups instead of its own.
 * @returns {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} Empty when the payload names no school.
 */
function valueGroupsOf(index, target, pooled) {
    if (!target || !index.schoolId) {
        return [];
    }

    if (target.type === 'school') {
        return pooled ? index.groups : index.schools;
    }

    if (target.type === 'comparison') {
        return filterComparisons(index.comparisons, target.id);
    }

    return target.groupNames.flatMap((name) => index.groupsByName.get(name) ?? []);
}

/**
 * @param {CompetenceLevelIndex} index
 * @param {NormalizedTarget} target
 * @returns {SubjectDomainSelection[]}
 */
function collectSubjectDomainSelections(index, target) {
    // The target's own value groups: the school's, one comparison population's, or the named groups'.
    /** @type {Map<string, SubjectDomainSelection>} */
    const selectionMap = new Map();

    for (const valueGroup of valueGroupsOf(index, target, false)) {
        const subjectName = valueGroup.subject?.name;
        if (!subjectName || valueGroup.competenceLevels.length === 0) {
            continue;
        }

        const domainId = domainIdOf(valueGroup);
        const key = subjectDomainKey(subjectName, domainId);
        if (!selectionMap.has(key)) {
            selectionMap.set(key, {
                subjectName,
                domainId,
                domainName: valueGroup.domain?.name ?? null,
            });
        }
    }

    return Array.from(selectionMap.values());
}

/**
 * The share of students on `levelNames` over value groups the caller has already narrowed.
 * A value group whose scale cannot express the levels is unknown, not 0 %: with none
 * that can, the share is `null` — one rule for every reader, the current year's and an
 * earlier year's value groups alike.
 * @param {CompetenceLevelPalette} palette - Which scale each value group is measured on.
 * @param {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} valueGroups
 * @param {string[]} levelNames
 * @returns {number|null} 0–1; `null` without value groups or when no scale can express the levels.
 */
function competenceLevelShare(palette, valueGroups, levelNames) {
    const levelNameSet = new Set(levelNames);
    return sumRatio(valueGroups, (valueGroup) =>
        extractCompetenceLevelCounts(palette, valueGroup, levelNameSet),
    );
}

/**
 * Count the students this value group places at one of `levelNameSet`.
 *
 * `covered` reports whether the value group's scale contains any of the requested
 * levels, independent of how many students landed there. Without it a request the
 * scale cannot express (`ReStd` of a value group measured in `A1.1…B1.2`) produces
 * `0 / 40`, a finite zero drawn as a real measurement; such a share is unknown.
 *
 * The scale is the registered ladder, not the levels the value group lists: a value
 * group omitting a level its scale has (nobody reached `OptStd`) is a genuine zero.
 *
 * A value group without a `total` — a Landesschnitt delivering shares only — reports the
 * summed level shares instead (`readLevelShare`), which `sumRatio` answers with alone
 * but never pools. A requested level it does not list is a genuine zero there too.
 * @param {CompetenceLevelPalette} palette
 * @param {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} valueGroup
 * @param {Set<string>} levelNameSet
 * @returns {import('./slQueryPrimitives.js').RatioCounts} The headcount and denominator, or the uncounted share, plus whether the value group's scale could express the question at all.
 */
function extractCompetenceLevelCounts(palette, valueGroup, levelNameSet) {
    let matchedCount = 0;
    /** @type {number|null} */
    let matchedShare = null;
    const levels = valueGroup.competenceLevels;
    // The denominator is the value group's `total` — every student of it, the base
    // the spec defines `mean` against — not the sum of the level frequencies, which
    // leaves out a student the payload assigns no level.
    const total = readLevelsTotal(levels);
    const counted = total !== undefined;
    const totalCount = total ?? 0;
    const scaleId = palette.scaleIdOf(valueGroup);
    // Only a resolved ladder may widen coverage: a bare name resolves to whichever
    // ladder registered it last, which on a page holding two could claim the other
    // Fach's level as this value group's zero.
    const scaleLevelNames =
        scaleId === undefined ? [] : palette.getScaleLevelNames(levels[0]?.nameShort, scaleId);
    let covered = scaleLevelNames.some((name) => levelNameSet.has(name));

    levels.forEach((level) => {
        const frequency = Number(level.descriptiveStatistics.frequency);
        const safeFrequency = Number.isFinite(frequency) ? frequency : 0;

        if (levelNameSet.has(level.nameShort)) {
            covered = true;
            matchedCount += safeFrequency;
            const share = readLevelShare(level.descriptiveStatistics);
            if (share !== null) matchedShare = (matchedShare ?? 0) + share;
        }
    });

    return counted ? { matchedCount, totalCount, covered } : { share: matchedShare ?? 0, covered };
}

/**
 * Report each scale the value groups are measured on that tags no standard band: a
 * standard-based share over it is unknown, not 0 %, and the metric otherwise disappears
 * without a message. A value group whose scale the palette cannot name is reported by its
 * levels.
 *
 * Only a scale tagging no standard band at all is reported. A value group also matches no
 * requested level when its scale tags bands but not the one asked for (`e_high` against a
 * ladder topping out at "Regelstandard plus"), which is no fault of the scale.
 * @param {CompetenceLevelPalette} palette
 * @param {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} valueGroups
 */
function warnUntaggedScales(palette, valueGroups) {
    /** @type {Set<string>} */
    const untagged = new Set();
    for (const valueGroup of valueGroups) {
        const levels = valueGroup.competenceLevels;
        if (levels.length === 0) continue;
        const scaleId = palette.scaleIdOf(valueGroup);
        if (palette.scaleHasStandardBand(levels[0].nameShort, scaleId)) continue;
        untagged.add(scaleId ?? levels.map((level) => level.nameShort).join(', '));
    }
    for (const scale of untagged) {
        console.warn(
            `[slCompetenceShares] The competence scale "${scale}" tags no KMK standard ` +
                '(standardBand:<level id>), so standard-based shares are reported as unknown ' +
                'rather than 0 %.',
        );
    }
}

export { CompetenceShareQueries, competenceLevelShare };

/**
 * SL Data Service — Fetches and provides access to the SL JSON data.
 *
 * Follows the EN pattern: fetch JSON → store in DataStore → views read named
 * collections (`slDataKeys.js`). The flat competence-levels array is discriminated
 * once, by `buildCompetenceLevelIndex` / `getCompetenceLevelIndex`; the filter helpers
 * are implementation, not interface. The derived
 * datasets are built in `slSurveyDerivation.js` (questionnaire scales) and
 * `slResultsDerivation.js` (scored results) and declared here.
 */

import { acquireDataset } from '../common/services/datasetAcquisition.js';
import { SCHOOL_ENDPOINTS } from '../common/services/datasetEndpoints.js';
import { fetchJson, siteUrl } from '../common/services/apiClient.js';
import { SL_DATA_KEYS } from './slDataKeys.js';
import {
    buildCompetenceLevelIndex,
    buildLevelDefinitions,
    hasSurveyRows,
} from '@tba3/modules/sl-domain';
import {
    buildSelfEfficacyByClass,
    buildSelfEfficacySchool,
    buildTeachingQualityByClassSubject,
    buildComparisonSelfEfficacy,
    buildComparisonTeachingQuality,
    detectSurveyScales,
} from './slSurveyDerivation.js';
import {
    buildDomainResultsFromJson,
    buildClassResultsFromJson,
    buildComparisonPoints,
} from './slResultsDerivation.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Where the SL fixture folders and the shared info_boxes.json live (site path). */
const SL_DATA_PATH = 'data/sl/';

/**
 * What SL acquires. No `subject` (a school document bundles every subject) and no
 * items split — SL stores the flat arrays whole and splits at read time via the
 * competence-level index below.
 * @type {import('../common/services/datasetAcquisition.js').DatasetAcquisitionSpec}
 */
const SL_ACQUISITION = {
    endpoints: SCHOOL_ENDPOINTS,
    folderBase: SL_DATA_PATH,
    scaleDocument: 'competence-levels.json',
    storeKeys: {
        'competence-levels.json': SL_DATA_KEYS.COMPETENCE_LEVELS,
        'students_competence-levels.json': SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS,
        'items.json': SL_DATA_KEYS.ITEMS,
        'students_aggregation.json': SL_DATA_KEYS.STUDENTS_AGGREGATION,
        'history.json': SL_DATA_KEYS.LONGITUDINAL_HISTORY,
    },
};

// ============================================================================
// FETCHING
// ============================================================================

/**
 * Fetch core SL JSON data files and populate the DataStore.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The store the fetched documents are written into.
 * @param {{id: string, scope?: string, folder?: string}} dataset - the selected dataset
 *        descriptor (see SL_DATASET_OPTIONS): a school scope on the API, or a fixture
 *        folder under data/sl/.
 */
export async function fetchSlData(dataStore, dataset) {
    // info_boxes.json is not part of the dataset at all — it carries no numbers, only
    // German prose and the placeholders that read them off whichever dataset is loaded,
    // including the competence-scale wording, which used to be typed in and is now
    // `standardBands(...)`. So it stays a repo file for every dataset, API-backed or
    // not, and a missing one is a real failure rather than the tolerated 404 it was
    // while only the `sl` fixture shipped a copy.
    const [, infoBoxes] = await Promise.all([
        acquireDataset(dataset, SL_ACQUISITION, dataStore),
        fetchJson('info_boxes.json', siteUrl(SL_DATA_PATH)),
    ]);

    dataStore.setRawData(SL_DATA_KEYS.INFO_BOXES, infoBoxes);
}

/**
 * Whether the loaded dataset carries any results at all.
 *
 * The API narrows the appended Landesschnitt to the (Fach, Domäne) pairs the school
 * actually sat, and for a school with no scored results that set is empty — every
 * document comes back `[]`, state rows included: a school nobody has scored is not a
 * school anyone opens for its Landesschnitt, so the client explains rather than the
 * server pads. Every
 * view already degrades to its own "Keine Daten" placeholder; this is the one probe the
 * app uses to say *why*, once, above all of them.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The store holding the loaded documents.
 * @returns {boolean} True when the school has any scored results at all.
 */
export function hasSlResults(dataStore) {
    const rows = dataStore.getRawData(SL_DATA_KEYS.COMPETENCE_LEVELS);
    return Array.isArray(rows) && rows.length > 0;
}

/**
 * Declare the derived SL datasets on a DataStore — the one authoritative
 * definition of each dataset's key, inputs, and builder. Consumers ask by name
 * via `getDataset`; asking for an undeclared key throws instead of caching a
 * silently-empty fallback. Registered once per DataStore by SlAppModule (and
 * by unit tests that read these keys).
 *
 * Not declared here: SURVEY_SCALES lives in getSurveyScales(), which must also
 * work without a full DataStore.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The store the definitions are registered on.
 */
export function defineSlDatasets(dataStore) {
    dataStore.defineDatasets({
        [SL_DATA_KEYS.SELF_EFFICACY_BY_CLASS]: {
            inputs: [SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS],
            build: buildSelfEfficacyByClass,
        },
        [SL_DATA_KEYS.SELF_EFFICACY_SCHOOL]: {
            inputs: [SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS],
            build: buildSelfEfficacySchool,
        },
        [SL_DATA_KEYS.TEACHING_QUALITY]: {
            inputs: [SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS],
            build: buildTeachingQualityByClassSubject,
        },
        [SL_DATA_KEYS.LEVEL_DEFINITIONS]: {
            inputs: [SL_DATA_KEYS.COMPETENCE_LEVELS],
            build: buildLevelDefinitions,
        },
        [SL_DATA_KEYS.COMPETENCE_LEVEL_INDEX]: {
            inputs: [SL_DATA_KEYS.COMPETENCE_LEVELS],
            build: buildCompetenceLevelIndex,
        },
        [SL_DATA_KEYS.DOMAIN_RESULTS]: {
            inputs: [
                SL_DATA_KEYS.COMPETENCE_LEVEL_INDEX,
                SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS,
                SL_DATA_KEYS.LEVEL_DEFINITIONS,
            ],
            build: buildDomainResultsFromJson,
        },
        [SL_DATA_KEYS.CLASS_RESULTS]: {
            inputs: [SL_DATA_KEYS.DOMAIN_RESULTS],
            build: buildClassResultsFromJson,
        },
        [SL_DATA_KEYS.COMPARISON_SELF_EFFICACY]: {
            inputs: [SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS],
            build: buildComparisonSelfEfficacy,
        },
        [SL_DATA_KEYS.COMPARISON_TEACHING_QUALITY]: {
            inputs: [SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS],
            build: buildComparisonTeachingQuality,
        },
        [SL_DATA_KEYS.COMPARISON_POINTS]: {
            inputs: [SL_DATA_KEYS.STUDENTS_AGGREGATION],
            build: buildComparisonPoints,
        },
    });
}

/**
 * The {@link CompetenceLevelIndex} over the store's raw competence-levels data.
 *
 * This is the `SL_DATA_KEYS.COMPETENCE_LEVEL_INDEX` dataset that `defineSlDatasets`
 * declares — the catalog entry is the only writer of that cache slot, so the index the
 * `DOMAIN_RESULTS` chain consumes and the one every direct reader gets cannot diverge.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The store holding the loaded documents.
 * @returns {import('@tba3/modules/sl/slCompetenceLevelIndex.js').CompetenceLevelIndex} The indexed payload; empty when the store holds no data.
 */
export function getCompetenceLevelIndex(dataStore) {
    return dataStore.getDataset(SL_DATA_KEYS.COMPETENCE_LEVEL_INDEX);
}

// ============================================================================
// SURVEY SCALE AVAILABILITY
// ============================================================================

/**
 * The dataset's survey scales, computed once per DataStore — the **"ships the scale"**
 * level of the survey gate.
 *
 * "Does this dataset ship survey data" has two honest answers, and both live here so
 * they cannot drift:
 *
 * - **ships the scale** (this function): a student row carries the `tq_mean` /
 *   `sp_mean` *key*. What a per-student table wants — the Materialien tables keep the
 *   column and print an em-dash for a class without a value, because the questionnaire
 *   was asked; only a dataset with no questionnaire at all drops it. Not the Verlauf
 *   cards and their boxplot toggle: they draw from history.json and gate on that
 *   (`detectHistorySurveyScales`).
 * - **has rows** (`getSurveyRows` / `hasSurveyRows`): at least one aggregate row
 *   survived the class/subject builders. What the Klassen & Fächer *columns* want,
 *   and therefore what the Balken/Boxplot switch that only redraws those columns must
 *   ask — a switch standing over columns that were never built is a button that
 *   changes nothing.
 *
 * A payload can ship the key on every student and still parse to no row (no numeric
 * value, no group / subject to bucket by), which is exactly when the two differ.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The store holding the loaded documents.
 * @returns {{hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} Which survey scales the raw payload carries.
 */
export function getSurveyScales(dataStore) {
    return dataStore.getOrCompute(SL_DATA_KEYS.SURVEY_SCALES, () =>
        detectSurveyScales(dataStore.getRawData(SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS)),
    );
}

/**
 * `hasSurveyRows` over the DataStore's derived survey datasets (declared by
 * `defineSlDatasets`; computed lazily, so this is answerable before any view rendered).
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The store holding the derived survey datasets.
 * @returns {{hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} Which of them produced rows.
 */
export function getSurveyRows(dataStore) {
    return hasSurveyRows({
        teachingQuality: dataStore.getDataset(SL_DATA_KEYS.TEACHING_QUALITY),
        selfEfficacyByClass: dataStore.getDataset(SL_DATA_KEYS.SELF_EFFICACY_BY_CLASS),
        selfEfficacySchool: dataStore.getDataset(SL_DATA_KEYS.SELF_EFFICACY_SCHOOL),
    });
}

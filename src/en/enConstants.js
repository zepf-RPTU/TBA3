/**
 * English Module Constants
 * Domain-specific terminology for the EN (English) module.
 *
 * Only static constants live here. Data-derived config (domains, GER levels,
 * style categories, result types, comparison groups) is computed per app
 * instance by `buildEnConfig()` and read via `getEnConfig(dataStore)` — see
 * enConfig.js (the reference implementation) and the constants-mutable-state rule in tools/check-structure.mjs.
 */

// ============================================================================
// API DATA-CONTRACT CONSTANTS
// ============================================================================
// String literals that match API response values.  Centralised here so that
// every consumer references a single definition instead of scattering the
// same magic strings across adapters, charts and tables.

/** Aggregation type for item result categories */
export const AGG_TYPE_RESULT = 'Ergebnis';

// ============================================================================
// DATASTORE KEYS
// ============================================================================
// One name per EN dataset. Raw keys are populated by the acquisition spec in
// enAppModule.js; derived keys are declared by defineEnDatasets() in
// enDatasets.js. The key strings are historical and pinned by stored data —
// note the naming inversion: COMPETENCE_LEVELS holds the per-student
// students_competence-levels.json, COMPETENCE_LEVELS_CLASS the aggregate
// competence-levels.json with the class/school/state rows and cut scores.

export const EN_DATA_KEYS = Object.freeze({
    // Raw payloads (see EN_ACQUISITION storeKeys)
    COMPETENCE_LEVELS: 'en.competenceLevels',
    STYLE_AGGREGATION: 'en.styleAggregation',
    AGGREGATION: 'en.aggregation',
    COMPETENCE_LEVELS_CLASS: 'en.competenceLevelsClass',
    ITEM_AGGREGATION: 'en.itemAggregation',
    ITEMS: 'en.items',

    // Derived datasets (see defineEnDatasets)
    STYLE_AVERAGES: 'en.styleAverages',
    CONFIG: 'en.config',
    STUDENT_RECORDS: 'en.studentRecords',
    ITEM_RECORDS: 'en.itemRecords',
});

/**
 * Default navigation card configuration for EN module
 * @param {Function} navigateCallback - Callback function for navigation (receives viewTarget string)
 * @returns {object} Nav card configuration object
 */
export function getDefaultNavCardConfig(navigateCallback) {
    return {
        items: [
            { icon: 'bar_chart', viewTarget: 'overview', glossarySubKey: 'nav-overview' },
            { icon: 'groups', viewTarget: 'class', glossarySubKey: 'nav-class' },
            { icon: 'list_alt', viewTarget: 'item', glossarySubKey: 'nav-item' },
            { icon: 'person', viewTarget: 'student', glossarySubKey: 'nav-student' },
        ],
        onNavigate: (viewTarget) => navigateCallback(viewTarget),
    };
}

/**
 * Every dataset EN lists: the hand-made fixtures under `data/en/`, each a `folder`.
 *
 * A real class is opened through the `?scope=groups/<id>` escape hatch against a running
 * API instead (src/common/app/classSearchParams.js) — the state exports each ship their
 * own competence-level scale and colors (A1–C1, A1.1/A1.2/…, "k.h.N., KS 1 … KS 5"),
 * which the fixtures do not carry. See src/common/services/datasetAcquisition.js.
 */
export const EN_DATASET_OPTIONS = [
    { id: '8a_mid', label: 'Klasse 8a', folder: '8a_mid' },
    { id: '8b_good', label: 'Klasse 8b', folder: '8b_good' },
    { id: '8c_bad', label: 'Klasse 8c', folder: '8c_bad' },
];

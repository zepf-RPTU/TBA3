/**
 * Mathematics Module Constants
 * Domain-specific terminology for the MA (Mathematics) module
 */

// Layout modes for item and student views
export const LAYOUT_MODES = {
    BOTH: 'both',
    TABLE_ONLY: 'table-only',
    CHART_ONLY: 'chart-only',
};

// Label for the whole-booklet pool (the default "all tasks" selection).
export const MA_ALL_POOL_LABEL = 'Gesamt';

// ============================================================================
// CLASS CONFIGURATION
// ============================================================================

// The VERA-3 fixtures under `data/ma/` (roman `I…V` scale, no cut scores in the payload)
// are the only datasets the dashboard lists. A real VERA-8 Testheft-Gruppe — a whole
// class or an ability-set course, either way the unit one Testheft was handed to, so it
// carries a single Äquivalenztabelle — is opened through the `?scope=groups/<id>`
// escape hatch against a running API (src/common/app/classSearchParams.js).
export const MA_DATASET_OPTIONS = [
    { id: '3a_mid', label: 'Klasse 3a', folder: '3a_mid' },
    { id: '3b_good', label: 'Klasse 3b', folder: '3b_good' },
    { id: '3c_bad', label: 'Klasse 3c', folder: '3c_bad' },
];

// ============================================================================
// DATASTORE KEYS
// ============================================================================

export const MA_DATA_KEYS = {
    // Raw fetched data
    COMPETENCE_LEVELS_CLASS: 'ma.competenceLevelsClass',
    ITEMS: 'ma.items',
    ITEM_AGGREGATION: 'ma.itemAggregation',
    STUDENTS_COMPETENCE_LEVELS: 'ma.studentsCompetenceLevels',
    STUDENTS_AGGREGATION: 'ma.studentsAggregation',
    // Computed records
    STUDENT_RECORDS: 'ma.studentRecords',
    ITEM_RECORDS: 'ma.itemRecords',
    RAW_STUDENT_RECORDS: 'ma.rawStudentRecords',
    // Derived config
    DOMAINS: 'ma.domains',
};

/**
 * Default navigation card configuration for MA welcome view
 * @param {Function} navigateCallback - Callback function for navigation
 * @returns {object} Nav card configuration object
 */
export function getDefaultNavCardConfig(navigateCallback) {
    return {
        items: [
            { glossarySubKey: 'nav-overview', chartClass: 'preview-bars', viewTarget: 'overview' },
            { glossarySubKey: 'nav-class', icon: 'groups', viewTarget: 'class' },
            {
                glossarySubKey: 'nav-item',
                chartClass: 'preview-donut',
                viewTarget: 'item',
                viewMode: 'chart-only',
            },
            {
                glossarySubKey: 'nav-student',
                chartClass: 'preview-donut',
                viewTarget: 'student',
                viewMode: 'chart-only',
            },
        ],
        onNavigate: (viewTarget, viewMode) => {
            navigateCallback(viewTarget, viewMode ? { viewMode } : {});
        },
    };
}

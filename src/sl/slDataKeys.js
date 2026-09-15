/**
 * The DataStore keys every SL module reads by: the raw documents `slDataService`
 * acquires and the derived datasets it declares. A file of its own so a view that
 * only needs a key name does not pull the derivation layer in.
 */

export const SL_DATA_KEYS = {
    /** Raw competence-levels.json (full array, school + class rows) */
    COMPETENCE_LEVELS: 'sl.competenceLevels',
    /** Raw students_competence-levels.json (per-student entries with properties) */
    STUDENTS_COMPETENCE_LEVELS: 'sl.studentsCompetenceLevels',
    /** Raw items.json (school + class-group item success statistics) */
    ITEMS: 'sl.items',
    /** Raw students_aggregation.json (per-student Ergebnis buckets) */
    STUDENTS_AGGREGATION: 'sl.studentsAggregation',
    /** Raw history.json (the Entwicklung view's timeline: one block per Jahrgang) */
    LONGITUDINAL_HISTORY: 'sl.longitudinalHistory',
    /** Raw info_boxes.json (static box content templates for SL views) */
    INFO_BOXES: 'sl.infoBoxes',
    /** Computed: self-efficacy aggregated by class */
    SELF_EFFICACY_BY_CLASS: 'sl.selfEfficacyByClass',
    /** Computed: self-efficacy aggregated for whole school */
    SELF_EFFICACY_SCHOOL: 'sl.selfEfficacySchool',
    /** Computed: teaching quality boxplot stats by class+subject */
    TEACHING_QUALITY: 'sl.teachingQuality',
    /** Computed: competency level definitions per subject+domain */
    LEVEL_DEFINITIONS: 'sl.levelDefinitions',
    /** Computed: flat array of domain results */
    DOMAIN_RESULTS: 'sl.domainResults',
    /** Computed: domain results grouped by class */
    CLASS_RESULTS: 'sl.classResults',
    /** Computed: per-student self-efficacy for group comparison (flat array) */
    COMPARISON_SELF_EFFICACY: 'sl.comparisonSelfEfficacy',
    /** Computed: per-student teaching quality for group comparison (flat array) */
    COMPARISON_TEACHING_QUALITY: 'sl.comparisonTeachingQuality',
    /** Computed: per-student raw point scores for group comparison (flat array) */
    COMPARISON_POINTS: 'sl.comparisonPoints',
    /** Computed: which per-student survey scales the dataset ships */
    SURVEY_SCALES: 'sl.surveyScales',
    /** Computed: the competence-levels payload indexed into named row collections */
    COMPETENCE_LEVEL_INDEX: 'sl.competenceLevelIndex',
};

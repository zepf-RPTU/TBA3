const STUDENTS = 'Schüler:innen';

// Constant domain terms, spelled once so the UI and its exports agree
export const TERM_CONSTANTS = {
    /** The scored unit; an `EXERCISE` holds one or more. */
    SUBTASK: 'Teilaufgabe',
    SUBTASKS: 'Teilaufgaben',
    ITEM_COMPETENCE_LEVEL: 'Aufgabenniveau',
    /** Title of a legend whose entries are bare item levels. */
    ITEM_COMPETENCE_LEVEL_SHORT: 'Niveau',
    DOMAIN: 'Domäne',
    DOMAINS: 'Domänen',
    COMP_LEVEL: 'Kompetenzstufe',
    COMP_LEVELS: 'Kompetenzstufen',
    STUDENT: 'Schüler:in',
    STUDENTS,
    SCHOOL: 'Schule',
    SUBJECT: 'Fach',
    SUBJECTS: 'Fächer',
    /** A Fach, or a Fach with its Domäne: what a bar is of. */
    AREA: 'Bereich',
    AREAS: 'Bereiche',
    SOLUTION_RATE: 'Lösungsquote',
    RATING: 'Bewertung',
    GENDER: 'Geschlecht',
    TRAITS: 'Merkmale',
    /** The task a `SUBTASK` belongs to (`exercise.name`). */
    EXERCISE: 'Aufgabe',
    YEAR: 'Jahr',
    // Tooltip row label: a count names what it counts.
    STUDENT_COUNT: `Anzahl ${STUDENTS}`,
    /** The count on a student's row: the items behind each of the student's results. */
    ITEM_COUNT: 'Anzahl Teilaufgaben',
    SHARE: 'Anteil',
    MEAN: 'Mittelwert',
    /** A chart's average markers (the group's and each comparison's), as its data table heads them. */
    AVERAGES: 'Durchschnitte',
    MEDIAN: 'Median',
    STD_DEV: 'Standardabweichung',
    QUARTILES: 'Q1 / Q3',
    RANGE: 'Min / Max',
    OUTLIERS: 'Ausreißer',
    GROUP: 'Lerngruppe',
    GROUPS: 'Lerngruppen',
    /** The comparison populations a chart draws beside the group, as its key heads them. */
    COMPARISON: 'Vergleich',
    /** The school's own average, as a bar and its pill name it. */
    SCHOOL_AVERAGE: 'Schulschnitt',
    /** A value group as a chart's data table heads its rows: the group or a comparison population. */
    VALUE_GROUP: 'Gruppe',
    /** The measure a card shows, e.g. the share at or above a level. */
    METRIC: 'Kennzahl',
    DIFFERENCE: 'Differenz',
    TEACHING_QUALITY: 'Unterrichtsqualität',
    /** The Unterrichtsqualität measure named with what is rated. */
    TEACHING_QUALITY_MEASURE: 'Unterrichtsqualität (kogn. Aktivierung)',
    SELF_EFFICACY: 'Selbstwirksamkeit',
    BOX_PLOT: 'Boxplot',
    /** The heading of a key block that ties each colour to its measure. */
    LEGEND: 'Legende',
};

/** Axis title of every chart whose value axis is the share of students, in percent. */
export const STUDENT_SHARE_AXIS_TITLE = `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`;

/** Axis title of every chart whose value axis is the share of correct solutions, in percent. */
export const SOLUTION_RATE_AXIS_TITLE = `${TERM_CONSTANTS.SOLUTION_RATE} (%)`;

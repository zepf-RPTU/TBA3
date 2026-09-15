/**
 * The German field vocabulary the Englisch-8 surfaces label with.
 *
 * One frozen map rather than literals at each call site: the same Domäne heading, the
 * same Aufgabenniveau column and the same Stil label have to read identically in a
 * chart, a table and an export, and a reader comparing two of them is comparing the
 * words.
 */

import { TERM_CONSTANTS } from '../common/domain/terms.js';

export const EN_TERMS = Object.freeze({
    // Item / task fields
    ITEM_NUMBER: 'Nr.',
    EXERCISE: 'Aufgabe',
    ITEM_LEVEL: 'Aufgabenniveau',
    STYLES: 'Stile',

    // Person fields
    STUDENT_ID: 'ID',
    LASTNAME: 'Name',
    FIRSTNAME: 'Vorname(n)',
    GENDER: 'Geschlecht',
    TRAITS: 'Merkmale',

    // Person labels
    STUDENT: TERM_CONSTANTS.STUDENT,
    STUDENTS: TERM_CONSTANTS.STUDENTS,

    // Column prefix (composed with a level name, e.g. "GER A2")
    GER_PREFIX: 'GER',
});

/** The payload's own name for the style aggregation, as `aggregations[].type` spells it. */
export const AGG_TYPE_STYLE = 'Hör-/Lesestil';

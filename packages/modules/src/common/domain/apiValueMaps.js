/**
 * The API's own spellings, each named once: the value-group types, `properties` keys,
 * `covariates` types and aggregation types and values the client reads (as the TBA3
 * OpenAPI spec defines them), and the maps from an API value to the label or code the
 * frontend shows, sorts and exports.
 */

/**
 * The value-group `type`s the client names: the group (Lerngruppe), its students, the
 * school, a Landesschnitt and the per-item value groups of an aggregations answer. The spec's
 * `type` is an open string, so a payload may carry others; every reader decides what an
 * unnamed one is (see `isComparisonValueGroup`).
 */
export const VALUE_GROUP_TYPE = Object.freeze({
    GROUP: 'group',
    STUDENT: 'student',
    SCHOOL: 'school',
    STATE: 'state',
    ITEM: 'item',
});

/**
 * API gender covariate value → German display label. Records keep the API value; every
 * surface that prints a gender labels it through this table, in this order.
 * @type {Readonly<{[apiValue: string]: string}>}
 */
export const GENDER_LABELS = Object.freeze({
    male: 'Männlich',
    female: 'Weiblich',
    diverse: 'Divers',
});

/**
 * The display label of a gender code; a code with no entry shows as it is.
 * @param {string} code - The API value (`male` / `female` / `diverse`).
 * @returns {string}
 */
export function genderLabel(code) {
    return GENDER_LABELS[code] ?? code;
}

/**
 * The `properties` keys the client reads off a value group, as the API spells them. The
 * prefixed keys (`levelColor:<id>`, `standardBand:<id>`, `itemLevelSpan:<id>`,
 * `equivalenceTable:<booklet>`) are named beside their one reader.
 */
export const PROPERTY_KEY = Object.freeze({
    TEST_PERIOD: 'testPeriod',
    BOOKLET: 'booklet',
    FIRST_NAME: 'firstName',
    LAST_NAME: 'lastName',
    TEACHING_QUALITY_MEAN: 'tq_mean',
    SELF_EFFICACY_MEAN: 'sp_mean',
});

/**
 * The scale `tq_mean` and `sp_mean` are on, `[min, max]`: each is a student's mean of
 * questionnaire answers on 1–5, so a value outside it is broken data.
 */
export const RATING_DOMAIN = /** @type {[number, number]} */ (Object.freeze([1, 5]));

/** The `covariates` types; `trait` and `homeroom` are named beside their one reader. */
export const COVARIATE_TYPE = Object.freeze({ GENDER: 'gender', GROUP: 'group' });

/** The result aggregation, as `aggregations[].type` spells it. */
export const AGG_TYPE_RESULT = 'result';

/**
 * The style aggregation (Hör-/Lesestil), as `aggregations[].type` spells it; also the
 * `type` of an item's `parameters.competences[]`, which the client joins to it.
 */
export const AGG_TYPE_STYLE = 'style';

/**
 * The result aggregation values, as the API spells them and the tables print them.
 * A reader picks a bucket by value: the spec fixes no order of `aggregations[]`, so
 * position 0 means nothing.
 */
export const RESULT = Object.freeze({
    CORRECT: 'Richtig',
    INCORRECT: 'Falsch',
    NOT_ATTEMPTED: 'Unbearbeitet',
});

/**
 * The numeric result code the item and student records carry: ordered, so a table sorts
 * solved above unsolved above not attempted, and the presets filter by it.
 */
export const RESULT_CODE = Object.freeze({ CORRECT: 1, INCORRECT: 0, NOT_ATTEMPTED: -1 });

/**
 * result aggregation value → result code, in the fixed order Richtig, Falsch,
 * Unbearbeitet.
 * @type {Readonly<{[apiValue: string]: number}>}
 */
export const RESULT_VALUES = Object.freeze({
    [RESULT.CORRECT]: RESULT_CODE.CORRECT,
    [RESULT.INCORRECT]: RESULT_CODE.INCORRECT,
    [RESULT.NOT_ATTEMPTED]: RESULT_CODE.NOT_ATTEMPTED,
});

/**
 * The judging words of the material-page prose ("etwas über", "deutlich heterogen",
 * "besser"), picked from the figures the sentence is about. Every threshold sits in
 * `MATERIAL_PHRASE_THRESHOLDS`.
 */

import { RATING_DOMAIN } from '../../../common/domain/apiValueMaps.js';

/**
 * Where a figure turns from one word into the next. Shares are fractions; survey
 * figures are points on the rating scale.
 */
const MATERIAL_PHRASE_THRESHOLDS = Object.freeze({
    /** Δ Lösungsquote to the Landesmittel: below → "etwas", from here → "deutlich". */
    stateDelta: 0.05,
    /** Spread (max − min) of the groups' Lösungsquote: below the first → "kaum", below the second → "moderat", else "deutlich". */
    groupSpread: Object.freeze([0.1, 0.2]),
    /** Spread (max − min) of the groups' survey means, same three words. */
    surveySpread: Object.freeze([0.3, 0.6]),
    /** Δ Regelstandard share to the year before: within ± this → "gleich". */
    previousYear: 0.02,
});

const SPREAD_WORDS = Object.freeze(['kaum', 'moderat', 'deutlich']);
const HOMOGENEITY_WORDS = Object.freeze(['eher homogen', 'eher heterogen', 'heterogen']);

/**
 * Which third of the rating scale a mean sits in.
 * @param {number} mean
 * @returns {0|1|2} Lower, middle or upper third.
 */
function ratingThird(mean) {
    const [min, max] = RATING_DOMAIN;
    const third = (max - min) / 3;
    return mean < min + third ? 0 : mean < min + 2 * third ? 1 : 2;
}

/**
 * @param {number} spread - max − min.
 * @param {ReadonlyArray<number>} bounds - The two thresholds.
 * @returns {0|1|2} Below the first, below the second, or above.
 */
function spreadStep(spread, [low, high]) {
    return spread < low ? 0 : spread < high ? 1 : 2;
}

/**
 * How far the school sits from the Landesmittel.
 * @param {number} delta - School minus Landesmittel, as a fraction.
 * @returns {'etwas'|'deutlich'}
 */
export function stateDeltaWord(delta) {
    return Math.abs(delta) < MATERIAL_PHRASE_THRESHOLDS.stateDelta ? 'etwas' : 'deutlich';
}

/**
 * How much the groups differ in their Lösungsquote, and what that makes them.
 * @param {number} spread - max − min of the groups' Lösungsquote, as a fraction.
 * @returns {{spread: string, homogeneity: string}} "kaum" … "deutlich" and "eher homogen" … "heterogen".
 */
export function groupSpreadWords(spread) {
    const step = spreadStep(spread, MATERIAL_PHRASE_THRESHOLDS.groupSpread);
    return { spread: SPREAD_WORDS[step], homogeneity: HOMOGENEITY_WORDS[step] };
}

/**
 * How much the groups differ in a survey measure.
 * @param {number} spread - max − min of the groups' means, in scale points.
 * @returns {string} "kaum", "moderat" or "deutlich".
 */
export function surveySpreadWord(spread) {
    return SPREAD_WORDS[spreadStep(spread, MATERIAL_PHRASE_THRESHOLDS.surveySpread)];
}

/**
 * How the students rate the teaching.
 * @param {number} mean - Mean Unterrichtsqualität.
 * @returns {string} "schlecht", "mittelmäßig" or "gut".
 */
export function teachingQualityWord(mean) {
    return ['schlecht', 'mittelmäßig', 'gut'][ratingThird(mean)];
}

/**
 * How strong the students' Selbstwirksamkeit is.
 * @param {number} mean - Mean Selbstwirksamkeit.
 * @returns {string} "gering", "moderat" or "hoch".
 */
export function selfEfficacyWord(mean) {
    return ['gering', 'moderat', 'hoch'][ratingThird(mean)];
}

/**
 * How this year's results compare with the last earlier year with data.
 * @param {number} delta - This year's minus that year's Regelstandard share, as a fraction.
 * @returns {string} "schlechter", "gleich" or "besser".
 */
export function previousYearWord(delta) {
    if (Math.abs(delta) <= MATERIAL_PHRASE_THRESHOLDS.previousYear) return 'gleich';
    return delta > 0 ? 'besser' : 'schlechter';
}

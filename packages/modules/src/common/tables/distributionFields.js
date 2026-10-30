/**
 * The row fields of one Richtig | Falsch | Unbearbeitet distribution, derived from its
 * domain prefix, and the field of the bar drawn from them: the one spelling of these
 * fields, for the rows that carry them and every column that reads them.
 * @param {string} prefix - Domain prefix (`'d0'` → `d0PercentageCorrect`), or `''` for the plain fields.
 * @returns {{bar: string, correct: string, incorrect: string, notAttempted: string, correctCount: string, incorrectCount: string, notAttemptedCount: string}}
 */
export function distributionFields(prefix) {
    /**
     * @param {string} plain - The unprefixed field.
     * @param {string} suffix - The field's suffix after a prefix.
     * @returns {string}
     */
    const field = (plain, suffix) => (prefix ? `${prefix}${suffix}` : plain);
    return {
        // Only the bar column's name: no row holds a value under it.
        bar: field('percentageCombined', 'Percentages'),
        correct: field('percentageCorrect', 'PercentageCorrect'),
        incorrect: field('percentageIncorrect', 'PercentageIncorrect'),
        notAttempted: field('percentageNotAttempted', 'PercentageNotAttempted'),
        correctCount: field('correctCount', 'CorrectCount'),
        incorrectCount: field('incorrectCount', 'IncorrectCount'),
        notAttemptedCount: field('notAttemptedCount', 'NotAttemptedCount'),
    };
}

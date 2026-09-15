import { summarizeRatingValues } from '../../utils/slRatingSummary.js';

/**
 * Headcount behind one Selbstwirksamkeit entry, from its own count or its values.
 * @param {any} entry - A class or school entry.
 * @returns {number} The headcount, `0` when neither is present.
 */
function getEntryCount(entry) {
    if (Number.isFinite(entry?.count)) {
        return entry.count;
    }

    return Array.isArray(entry?.values) ? entry.values.length : 0;
}

/**
 * One entry reduced to the figures an info-box template reads.
 * @param {any} entry - A class or school entry.
 * @returns {object} Its label, headcount and rating statistics.
 */
function summarizeEntry(entry) {
    const values = Array.isArray(entry?.values) ? entry.values : [];
    const ratingSummary = summarizeRatingValues(values, { stats: entry?.statistics ?? null });

    if (!ratingSummary) {
        return null;
    }

    return {
        ...ratingSummary,
        className: typeof entry.className === 'string' ? entry.className : null,
        count: getEntryCount(entry),
    };
}

/**
 * Classes best mean first, with a stable name-based order for ties and for classes
 * without a mean, so a template's "beste Klasse" does not move between renders.
 * @param {Array<object>} [classEntries] - The class summaries.
 * @returns {Array<object>} A sorted copy.
 */
function sortClassesByMean(classEntries = []) {
    return [...classEntries].sort((left, right) => {
        const leftMean = Number.isFinite(left?.mean) ? left.mean : Number.NEGATIVE_INFINITY;
        const rightMean = Number.isFinite(right?.mean) ? right.mean : Number.NEGATIVE_INFINITY;

        if (rightMean !== leftMean) {
            return rightMean - leftMean;
        }

        return String(left?.className ?? '').localeCompare(String(right?.className ?? ''), 'de');
    });
}

/**
 * The Selbstwirksamkeit summary an info box reads: the school's figures plus the classes
 * ranked against them.
 * @param {object} input - The aggregates to summarise.
 * @param {Array<object>} [input.selfEfficacyByClass] - Per-class aggregates.
 * @param {object|null} [input.selfEfficacySchool] - The school aggregate.
 * @returns {object} The summary.
 */
export function buildSelfEfficacyInfoBoxSummary({
    selfEfficacyByClass = [],
    selfEfficacySchool = null,
} = {}) {
    const school = summarizeEntry(selfEfficacySchool);
    const classes = (Array.isArray(selfEfficacyByClass) ? selfEfficacyByClass : [])
        .map((entry) => summarizeEntry(entry))
        .filter(Boolean);

    if (!school && classes.length === 0) {
        return null;
    }

    const sortedClasses = sortClassesByMean(classes);
    const bestClass = sortedClasses[0] ?? null;
    const worstClass = sortedClasses[sortedClasses.length - 1] ?? null;
    const classMeanDifference = bestClass && worstClass ? bestClass.mean - worstClass.mean : null;

    return {
        school,
        bestClass,
        worstClass,
        classMeanDifference,
    };
}

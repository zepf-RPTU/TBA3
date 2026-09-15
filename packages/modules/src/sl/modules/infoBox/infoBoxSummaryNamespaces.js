/**
 * Whether a value is a non-null object, so a missing summary yields `null` rather than
 * a namespace of undefined fields.
 * @param {unknown} value - The value to test.
 * @returns {value is Record<string, any>} True for an object.
 */
function isObject(value) {
    return value !== null && typeof value === 'object';
}

/**
 * A trimmed non-empty string, or nothing.
 * @param {any} value - The raw value.
 * @returns {string|null} The string, or `null` when it carries no text.
 */
function normalizeString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * A real number, or nothing — an unmeasured figure must not reach a template as `NaN`.
 * @param {any} value - The raw value.
 * @returns {number|null} The number, or `null` when it is not finite.
 */
function normalizeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

/**
 * One comparison group, reduced to the fields a template may read.
 * @param {Record<string, any>|null} [group] - The group summary.
 * @param {string|null} [metricMode] - Which measure family it belongs to, which decides the fields that apply.
 * @returns {object|null} The namespace entity, or `null` when there is no group.
 */
function createComparisonEntity(group = null, metricMode = null) {
    if (!isObject(group)) {
        return null;
    }

    let share = null;
    if (metricMode === 'competency') {
        share = normalizeNumber(group.shareGe3);
    } else if (metricMode === 'rating') {
        share = normalizeNumber(group.goodOrExcellentShare);
    }

    return {
        label: normalizeString(group.label),
        n: normalizeNumber(group.n),
        share,
        mean: normalizeNumber(group.mean),
        standardDeviation: normalizeNumber(group.standardDeviation),
        min: normalizeNumber(group.min),
        max: normalizeNumber(group.max),
    };
}

/**
 * One Selbstwirksamkeit entity, reduced to the fields a template may read.
 * @param {Record<string, any>|null} [entity] - The entity summary.
 * @returns {object|null} The namespace entity, or `null` when there is none.
 */
function createSelfEfficacyEntity(entity = null) {
    if (!isObject(entity)) {
        return null;
    }

    return {
        className: normalizeString(entity.className),
        count: normalizeNumber(entity.count),
        mean: normalizeNumber(entity.mean),
        median: normalizeNumber(entity.median),
        excellentShare: normalizeNumber(entity.excellentShare),
        lowOrMediumShare: normalizeNumber(entity.lowOrMediumShare),
        goodOrExcellentShare: normalizeNumber(entity.goodOrExcellentShare),
    };
}

/**
 * The `comparison` namespace an info-box template resolves its placeholders against.
 * @param {Record<string, any>|null} [summary] - The group-comparison summary.
 * @returns {object|null} The namespace, or `null` when there is no summary.
 */
export function buildComparisonInfoBoxSummaryNamespace(summary = null) {
    if (!isObject(summary)) {
        return null;
    }

    const metricMode = normalizeString(summary.metricMode);

    return {
        context: {
            shareLabel: normalizeString(summary.shareLabel),
        },
        entities: {
            group1: createComparisonEntity(summary.group1, metricMode),
            group2: createComparisonEntity(summary.group2, metricMode),
        },
    };
}

/**
 * The `selfEfficacy` namespace an info-box template resolves its placeholders against.
 * @param {Record<string, any>|null} [summary] - The Selbstwirksamkeit summary.
 * @returns {object|null} The namespace, or `null` when there is no summary.
 */
export function buildSelfEfficacyInfoBoxSummaryNamespace(summary = null) {
    if (!isObject(summary)) {
        return null;
    }

    return {
        context: {
            classMeanDifference: normalizeNumber(summary.classMeanDifference),
        },
        entities: {
            school: createSelfEfficacyEntity(summary.school),
            bestClass: createSelfEfficacyEntity(summary.bestClass),
            worstClass: createSelfEfficacyEntity(summary.worstClass),
        },
    };
}

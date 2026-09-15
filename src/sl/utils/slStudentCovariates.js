/**
 * Reading one student row of the SL documents: the class and gender covariates and a
 * numeric property such as `sp_mean`. Shared by every derivation over student rows.
 */

/**
 * Extract a student's class name from their covariates array.
 * @param {Array} covariates - The student entry's covariates.
 * @returns {string|null} The class, or `null` when the entry carries no group covariate.
 */
export function getClassName(covariates) {
    if (!covariates) return null;
    const group = covariates.find((c) => c.type === 'group');
    return group?.value ?? null;
}

/**
 * Extract a student's gender from their covariates array.
 * @param {Array} covariates - The student entry's covariates.
 * @returns {string|null} The gender code, or `null` when the entry carries none.
 */
export function getGender(covariates) {
    return covariates?.find((c) => c.type === 'gender')?.value ?? null;
}

/**
 * Extract a numeric property value from a student entry's properties array.
 * @param {Array} properties - The student entry's properties.
 * @param {string} key - e.g. 'sp_mean'
 * @returns {number|null} The value, or `null` when the entry does not carry that property.
 */
export function getPropertyValue(properties, key) {
    if (!properties) return null;
    const prop = properties.find((p) => p.key === key);
    if (!prop) return null;
    const v = parseFloat(prop.value);
    return isNaN(v) ? null : v;
}

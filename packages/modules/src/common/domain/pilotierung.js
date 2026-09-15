/**
 * Pilotierung helpers — derive the expected solution rate (Pilotierungswert)
 * and its difference to the observed class mean for an item.
 *
 * ASSUMPTION-MA-PILOTIERUNGSWERT: the benchmark field is the first non-null of the three
 * solution-frequency fields, in data order. This yields PrimarySchool for MA
 * (where Gymnasium/NonGymnasium are null) and Gymnasium for EN (where
 * PrimarySchool is null), without branching on subject.
 */

/**
 * Select the Pilotierungswert (0–1) for an item from its parameters.
 * Returns the first non-null of solutionFrequencyGymnasium,
 * solutionFrequencyNonGymnasium, solutionFrequencyPrimarySchool.
 * @param {object} params - item.parameters object
 * @returns {number|null} Expected solution rate (0–1) or null when none is set
 */
export function selectPilotierungswert(params) {
    const candidates = [
        params?.solutionFrequencyGymnasium,
        params?.solutionFrequencyNonGymnasium,
        params?.solutionFrequencyPrimarySchool,
    ];

    for (const value of candidates) {
        if (value != null) return value;
    }

    return null;
}

/**
 * Compute the Pilotierungswert and the difference (in percentage points)
 * between the observed class mean and the expected solution rate.
 * @param {object} params - item.parameters object
 * @param {number} mean - observed class mean solution rate (0–1)
 * @returns {{ pilotierungswert: number|null, pilotierungsDiff: number|null }} The expected solution rate and its distance from the observed mean; both null when the item ships no parameters.
 */
export function computePilotierung(params, mean) {
    const pilotierungswert = selectPilotierungswert(params);
    const pilotierungsDiff =
        pilotierungswert != null ? Math.round((mean - pilotierungswert) * 100) : null;

    return { pilotierungswert, pilotierungsDiff };
}

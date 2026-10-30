/**
 * The expected solution rate of an item (Pilotierungswert) and its difference to the
 * observed group mean.
 *
 * ASSUMPTION-MA-PILOT-SOLUTION-FREQUENCY: the benchmark field is the first present of the three
 * solution-frequency fields, in data order. This yields PrimarySchool for MA
 * (where Gymnasium/NonGymnasium are absent) and Gymnasium for EN (where
 * PrimarySchool is absent), without branching on subject. No document names the school
 * type, so an EN group outside a Gymnasium is benchmarked against the Gymnasium value.
 */

/**
 * The solution-frequency fields of an item's `parameters`.
 * @typedef {object} SolutionFrequencyParameters
 * @property {number} [solutionFrequencyGymnasium] - Piloted solution rate (0–1) at Gymnasien.
 * @property {number} [solutionFrequencyNonGymnasium] - Piloted solution rate (0–1) at other secondary schools.
 * @property {number} [solutionFrequencyPrimarySchool] - Piloted solution rate (0–1) at primary schools.
 */

/**
 * The Pilotierungswert (0–1) of an item: the first present solution-frequency field.
 * @param {SolutionFrequencyParameters} [params] - The item's `parameters`.
 * @returns {number|null} Null when none is set.
 */
function selectPilotSolutionFrequency(params) {
    return (
        params?.solutionFrequencyGymnasium ??
        params?.solutionFrequencyNonGymnasium ??
        params?.solutionFrequencyPrimarySchool ??
        null
    );
}

/**
 * Compute the Pilotierungswert and the difference (in percentage points)
 * between the observed group mean and the expected solution rate.
 * @param {SolutionFrequencyParameters|undefined} params - The item's `parameters`.
 * @param {number} mean - observed group mean solution rate (0–1)
 * @returns {{ pilotSolutionFrequency: number|null, pilotSolutionFrequencyDiff: number|null }} Both null when the item has no benchmark.
 */
export function computePilotSolutionFrequency(params, mean) {
    const pilotSolutionFrequency = selectPilotSolutionFrequency(params);
    const pilotSolutionFrequencyDiff =
        pilotSolutionFrequency === null ? null : Math.round((mean - pilotSolutionFrequency) * 100);

    return { pilotSolutionFrequency, pilotSolutionFrequencyDiff };
}

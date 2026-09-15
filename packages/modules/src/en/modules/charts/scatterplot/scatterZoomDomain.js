/**
 * Scatterplot zoom-domain math — pure helpers for the EN scatterplot's zoom feature.
 *
 * These are the two pure, testable pieces of the zoom cluster: computing the zoomed
 * axis bounds from the plotted values, and deciding whether zoom is even worth offering
 * (data already spans every competency band). The live-D3 parts of zoom — the toggle
 * orchestration, the animated re-render, and the header button — stay on the chart
 * because they mutate the chart's scales and drive its private render helpers.
 */

/**
 * Assemble the per-axis value lists from the plotted points plus whichever averages are
 * present. Comparison-group averages count whenever they are finite (a drawn 0% marker
 * stays in frame); class averages must be strictly > 0 (a 0 class average means "no class
 * data" here). Callers decide which
 * comparison groups to pass: the coverage check passes all of them, the zoom domain only
 * the state-typed ones.
 * @param {Array<{d0Percentage: number, d1Percentage: number}>} scatterplotData - The plotted student points.
 * @param {{domainIds: [string, string], classAverages?: Record<string, number>|null, comparisons?: Array<{domainAverages: Record<string, number>}>}} options - Which two domains map to x and y, and which averages should count as plotted values.
 * @returns {{xValues: number[], yValues: number[]}} Every value that appears on each axis.
 */
function collectAxisValues(scatterplotData, { domainIds, classAverages, comparisons = [] }) {
    const [d0, d1] = domainIds;
    const xValues = scatterplotData.map((d) => d.d0Percentage);
    const yValues = scatterplotData.map((d) => d.d1Percentage);

    if (classAverages?.[d0] && classAverages[d0] > 0) xValues.push(classAverages[d0]);
    if (classAverages?.[d1] && classAverages[d1] > 0) yValues.push(classAverages[d1]);
    for (const group of comparisons) {
        // The marker is drawn for any finite value, 0 included — keep it in frame.
        if (Number.isFinite(group?.domainAverages?.[d0])) xValues.push(group.domainAverages[d0]);
        if (Number.isFinite(group?.domainAverages?.[d1])) yValues.push(group.domainAverages[d1]);
    }

    return { xValues, yValues };
}

/**
 * Zoomed axis bounds: the min/max of the plotted x/y values (student points plus any
 * state/class averages present), padded and clamped to [0, 100].
 * @param {Array<{d0Percentage: number, d1Percentage: number}>} scatterplotData - The plotted student points.
 * @param {{domainIds: [string, string], classAverages?: Record<string, number>|null, comparisons?: Array<{domainAverages: Record<string, number>}>, padding: number}} options - The domains, the averages that should stay in frame, and the breathing room in percentage points.
 * @returns {{xMin: number, xMax: number, yMin: number, yMax: number}} The zoomed axis bounds, clamped to the 0–100 percentage range.
 */
export function calculateZoomDomain(
    scatterplotData,
    { domainIds, classAverages, comparisons, padding },
) {
    // Callers pass only the state-typed groups here — the zoom domain deliberately
    // ignores the Schulschnitt, as it always has.
    const { xValues, yValues } = collectAxisValues(scatterplotData, {
        domainIds,
        classAverages,
        comparisons,
    });

    return {
        xMin: Math.max(0, Math.min(...xValues) - padding),
        xMax: Math.min(100, Math.max(...xValues) + padding),
        yMin: Math.max(0, Math.min(...yValues) - padding),
        yMax: Math.min(100, Math.max(...yValues) + padding),
    };
}

/**
 * Whether every competency-level band is represented by at least one value on each axis
 * independently (student points + all passed averages). When true, zoom would offer no
 * benefit because the data already spans all levels, so the zoom button is suppressed.
 * @param {Array<{d0Percentage: number, d1Percentage: number}>} scatterplotData - The plotted student points.
 * @param {{thresholds: {x: number[], y: number[]}, domainIds: [string, string], classAverages?: Record<string, number>|null, comparisons?: Array<{domainAverages: Record<string, number>}>}} options - The band boundaries per axis, the domains, and every average that counts as coverage.
 * @returns {boolean} True when both axes already show a value in every band; false when either axis has no bands at all.
 */
export function dataCoversAllCompetencyLevels(
    scatterplotData,
    { thresholds, domainIds, classAverages, comparisons },
) {
    if (!thresholds.x.length || !thresholds.y.length) return false;

    // Coverage counts every comparison group (unlike the zoom domain).
    const { xValues, yValues } = collectAxisValues(scatterplotData, {
        domainIds,
        classAverages,
        comparisons,
    });

    const coversAllBands = (values, thresholdList) => {
        const boundaries = [0, ...thresholdList, 100];
        for (let i = 0; i < boundaries.length - 1; i++) {
            const lower = boundaries[i];
            const upper = boundaries[i + 1];
            if (!values.some((v) => v >= lower && v <= upper)) return false;
        }
        return true;
    };

    return coversAllBands(xValues, thresholds.x) && coversAllBands(yValues, thresholds.y);
}

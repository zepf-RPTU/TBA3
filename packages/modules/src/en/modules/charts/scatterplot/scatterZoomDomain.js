/**
 * Scatterplot average and zoom-domain math — the pure half of the EN scatterplot's
 * averages and zoom: which averages are drawn at all, the zoomed axis bounds from the
 * plotted values, and whether zoom is worth offering. The toggle and the domains per
 * state are `scatterZoomController.js`.
 */

import { PERCENT_RANGE } from './scatterplotConstants.js';

/**
 * @typedef {object} DrawnAverages
 * @property {{[domainId: string]: number}|null} groupAverages - The group marker's values, or `null` when it draws none.
 * @property {import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup[]} comparisons - The comparison groups that draw a marker, in payload order.
 */

/**
 * The averages the chart draws a marker for. A comparison group needs a finite value on
 * both axes (a drawn 0 % marker stays); the group needs both above zero, since a 0 group
 * average means "no group data" here. The legend, the markers and the zoom all read
 * this one list.
 * @param {string[]} domainIds - The x-axis domain id, then the y-axis one.
 * @param {{[domainId: string]: number}} groupAverages
 * @param {import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup[]} comparisons
 * @returns {DrawnAverages}
 */
export function selectDrawnAverages([xDomain, yDomain], groupAverages, comparisons) {
    return {
        groupAverages:
            groupAverages[xDomain] > 0 && groupAverages[yDomain] > 0 ? groupAverages : null,
        comparisons: comparisons.filter(
            (group) =>
                Number.isFinite(group.domainAverages[xDomain]) &&
                Number.isFinite(group.domainAverages[yDomain]),
        ),
    };
}

/**
 * Every value on each axis: the plotted points plus every drawn average. Hidden
 * comparison groups count too, so toggling a marker on while zoomed never lands it
 * outside the frame.
 * @param {Array<{xPercentage: number, yPercentage: number}>} scatterplotData
 * @param {{domainIds: string[], averages?: DrawnAverages}} options - `domainIds` names the x domain, then the y one.
 * @returns {{xValues: number[], yValues: number[]}}
 */
function collectAxisValues(scatterplotData, { domainIds: [xDomain, yDomain], averages }) {
    const markers = averages ? averages.comparisons.map((group) => group.domainAverages) : [];
    if (averages?.groupAverages) markers.push(averages.groupAverages);
    const values = [
        ...scatterplotData.map((d) => [d.xPercentage, d.yPercentage]),
        ...markers.map((a) => [a[xDomain], a[yDomain]]),
    ];
    return { xValues: values.map(([x]) => x), yValues: values.map(([, y]) => y) };
}

/**
 * Zoomed axis bounds: the min/max of the plotted x/y values (student points plus every
 * drawn average), padded and clamped to the percent range.
 * @param {Array<{xPercentage: number, yPercentage: number}>} scatterplotData
 * @param {{domainIds: string[], averages?: DrawnAverages, paddingPP: number}} options
 * @returns {{xMin: number, xMax: number, yMin: number, yMax: number}}
 */
export function calculateZoomDomain(scatterplotData, { domainIds, averages, paddingPP }) {
    const { xValues, yValues } = collectAxisValues(scatterplotData, { domainIds, averages });
    const [min, max] = PERCENT_RANGE;

    return {
        xMin: Math.max(min, Math.min(...xValues) - paddingPP),
        xMax: Math.min(max, Math.max(...xValues) + paddingPP),
        yMin: Math.max(min, Math.min(...yValues) - paddingPP),
        yMax: Math.min(max, Math.max(...yValues) + paddingPP),
    };
}

/**
 * Whether every competence-level band is represented by at least one value on each axis
 * independently (student points + drawn averages).
 * @param {Array<{xPercentage: number, yPercentage: number}>} scatterplotData
 * @param {{thresholds: {x: number[], y: number[]}, domainIds: string[], averages?: DrawnAverages}} options
 * @returns {boolean} False when either axis has no bands at all.
 */
export function dataCoversAllCompetenceLevels(
    scatterplotData,
    { thresholds, domainIds, averages },
) {
    if (!thresholds.x.length || !thresholds.y.length) return false;

    const { xValues, yValues } = collectAxisValues(scatterplotData, { domainIds, averages });

    /**
     * @param {number[]} values
     * @param {number[]} thresholdList
     * @returns {boolean}
     */
    const coversAllBands = (values, thresholdList) => {
        const boundaries = [PERCENT_RANGE[0], ...thresholdList, PERCENT_RANGE[1]];
        for (let i = 0; i < boundaries.length - 1; i++) {
            const lower = boundaries[i];
            const upper = boundaries[i + 1];
            if (!values.some((v) => v >= lower && v <= upper)) return false;
        }
        return true;
    };

    return coversAllBands(xValues, thresholds.x) && coversAllBands(yValues, thresholds.y);
}

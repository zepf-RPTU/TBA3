/**
 * The layout maths of the competence detail chart's bars: which bars each group shows,
 * the pitch and gaps that fit them into the plot, and the label clearances those gaps
 * must keep. The clearances are read off the bars as they are placed, with the same
 * centre function the drawn Domäne labels use (`barSpanCenter`). DOM-free.
 */

import { BAR_MAX_THICKNESS_PX } from '../../../../../common/charts/chartDefaults.js';
import {
    BAND_LABEL_GAP_PX,
    LABEL_LINE_HEIGHT_EM,
} from '../../../../../common/charts/chartLabelFit.js';
import { rowHasTeachingQuality } from './competenceDetailData.js';
import { TEACHING_QUALITY_KEY } from '../shared/competencePills.js';
import { barSpanCenter, inDomain } from './competenceDetailLabels.js';
import { subjectDomainKey } from '../../../../utils/slLevelDefinitions.js';

/** Padding ratios of the detail layout: the gap inside a bar's pitch, and each outer edge. */
const DETAIL_PADDING = Object.freeze({
    BAR_PADDING_RATIO: 0.1,
    OUTER_COMPACT: 0.04,
});

/** @typedef {import('./competenceDetailData.js').CompetenceChartRow} CompetenceChartRow */
/** @typedef {import('./competenceDetailLabels.js').DomainLabelLayout} DomainLabelLayout */

/**
 * Which bars the legend leaves on. The first paint draws with every bar on.
 * @typedef {object} BarVisibility
 * @property {(row: CompetenceChartRow) => boolean} row - Whether a row's bar shows.
 * @property {(row: CompetenceChartRow) => boolean} group - Whether the pill that owns a row's x-axis group is on, whatever its slot's.
 * @property {boolean} teachingQuality - Whether the Unterrichtsqualität slots show.
 */

/** @type {BarVisibility} */
export const ALL_VISIBLE = Object.freeze({
    row: () => true,
    group: () => true,
    teachingQuality: true,
});

/** Change in the total label clearance below which the layout counts as settled. */
const CLEARANCE_TOLERANCE_PX = 0.1;
/** Cap on the clearance passes; the gaps settle in a handful, this only bounds a pathological case. */
const MAX_CLEARANCE_PASSES = 10;
/** Narrowest gap between two Domäne labels above the bars. */
const DOMAIN_LABEL_MIN_GAP_PX = 12;

/**
 * What the labels need room for, measured once per render.
 * @typedef {object} LabelSpace
 * @property {Map<string, DomainLabelLayout>} domainLabels - Each Domäne label above the bars, by `subject|domain`.
 * @property {{[groupKey: string]: number}} bottomLabelWidths - Width of each group's label below the axis (a free-text one's longest line).
 */

/**
 * What the layout is solved from; only `BarVisibility` changes between a first paint
 * and a toggle.
 * @typedef {object} BarLayoutInput
 * @property {string[]} xDomain - The x-axis groups in draw order.
 * @property {number} width - Plot width in px.
 * @property {{[groupKey: string]: CompetenceChartRow[]}} groups - Each group's rows, in draw order (`rowsInDrawOrder`).
 * @property {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @property {boolean} hasTeachingQuality - Whether each group reserves a Unterrichtsqualität slot.
 * @property {number} barLabelFontSize - Font size of the in-bar labels, which sets the narrowest a bar may get.
 * @property {LabelSpace|null} labelSpace - What the labels need; `null` for the watermark, which draws none.
 */

/**
 * One visible bar of a group, placed.
 * @typedef {object} PlacedBar
 * @property {string} key - Its sub-scale key.
 * @property {number} x - Its left edge inside the group, in px.
 * @property {CompetenceChartRow|null} row - A row it stands for; `null` for the Unterrichtsqualität slot.
 */

/**
 * The layout of the bars, for one set of visible bars; lengths in px.
 * @typedef {object} BarLayout
 * @property {string[]} groupKeys - The groups with a visible bar, in x-axis order.
 * @property {{[groupKey: string]: {x: number, width: number}}} groupPositions - Each such group's left edge and width.
 * @property {{[groupKey: string]: PlacedBar[]}} groupBars - Each such group's visible bars, in draw order.
 * @property {Map<CompetenceChartRow, number>} rowX - Every visible row's left edge inside its group.
 * @property {number} uniformBarWidth
 * @property {number} barWidthWithPadding - The pitch.
 * @property {number} groupGap - Before any label clearance.
 */

/**
 * The bar width and gaps that follow from one pitch, in px.
 * @typedef {object} BarMetrics
 * @property {number} barWidthWithPadding - The pitch.
 * @property {number} uniformBarWidth
 * @property {number} groupGap
 * @property {number} subgroupGap - Between two clusters of a group.
 */

/**
 * The visible bars of each group, before any width is known.
 * @typedef {object} BarCensus
 * @property {string[]} groupKeys - The groups with a visible bar, in x-axis order.
 * @property {{[groupKey: string]: CompetenceChartRow[]}} visibleRows - Each such group's visible rows.
 * @property {{[groupKey: string]: string[]}} sortedKeys - Each such group's bar keys, in draw order.
 * @property {{[groupKey: string]: Map<string, CompetenceChartRow|null>}} rowsByKey - A row per bar key; `null` for the Unterrichtsqualität slot.
 * @property {{[groupKey: string]: SubgroupGaps}} subgroupGaps - Where each group's subgroup gaps fall.
 * @property {number} effectiveBars - The plot width in pitches: bars plus every gap.
 */

/**
 * The extra room the labels take, in px.
 * @typedef {object} LabelClearance
 * @property {{[groupKey: string]: number}} domainExtraGap - Inside a group, at each Domäne boundary, so its Domäne labels clear each other.
 * @property {{[groupKey: string]: number}} pairExtraGap - After a group so its labels clear the next group's.
 * @property {number} total - The px both take: each group's Domäne clearance at every boundary, and the gaps after the groups.
 */

/**
 * Where a group's subgroup gaps fall, counted in gaps rather than px so the count can
 * size the pitch before the pitch is known.
 * @typedef {object} SubgroupGaps
 * @property {Map<string, number>} gapsBefore - Per bar key the gaps left of it.
 * @property {number} gaps - The group's total.
 * @property {Map<string, number>} splitsBefore - Per bar key the Domäne boundaries left of it.
 * @property {number} splits - The group's Domäne boundaries: one fewer than its visible Domänen.
 */

/**
 * Count a group's subgroup gaps. A gap opens before the Unterrichtsqualität slot, where
 * each further Domäne of a Fach starts, and — grouped by group — where the Fach changes.
 * @param {string[]} keys - The group's bar keys, in draw order.
 * @param {Map<string, CompetenceChartRow|null>} rowByKey - A row per key; `null` for the Unterrichtsqualität slot.
 * @param {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @returns {SubgroupGaps}
 */
function countSubgroupGaps(keys, rowByKey, groupingConfig) {
    /** @type {Map<string, number>} */
    const gapsBefore = new Map();
    /** @type {Map<string, number>} */
    const splitsBefore = new Map();
    let gaps = 0;
    let splits = 0;
    /** @type {string|null} */
    let lastDomain = null;
    /** @type {string|null} */
    let lastSubject = null;

    keys.forEach((key, index) => {
        const row = rowByKey.get(key);
        if (!row) {
            if (index > 0) gaps++;
        } else if (groupingConfig.groupBySubject) {
            if (lastDomain !== null && row.domain !== lastDomain) {
                gaps++;
                splits++;
            }
            lastDomain = row.domain;
        } else if (!groupingConfig.groupByDomain) {
            if (lastSubject !== null && row.subject !== lastSubject) gaps++;
            lastSubject = row.subject;
        }
        gapsBefore.set(key, gaps);
        splitsBefore.set(key, splits);
    });

    return { gapsBefore, gaps, splitsBefore, splits };
}

/**
 * The narrowest a bar's pitch may get: the bar keeps one line of its in-bar label.
 * @param {number} barLabelFontSize
 * @returns {number} Minimum pitch in px.
 */
function minBarPitch(barLabelFontSize) {
    return (barLabelFontSize * LABEL_LINE_HEIGHT_EM) / (1 - DETAIL_PADDING.BAR_PADDING_RATIO);
}

/**
 * The bar metrics that follow from one pitch, capped so a bar is never thicker than
 * `BAR_MAX_THICKNESS_PX`: a wide card with few bars centres them instead of growing slabs.
 * @param {number} pitch - Bar width plus its padding, in px.
 * @returns {BarMetrics}
 */
function metricsForPitch(pitch) {
    const barPadding = DETAIL_PADDING.BAR_PADDING_RATIO;
    pitch = Math.min(pitch, BAR_MAX_THICKNESS_PX / (1 - barPadding));
    return {
        barWidthWithPadding: pitch,
        uniformBarWidth: pitch * (1 - barPadding),
        groupGap: pitch * barPadding * 3,
        subgroupGap: pitch * barPadding,
    };
}

/**
 * The bars of each group a visibility leaves, in draw order, and the gaps between them —
 * everything about the layout that does not depend on the plot width.
 * @param {Omit<BarLayoutInput, 'width'>} input
 * @param {BarVisibility} visibility - Which bars to count; the rest take no room.
 * @returns {BarCensus}
 */
function countBars({ xDomain, groups, groupingConfig, hasTeachingQuality }, visibility) {
    /** @type {BarCensus} */
    const census = {
        groupKeys: [],
        visibleRows: {},
        sortedKeys: {},
        rowsByKey: {},
        subgroupGaps: {},
        effectiveBars: 0,
    };
    let totalBars = 0;
    let totalSubgroupGaps = 0;

    xDomain.forEach((key) => {
        const groupRows = groups[key];
        if (!groupRows) return;

        const rows = groupRows.filter(visibility.row);
        /** @type {Map<string, CompetenceChartRow|null>} In draw order: the slot goes last. */
        const rowByKey = new Map();
        rows.forEach((row) => {
            const subKey = groupingConfig.getSubScaleKey(row);
            if (!rowByKey.has(subKey)) rowByKey.set(subKey, row);
        });
        // Every row of a group shares its group's pill; Q may be the last bar left.
        const hasQuality =
            hasTeachingQuality &&
            visibility.teachingQuality &&
            visibility.group(groupRows[0]) &&
            groupRows.some(rowHasTeachingQuality);
        if (hasQuality) rowByKey.set(TEACHING_QUALITY_KEY, null);
        if (rowByKey.size === 0) return;

        const keys = [...rowByKey.keys()];
        const gaps = countSubgroupGaps(keys, rowByKey, groupingConfig);

        census.groupKeys.push(key);
        census.visibleRows[key] = rows;
        census.sortedKeys[key] = keys;
        census.rowsByKey[key] = rowByKey;
        census.subgroupGaps[key] = gaps;
        totalBars += keys.length;
        totalSubgroupGaps += gaps.gaps;
    });

    const barPadding = DETAIL_PADDING.BAR_PADDING_RATIO;
    census.effectiveBars =
        totalBars +
        totalSubgroupGaps * barPadding +
        Math.max(0, census.groupKeys.length - 1) * barPadding * 3;
    return census;
}

/**
 * A group's width: its bars, its subgroup gaps and its Domäne clearance.
 * @param {BarCensus} census
 * @param {string} key - A visible group.
 * @param {BarMetrics} metrics
 * @param {number} domainExtraGap - Extra px at each Domäne boundary so the labels clear.
 * @returns {number} Width in px.
 */
function groupWidth(census, key, metrics, domainExtraGap) {
    const { gaps, splits } = census.subgroupGaps[key];
    return (
        census.sortedKeys[key].length * metrics.barWidthWithPadding +
        gaps * metrics.subgroupGap +
        splits * domainExtraGap
    );
}

/**
 * Place one group's bars: each at its pitch, past its subgroup gaps, and past the
 * Domäne clearance at every Domäne boundary left of it.
 * @param {BarCensus} census
 * @param {string} key - A visible group.
 * @param {BarMetrics} metrics
 * @param {number} domainExtraGap - Extra px at each of the group's Domäne boundaries.
 * @returns {PlacedBar[]} In draw order.
 */
function placeGroupBars(census, key, metrics, domainExtraGap) {
    const { gapsBefore, splitsBefore } = census.subgroupGaps[key];
    return census.sortedKeys[key].map((subKey, index) => ({
        key: subKey,
        x:
            index * metrics.barWidthWithPadding +
            (gapsBefore.get(subKey) ?? 0) * metrics.subgroupGap +
            (splitsBefore.get(subKey) ?? 0) * domainExtraGap,
        row: census.rowsByKey[key].get(subKey) ?? null,
    }));
}

/**
 * A Fach group's Domäne labels as they would be drawn at these metrics: each one's
 * centre over its Domäne's placed bars, and its measured width.
 * @param {Omit<BarLayoutInput, 'width'>} input
 * @param {BarCensus} census
 * @param {string} key - A visible group.
 * @param {BarMetrics} metrics
 * @param {number} domainExtraGap - The group's Domäne clearance so far.
 * @returns {Array<{centre: number, width: number}>|null} The labels of its visible Domänen, left to right, or `null` unless the group shows several Domänen, each labelled.
 */
function domainLabelSpans(input, census, key, metrics, domainExtraGap) {
    const { groupingConfig, labelSpace } = input;
    if (!groupingConfig.groupBySubject || !labelSpace || census.subgroupGaps[key].splits === 0) {
        return null;
    }
    const bars = placeGroupBars(census, key, metrics, domainExtraGap);
    const spans = groupingConfig.subjectDomainOrder[key]
        .map((domain, index) => ({
            centre: barSpanCenter(bars, metrics.uniformBarWidth, inDomain(groupingConfig, index)),
            width: labelSpace.domainLabels.get(subjectDomainKey(key, domain))?.width,
        }))
        .filter((span) => span.centre !== undefined);
    return spans.every((span) => span.width !== undefined)
        ? /** @type {Array<{centre: number, width: number}>} */ (spans)
        : null;
}

/**
 * The room the labels need at one set of bar metrics: inside each group so its
 * neighbouring Domäne labels clear each other (one clearance at every boundary, the
 * widest any pair needs), and after each group so its labels clear the next group's —
 * above the bars and below the axis alike, one gap serving both rows.
 * @param {Omit<BarLayoutInput, 'width'>} input - Its `labelSpace` is set.
 * @param {BarCensus} census
 * @param {BarMetrics} metrics
 * @returns {LabelClearance}
 */
function measureLabelClearance(input, census, metrics) {
    const { groupKeys } = census;
    const bottomLabelWidths = input.labelSpace?.bottomLabelWidths ?? {};
    /** @type {LabelClearance} */
    const clearance = { domainExtraGap: {}, pairExtraGap: {}, total: 0 };

    groupKeys.forEach((key) => {
        const spans = domainLabelSpans(input, census, key, metrics, 0) ?? [];
        clearance.domainExtraGap[key] = Math.max(
            0,
            ...spans
                .slice(1)
                .map(
                    (right, index) =>
                        (spans[index].width + right.width) / 2 +
                        DOMAIN_LABEL_MIN_GAP_PX -
                        (right.centre - spans[index].centre),
                ),
        );
        clearance.total += clearance.domainExtraGap[key] * census.subgroupGaps[key].splits;
    });

    groupKeys.forEach((key, index) => {
        const nextKey = groupKeys[index + 1];
        if (nextKey === undefined) {
            clearance.pairExtraGap[key] = 0;
            return;
        }
        const width = groupWidth(census, key, metrics, clearance.domainExtraGap[key]);
        const nextWidth = groupWidth(census, nextKey, metrics, clearance.domainExtraGap[nextKey]);
        const bottomLabelGap = Math.max(
            0,
            ((bottomLabelWidths[key] ?? 0) + (bottomLabelWidths[nextKey] ?? 0)) / 2 +
                BAND_LABEL_GAP_PX -
                (width / 2 + metrics.groupGap + nextWidth / 2),
        );
        // The left group's last label reaches past its right edge by its overhang, the
        // next group's first label before its left edge by its own.
        const left = domainLabelSpans(input, census, key, metrics, clearance.domainExtraGap[key]);
        const right = domainLabelSpans(
            input,
            census,
            nextKey,
            metrics,
            clearance.domainExtraGap[nextKey],
        );
        const last = left?.at(-1);
        const domainLabelGap =
            last && right
                ? Math.max(
                      0,
                      last.centre +
                          last.width / 2 -
                          width +
                          (right[0].width / 2 - right[0].centre) +
                          DOMAIN_LABEL_MIN_GAP_PX -
                          metrics.groupGap,
                  )
                : 0;
        clearance.pairExtraGap[key] = Math.max(bottomLabelGap, domainLabelGap);
        clearance.total += clearance.pairExtraGap[key];
    });

    return clearance;
}

/**
 * The narrowest plot in which every bar keeps its readable width and every label its
 * clearance. Worked out before the plot exists, so a renderer can widen the chart and let
 * it scroll rather than squeeze it.
 * @param {Omit<BarLayoutInput, 'width'>} input - Its `labelSpace` is set.
 * @returns {number} Required plot width in px.
 */
export function requiredBarLayoutWidth(input) {
    const census = countBars(input, ALL_VISIBLE);
    const pitch = minBarPitch(input.barLabelFontSize);
    const clearance = measureLabelClearance(input, census, metricsForPitch(pitch));
    return (
        (census.effectiveBars * pitch + clearance.total) / (1 - 2 * DETAIL_PADDING.OUTER_COMPACT)
    );
}

/**
 * Place the bars: group positions, bar widths, gaps. The first paint and every legend
 * toggle both come through here, so a toggle keeps the same subgroup gaps, label
 * clearances and Unterrichtsqualität slot the first paint had.
 * @param {BarLayoutInput} input
 * @param {BarVisibility} visibility - Which bars to lay out; the rest take no room.
 * @returns {BarLayout}
 */
export function computeBarLayout(input, visibility) {
    const census = countBars(input, visibility);
    const { groupKeys, visibleRows, effectiveBars } = census;

    const outerPadding = input.width * DETAIL_PADDING.OUTER_COMPACT;
    const availableWidth = input.width - outerPadding * 2;
    /**
     * @param {number} extraGapWidth - Px the label clearances take out of the width.
     * @returns {BarMetrics} The bar metrics for what is left.
     */
    const computeMetrics = (extraGapWidth) =>
        metricsForPitch(
            effectiveBars > 0 ? Math.max(0, availableWidth - extraGapWidth) / effectiveBars : 0,
        );

    const noGaps = Object.fromEntries(groupKeys.map((key) => [key, 0]));
    /** @type {LabelClearance} */
    let clearance = { domainExtraGap: noGaps, pairExtraGap: noGaps, total: 0 };
    let metrics = computeMetrics(0);

    // The watermark draws no labels, so it keeps no room for them.
    if (input.labelSpace) {
        // Clearance never costs a bar its readable width. A renderer widens the plot to
        // `requiredBarLayoutWidth`, so this only binds on a plot that did not grow — the
        // clearances then shrink together and the labels crowd.
        const maxExtraGap = Math.max(
            0,
            availableWidth - effectiveBars * minBarPitch(input.barLabelFontSize),
        );
        // Every clearance narrows the bars, which moves the labels closer again, so the
        // gaps are re-measured until they settle rather than for a fixed number of passes.
        let previousTotal = -Infinity;
        for (let pass = 0; pass < MAX_CLEARANCE_PASSES; pass++) {
            clearance = measureLabelClearance(input, census, metrics);
            if (clearance.total > maxExtraGap) {
                const scale = maxExtraGap / clearance.total;
                groupKeys.forEach((key) => {
                    clearance.domainExtraGap[key] *= scale;
                    clearance.pairExtraGap[key] *= scale;
                });
                clearance.total = maxExtraGap;
            }
            metrics = computeMetrics(clearance.total);
            if (Math.abs(clearance.total - previousTotal) < CLEARANCE_TOLERANCE_PX) break;
            previousTotal = clearance.total;
        }
    }

    /** @type {BarLayout['groupPositions']} */
    const groupPositions = {};
    /** @type {BarLayout['groupBars']} */
    const groupBars = {};
    /** @type {Map<CompetenceChartRow, number>} */
    const rowX = new Map();
    let cursor = outerPadding;

    groupKeys.forEach((key, index) => {
        const extraGap = clearance.domainExtraGap[key];
        const bars = placeGroupBars(census, key, metrics, extraGap);
        const xByKey = new Map(bars.map((bar) => [bar.key, bar.x]));
        visibleRows[key].forEach((row) => {
            rowX.set(
                row,
                /** @type {number} */ (xByKey.get(input.groupingConfig.getSubScaleKey(row))),
            );
        });

        groupBars[key] = bars;
        groupPositions[key] = { x: cursor, width: groupWidth(census, key, metrics, extraGap) };
        cursor += groupPositions[key].width;
        if (index < groupKeys.length - 1) {
            cursor += metrics.groupGap + clearance.pairExtraGap[key];
        }
    });
    // Capped bars may leave the plot wider than they need: the groups sit centred in it.
    const centring = Math.max(0, availableWidth - (cursor - outerPadding)) / 2;
    groupKeys.forEach((key) => {
        groupPositions[key].x += centring;
    });

    return {
        groupKeys,
        groupPositions,
        groupBars,
        rowX,
        uniformBarWidth: metrics.uniformBarWidth,
        barWidthWithPadding: metrics.barWidthWithPadding,
        groupGap: metrics.groupGap,
    };
}

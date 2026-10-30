/**
 * The Kompetenzstufen distribution of the group and its comparison groups as stacked
 * bars, standing or lying. The groups drawn follow the shared comparison state
 * (`activeModes`); a segment click reports its level to `onLevelClicked`, whose owner
 * decides which levels are highlighted.
 */

import { createState } from '@tba3/module-base';
import { signal } from '@preact/signals-core';
import { ChartRenderer } from '../renderers/chartRenderer.js';
import { createSVGStackedBar, joinStackedBarRows } from '../renderers/stackedBarBuilder.js';
import { STUDENT_SHARE_AXIS_TITLE, TERM_CONSTANTS } from '../../domain/terms.js';
import {
    averageRoleGlossaryKey,
    isComparisonValueGroup,
} from '../../domain/comparisonGroupLabels.js';
import { GLOSSARY_KEYS } from '../../glossary/glossaryKeys.js';
import { getCompetenceColor } from '../../services/themeService.js';
import { parseCompetenceLevels, toStackedChartData } from '../../domain/competenceLevelAdapter.js';
import { buildStackedSegments, levelShareLabelFormatter } from '../../utils/stackedBarUtils.js';
import * as d3 from 'd3';
import { shareRows } from '../shareRows.js';
import { figureCell, shareCountCell, shareCountColumns } from '../dataTableCells.js';
import { AXIS_DEFAULTS, bandBar } from '../chartDefaults.js';
import {
    drawNameAxis,
    lyingSlot,
    measureBandFrame,
    paddedBandScale,
    percentValueAxis,
    standingSlot,
} from '../bandChartFrame.js';
import { selectOrAppend } from '../selectOrAppend.js';
import { appendGridLines, axisGroupClass, createPercentAxis } from '../chartAxisUtils.js';
import { splitLabelLines } from '../chartLabelFit.js';
import { formatCount } from '../../utils/numberFormat.js';

/** @typedef {ReturnType<typeof toStackedChartData>[number]} CompetenceLevelStackedRow */

/**
 * What the chart draws from, as signals.
 * @typedef {object} CompetenceLevelDistributionState
 * @property {boolean|null} isHorizontal - The set orientation, or `null` for the orientation rule's.
 * @property {string[]} highlightedLevels - Empty for none.
 */

/**
 * What the configs hand the chart.
 * @typedef {object} CompetenceLevelDistributionChartOptions
 * @property {import('../../data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} [apiData] - The competence-level value groups, comparison groups included; the levels come from them alone.
 * @property {'left'|'right'} [valueSide] - The percent axis's side while the bars stand; `left` by default.
 * @property {boolean|null|import('@preact/signals-core').Signal<boolean|null>} [isHorizontal] - Lay the bars down (groups down the left, percent along the bottom), or stand them up; `null` or absent leaves it to the orientation rule (`isHorizontal`). A host's signal is shared: a write to it redraws the chart.
 * @property {string[]|import('@preact/signals-core').Signal<string[]>} [highlightedLevels] - A host's signal is shared, so a write to it redraws the chart.
 * @property {(level: string) => void} [onLevelClicked] - Called with the level of a clicked segment; the owner decides what the click selects. Without it the segments are not clickable.
 */

/**
 * One bar segment of a competence-level distribution, carrying its group's headcount for the tooltip.
 * @typedef {import('../../utils/stackedBarUtils.js').StackedSegment & {rowLabel: string, count: number, total: number}} CompetenceLevelDistributionSegment
 */

/**
 * The bars sit on a band scale keyed by group name, so two value groups sharing a name
 * would be drawn over each other under a single label: throw instead.
 * @param {string[]} rowLabels - The parsed rows' labels, in payload order.
 */
function assertDistinctRowLabels(rowLabels) {
    const duplicate = rowLabels.find((name, index) => rowLabels.indexOf(name) !== index);
    if (duplicate !== undefined) {
        throw new Error(
            `competence-level distribution: two value groups are both named '${duplicate}'; each bar needs a name of its own.`,
        );
    }
}

/**
 * The glossary term a group's axis label links to, by the row's `type`: the group's own
 * row is the Lerngruppenschnitt, a comparison row takes its role's term, and a
 * population the glossary has no term for gets none.
 * @param {{type: string}} row
 * @returns {string|null}
 */
function rowGlossaryKey(row) {
    return isComparisonValueGroup(row)
        ? averageRoleGlossaryKey(row.type)
        : GLOSSARY_KEYS.LERNGRUPPENSCHNITT;
}

/** The gap between the bands, as a share of each step, inside and at both ends. */
const COMPETENCE_LEVEL_BAND_PADDING_RATIO = 0.1;

/** @augments ChartRenderer */
export class CompetenceLevelDistributionChart extends ChartRenderer {
    /** @type {string[]} The level vocabulary the payload carries, in scale order. */
    levels;
    /** @type {CompetenceLevelStackedRow[]} One row per value group, in payload order; fixed for the renderer's life. */
    rows;
    /** @type {import('@preact/signals-core').Signal<boolean|null>} The orientation the last pass drew in; `null` before one. */
    #drawnHorizontal = signal(null);

    /**
     * @param {HTMLElement} container
     * @param {import('../renderers/chartRenderer.js').ChartRendererOptions & CompetenceLevelDistributionChartOptions} options
     */
    constructor(container, options) {
        super(container, {
            // Half the `100 %` tick's height overhangs the plot's top edge.
            layout: { padding: { top: 10 } },
            // The key over the plot names the levels.
            legend: 'top',
            ...options,
        });

        const { levels, groups } = parseCompetenceLevels(
            options.context.palette,
            options.apiData ?? [],
        );
        assertDistinctRowLabels(groups.map((group) => group.name));
        this.levels = levels;
        this.rows = toStackedChartData(groups, levels);
        // A comparison row is laid out with the bars, so a toggle redraws the chart.
        this.setComparisonModes(
            this.rows
                .filter(isComparisonValueGroup)
                .map((row) => ({ id: row.id, name: row.label })),
            { onToggle: 'redraw' },
        );

        /** @type {import('@tba3/module-base').State<CompetenceLevelDistributionState>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<CompetenceLevelDistributionState>} */ ({
                isHorizontal: options.isHorizontal ?? null,
                highlightedLevels: options.highlightedLevels ?? [],
            }),
        );
    }

    /**
     * Current orientation: the one set in `state.isHorizontal`, which the next pass draws
     * in even while the chart is hidden (a collapsed card), else the one the last pass
     * drew in, else the orientation rule's. The rule judges the container, so a draw
     * after a resize can flip it; a header control reading this re-renders on a flip only.
     * @returns {boolean}
     */
    get isHorizontal() {
        return (
            this.state.isHorizontal.value ?? this.#drawnHorizontal.value ?? this.#lyingSuitsNames()
        );
    }

    /**
     * The orientation rule: the groups lie down when their names would not fit under
     * standing bars, even wrapped over two lines, but do fit beside their lying rows;
     * otherwise the bars stand. Judged on every group the payload carries, so a
     * comparison toggle never flips the chart, and against the slots either chart would
     * give a name (`standingSlot`, `lyingSlot`).
     * @param {import('../bandChartFrame.js').BandFrameSpec} [frame] - The frame, when the pass already built it.
     * @param {{[side: string]: number}} [standing] - The standing frame's axis space, when the pass already measured it.
     * @param {() => {[side: string]: number}} [lying] - The lying frame's axis space, measured on demand: only names that do not stand need it.
     * @returns {boolean}
     */
    #lyingSuitsNames(
        frame = this.#frame(),
        standing = measureBandFrame(this, false, frame),
        lying = () => measureBandFrame(this, true, frame),
    ) {
        if (this.rows.length === 0) return false;
        // The standing frame's bottom is the names' block over the axis's tick padding.
        const nameBlockHeight = standing.bottom - AXIS_DEFAULTS.tickPaddingPx;
        return (
            this.#categoryLabelWidth() >
                standingSlot(this, frame, COMPETENCE_LEVEL_BAND_PADDING_RATIO, standing) &&
            nameBlockHeight <= lyingSlot(this, frame, COMPETENCE_LEVEL_BAND_PADDING_RATIO, lying())
        );
    }

    /**
     * The chart's band frame: every group's name, and the titled percent axis.
     * @returns {import('../bandChartFrame.js').BandFrameSpec & {valueSide: 'left'|'right'}}
     */
    #frame() {
        return {
            names: this.rows.map((row) => row.label),
            valueSide: this.options.valueSide ?? 'left',
            ...percentValueAxis(this),
        };
    }

    /**
     * The rows drawn: the group's own always and first, then each comparison row while
     * its id is active, in payload order. `null` (a host with no comparison state)
     * draws every row.
     * @returns {CompetenceLevelStackedRow[]}
     */
    #visibleRows() {
        const { activeModes } = this;
        const comparisons = this.rows.filter(
            (row) =>
                isComparisonValueGroup(row) &&
                (activeModes === null || activeModes.includes(row.id)),
        );
        return [...this.rows.filter((row) => !isComparisonValueGroup(row)), ...comparisons];
    }

    /** @override */
    validateData() {
        return this.rows.length > 0;
    }

    /**
     * The segment's level, share and headcount. The count is the group's own
     * `frequency` for the level, not an estimate from the share.
     * @override
     * @param {CompetenceLevelDistributionSegment} segment - The segment, carrying its group's `count` and `total`.
     * @returns {import('../../services/cursorTooltip.js').TooltipContent}
     */
    formatTooltipContent(segment) {
        return {
            title: segment.rowLabel,
            rows: shareRows({
                label: TERM_CONSTANTS.COMP_LEVEL,
                value: segment.label,
                share: segment.percentage,
                count: segment.count,
                total: segment.total,
            }),
        };
    }

    /**
     * The bars drawn, as a table: one row per group, its headcount, and per level the
     * share with its headcount (`15,4 % (4)`), which export as two numbers. A group
     * without a headcount shows and exports its shares alone, as its tooltip does
     * (`shareRows`); a counted group of nobody shows none.
     * @override
     * @returns {import('../host/chartDataTable.js').ChartDataTable|null} `null` while a message stands in for the bars.
     */
    dataTable() {
        if (!this.validateData()) return null;
        return {
            columns: [{ label: TERM_CONSTANTS.VALUE_GROUP }, ...shareCountColumns(this.levels)],
            rows: this.#visibleRows().map((row) => {
                const counted = row.total > 0;
                // A counted group of nobody has no share (`readLevelShare`): 0 % would read
                // as a measured result.
                const measured = this.levels.some((level) => row[level] > 0);
                return [
                    { text: row.label },
                    figureCell(counted ? row.total : null, formatCount),
                    ...this.levels.map((level) =>
                        shareCountCell(
                            measured ? row[level] : null,
                            counted ? (row.counts[level] ?? 0) : null,
                        ),
                    ),
                ];
            }),
        };
    }

    /**
     * The level key over the plot: one chip per level, in scale order. A segment too
     * narrow for its `Level · share` label is told by its colour alone, so the colours
     * need a key.
     * @override
     * @returns {import('../legend/htmlLegendPanel.js').ChartKey|null}
     */
    chartKey() {
        return [
            {
                items: this.levels.map((level) => ({
                    label: level,
                    symbol: 'rect',
                    color: getCompetenceColor(this.context.palette, level),
                })),
            },
        ];
    }

    /** @override */
    renderChart() {
        const frame = this.#frame();
        // The set orientation, else the rule's. Each frame is measured at most once: the
        // rule weighs it, and the pass draws the one it picks.
        const set = this.state.isHorizontal.value;
        /** @type {{[side: string]: number}|undefined} */
        let lyingAxes;
        const lying = () => (lyingAxes ??= measureBandFrame(this, true, frame));
        const standing = set === true ? undefined : measureBandFrame(this, false, frame);
        const isHorizontal = set ?? this.#lyingSuitsNames(frame, standing, lying);
        this.#drawnHorizontal.value = isHorizontal;
        const { g, layout } = this.initializeSVG(isHorizontal || !standing ? lying() : standing);
        const { chart } = layout;
        const rows = this.#visibleRows();

        const bands = paddedBandScale(
            rows.map((row) => row.label),
            isHorizontal ? chart.height : chart.width,
            COMPETENCE_LEVEL_BAND_PADDING_RATIO,
        );
        const percentScale = d3
            .scaleLinear()
            .domain([0, 100])
            .range(isHorizontal ? [0, chart.width] : [chart.height, 0]);

        this.#createAxes(g, bands, percentScale, chart, isHorizontal, frame.valueSide);
        this.#drawBars(g, rows, bands, percentScale, isHorizontal);
    }

    /**
     * The width a group name's widest line takes: what a side category axis reserves
     * for its labels and fits them into. Every group the payload carries is measured,
     * so a comparison toggle does not shift the plot.
     * @returns {number} In px.
     */
    #categoryLabelWidth() {
        return this.measureTexts(this.rows.flatMap((row) => splitLabelLines(row.label))).maxWidth;
    }

    /**
     * Draw the percent axis with its gridlines and title, and the group axis with its
     * names wrapped, fitted and linked to their glossary terms. The grid and the axes
     * sit behind the bars, in groups the first draw makes before them.
     *
     * The axis groups join by side, not by role, as a group must keep its side (see
     * `appendAxisGroup`). An orientation switch hands the bottom group from one axis to
     * the other, and a side no axis takes any more leaves.
     * @param {d3.Selection<SVGGElement, unknown, null, undefined>} g - The plot group.
     * @param {d3.ScaleBand<string>} bandScale
     * @param {d3.ScaleLinear<number, number>} percentScale - The 0–100 % scale.
     * @param {import('../renderers/chartRenderer.js').LayoutRect} chart - The plot rectangle.
     * @param {boolean} isHorizontal - Whether the bars lie.
     * @param {'left'|'right'} valueSide - The percent axis's side while the bars stand.
     */
    #createAxes(g, bandScale, percentScale, chart, isHorizontal, valueSide) {
        const percentSide = isHorizontal ? 'bottom' : valueSide;
        const categorySide = isHorizontal ? 'left' : 'bottom';
        const percentAxis = createPercentAxis(percentSide, percentScale);
        appendGridLines(g, percentSide, percentAxis, isHorizontal ? chart.height : chart.width);

        /** @type {{[side: string]: string|null}} */
        const offset = {
            left: null,
            right: `translate(${chart.width},0)`,
            bottom: `translate(0,${chart.height})`,
        };
        /** @type {Array<{side: string, baseline: boolean}>} */
        const axes = [
            { side: percentSide, baseline: false },
            { side: categorySide, baseline: true },
        ];
        /** @type {d3.Selection<SVGGElement, (typeof axes)[number], SVGGElement, unknown>} */
        const existing = selectOrAppend(g, 'g', 'competence-level-axes').selectChildren(
            'g.chart-axis',
        );
        const groups = existing
            .data(axes, (axis) => axis.side)
            .join((enter) => enter.append('g'))
            .attr('class', ({ side, baseline }) =>
                axisGroupClass(`competence-level-axis--${side}`, { baseline }),
            )
            .attr('transform', ({ side }) => offset[side])
            .order();
        groups.filter(({ side }) => side === percentSide).call(percentAxis);
        const categoryGroup = groups.filter(({ side }) => side === categorySide);
        drawNameAxis(this, categoryGroup, bandScale, { horizontal: isHorizontal });

        // A tick reused for another group takes that group's term, or none.
        const rowByName = new Map(this.rows.map((row) => [row.label, row]));
        categoryGroup.selectAll('.tick text').each((name, i, nodes) => {
            const row = /** @type {CompetenceLevelStackedRow} */ (
                rowByName.get(/** @type {string} */ (name))
            );
            this.context.glossary.stampGlossaryAttr(d3.select(nodes[i]), rowGlossaryKey(row));
        });

        // One title, which moves to the percent axis's side.
        this.renderAxisTitle(g, percentSide, STUDENT_SHARE_AXIS_TITLE, { key: 'percent' });
    }

    /**
     * Draw one stacked bar per row, each on its group's band. The bars join by group id
     * and their segments by level, so a redraw moves the bars already drawn (a toggled
     * group, a resize, the other orientation) and a focused segment keeps its focus. A
     * state change animates the move (`drawDurationMs`); a group toggled off fades out, one
     * toggled on appears in its place.
     * @param {d3.Selection<SVGGElement, unknown, null, undefined>} g - The plot group.
     * @param {CompetenceLevelStackedRow[]} rows
     * @param {d3.ScaleBand<string>} bandScale
     * @param {d3.ScaleLinear<number, number>} percentScale - The 0–100 % scale.
     * @param {boolean} isHorizontal - Whether the bars lie.
     */
    #drawBars(g, rows, bandScale, percentScale, isHorizontal) {
        const durationMs = this.drawDurationMs;
        const { onLevelClicked } = this.options;
        /** @type {import('../renderers/stackedBarBuilder.js').StackedBarTooltip<CompetenceLevelDistributionSegment>} */
        const tooltip = {
            getTooltipContent: (segment) => this.formatTooltipContent(segment),
            onClick: onLevelClicked ? (segment) => onLevelClicked(segment.field) : null,
        };
        // A few groups in a wide card would make blocks: each bar is capped and centred.
        const slot = bandBar(bandScale);
        /** @type {(row: CompetenceLevelStackedRow) => string} */
        const place = (row) => {
            const at = /** @type {number} */ (bandScale(row.label)) + slot.offset;
            return isHorizontal ? `translate(0,${at})` : `translate(${at},0)`;
        };

        joinStackedBarRows(selectOrAppend(g, 'g', 'competence-level-bars'), rows, {
            key: (row) => row.id,
            place,
            durationMs,
            draw: (bar, row) => {
                const segments = /** @type {CompetenceLevelDistributionSegment[]} */ (
                    buildStackedSegments(this.context.palette, row, this.levels, {
                        counts: row.counts,
                        total: row.total,
                    }).map((segment) => ({ ...segment, rowLabel: row.label }))
                );

                createSVGStackedBar(
                    bar,
                    segments,
                    {
                        isHorizontal,
                        xScale: isHorizontal ? percentScale : null,
                        yScale: isHorizontal ? null : percentScale,
                        barSizePx: slot.size,
                        // Only the group's own bar takes the highlight.
                        highlightedKeys: isComparisonValueGroup(row)
                            ? []
                            : this.state.highlightedLevels.value,
                        // Its click toggles the same levels, so it says which are on.
                        pressedKeys: this.state.highlightedLevels.value,
                        showLabels: true,
                        labelFormatter: levelShareLabelFormatter,
                        tooltip,
                        durationMs,
                    },
                    this,
                );
            },
        });
    }
}

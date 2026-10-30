/**
 * Horizontal lollipops of the EN style-category results, for the group and one student:
 * one band per style, holding one domain's row or both, each tagged with its domain's
 * letter. Every pass joins into the drawn chart, so a table sync, a mode or student switch
 * and a resize move the rows already drawn, and a domain's rows coming or going fade; the
 * rows, geometry and legend live in the sibling styleLollipopData, styleLollipopLayout and
 * styleLollipopLegend modules.
 */

import { animate, fadeOutAndRemove, takeBack } from '../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { joinLollipopHits } from '../../../../common/charts/renderers/lollipopMarks.js';
import { joinComparisonMarkers } from '../../../../common/charts/averageMarkers.js';
import { MARK_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import {
    appendAxisGroup,
    appendPercentAxis,
    createCategoryAxis,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { SOLUTION_RATE_AXIS_TITLE } from '../../../../common/domain/terms.js';
import {
    comparisonSeriesLabel,
    comparisonTooltipRows,
    visibleComparisonGroups,
} from '../../../../common/charts/comparisonSeries.js';
import { figureCell, percentColumn } from '../../../../common/charts/dataTableCells.js';
import { EN_TERMS } from '../../../enTerms.js';
import { createState } from '@tba3/module-base';
import * as d3 from 'd3';
import { formatPercent } from '../../../../common/utils/numberFormat.js';
import { buildRows } from './styleLollipopData.js';
import { buildDomainStyles } from './styleDomainStyles.js';
import {
    CHART_CONFIG,
    computeMinChartHeight,
    resolveStyleBandScales,
} from './styleLollipopLayout.js';
import { buildLegendItems } from './styleLollipopLegend.js';
import { applyChartTextSize } from '../../../../common/charts/chartTypography.js';
import { fontWeightToken } from '../../../../common/utils/fontTokens.js';
import { styleValueLabels, valueLabelFont } from '../../../../common/charts/chartValueLabels.js';
import { valueLabelInk } from '../../../../common/services/paletteTokens.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { asDataMark } from '../../../../common/services/dataMark.js';

/** @typedef {import('./styleLollipopData.js').StyleLollipopRow} StyleLollipopRow */
/** @typedef {import('../../../utils/enStyleAggregationAdapter.js').ParsedStyleAggregation} ParsedStyleAggregation */
/** @typedef {d3.Selection<SVGGElement, unknown, any, any>} PlotGroup */
/** @typedef {(d: StyleLollipopRow) => number} RowPosition */

/**
 * @typedef {object} StyleLollipopChartOptions
 * @property {import('./styleDomainStyles.js').StyleChartEnConfig} enConfig - Exactly two domains.
 * @property {string|import('@preact/signals-core').Signal<string>} mode - `all` for both domains grouped per style, else the domain drawn; the host's signal, shared.
 * @property {ParsedStyleAggregation|import('@preact/signals-core').Signal<ParsedStyleAggregation>} styleAverages - The resolved averages: filtered group values over the group-level parse; the host's signal, shared.
 * @property {{[key: string]: number|null}|null|import('@preact/signals-core').Signal<{[key: string]: number|null}|null>} studentValues - The selected student's value per `${domain}_${style}` key, or `null` when no student is selected; the host's signal, shared.
 * @property {(minHeightPx: number) => void} [onMinHeight] - Told the height (plot area and key) below which the rows no longer fit their own minimum size, when a measure finds it changed and before the pass draws: the box is measured again after the call, so a card it grows is drawn grown.
 * @property {import('../../../../common/charts/comparisonState.js').ComparisonStateReader|null} [comparisonState]
 */

/**
 * @typedef {{mode: string, styleAverages: ParsedStyleAggregation, studentValues: {[key: string]: number|null}|null}} StyleLollipopState
 */

/**
 * The measured value-pill geometry; its corner radius is half its height.
 * @typedef {{width: number, height: number, rightReserve: number}} HeadSize
 */

/** The transition the rows, pills, tags and markers move and fade in. */
const MAIN = 'style-elements';

/**
 * One mark per row, joined by row key in `layer`: a new row's mark fades in at its place, a
 * kept one moves there (and shows again when it was leaving), a leaving one fades out.
 * @template {SVGElement} E
 * @param {PlotGroup} layer
 * @param {string} tag - The mark's element name.
 * @param {string} className - The class the join selects on; each mark also carries its domain's.
 * @param {StyleLollipopRow[]} data
 * @param {(sel: d3.Selection<E, StyleLollipopRow, any, any>) => unknown} place - Sets the geometry, on the entered selection or the update's transition (`animate` types it as a selection).
 * @param {number} durationMs
 * @returns {d3.Selection<E, StyleLollipopRow, SVGGElement, unknown>} The marks, for their paint.
 */
function joinFading(layer, tag, className, data, place, durationMs) {
    const marks = /** @type {d3.Selection<E, StyleLollipopRow, SVGGElement, unknown>} */ (
        layer.selectChildren(`.${className}`)
    );
    return marks
        .data(data, (d) => d.key)
        .join(
            (enter) => {
                const entered =
                    /** @type {d3.Selection<E, StyleLollipopRow, SVGGElement, unknown>} */ (
                        /** @type {unknown} */ (enter.append(tag))
                    ).attr('class', (d) => `${className} ${d.domainKey}`);
                place(entered);
                animate(entered.style('opacity', 0), { durationMs, name: MAIN }).style(
                    'opacity',
                    1,
                );
                return entered;
            },
            (update) => {
                place(
                    animate(takeBack(update, MAIN), { durationMs, name: MAIN }).style('opacity', 1),
                );
                return update;
            },
            (exit) => fadeOutAndRemove(exit, MAIN, durationMs),
        );
}

export class StyleLollipopChart extends ChartRenderer {
    /** @type {d3.ScaleBand<string>} The style bands; set by `renderChart()` before any read. */
    yScale = d3.scaleBand();
    /** @type {d3.ScaleBand<string>} The drawn domains within a style band; set by `renderChart()` before any read. */
    yScaleInner = d3.scaleBand();
    /** @type {d3.ScaleLinear<number, number>} Set by `renderChart()` before any read. */
    xScale = d3.scaleLinear();
    /** @type {{[domainId: string]: import('./styleDomainStyles.js').DomainStyle}} They follow the immutable EN config alone. */
    domainStyles;
    /** @type {number|null} The minimum height last reported to `onMinHeight`. */
    #reportedMinHeight = null;

    /**
     * @param {HTMLElement} container
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & StyleLollipopChartOptions} options
     */
    constructor(container, options) {
        super(container, {
            legend: 'top',
            ...options,
            layout: {
                padding: {
                    top: CHART_CONFIG.LAYOUT.TOP_PADDING_PX,
                    right: 20,
                },
            },
        });

        /** @type {import('@tba3/module-base').State<StyleLollipopState>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<StyleLollipopState>} */ ({
                mode: options.mode,
                styleAverages: options.styleAverages,
                studentValues: options.studentValues,
            }),
        );
        this.enConfig = options.enConfig;
        this.domainStyles = buildDomainStyles(this.enConfig, this.context.glossary);

        // The group series is always drawn; only the comparison groups toggle.
        this.setComparisonModes(this.comparisonGroups);
    }

    /**
     * The averages drawn, already resolved: filtered group values where the table
     * supplied them, over the group-level parse. Reactive (`state.styleAverages`).
     * @returns {ParsedStyleAggregation}
     */
    get styleAverages() {
        return this.state.styleAverages.value;
    }

    /**
     * The comparison groups to draw, in payload order: every group given, several state
     * groups as several series, an unrecognised type with the catch-all mark.
     * @returns {import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup[]}
     */
    get comparisonGroups() {
        return this.styleAverages.comparisonGroups;
    }

    /**
     * `all` for both domains grouped per style, else the domain drawn. Reactive: the
     * host's `mode` signal, shared.
     * @returns {string}
     */
    get mode() {
        return this.state.mode.value;
    }

    /**
     * The selected student's values, or `null` when no student is selected. Reactive
     * (`state.studentValues`).
     * @returns {{[key: string]: number|null}|null}
     */
    get studentValues() {
        return this.state.studentValues.value;
    }

    /**
     * Tooltip for one row: the style, its domain under it, the student's value when one
     * is selected, the group value and one line per comparison group.
     * @param {StyleLollipopRow} row
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     * @override
     */
    formatTooltipContent(row) {
        const { groupName } = this.styleAverages;
        return {
            title: row.styleLabel,
            subtitle: row.domainLabel,
            rows: [
                this.studentValues
                    ? { label: TERM_CONSTANTS.STUDENT, value: formatPercent(row.studentValue) }
                    : null,
                groupName ? { label: groupName, value: formatPercent(row.value) } : null,
                // The averages the chart shows, like the item lollipop's tooltip.
                ...comparisonTooltipRows(
                    this.comparisonGroups,
                    this.visibilityState,
                    (group) => row.comparisons[group.id],
                ),
            ],
        };
    }

    /**
     * The rows drawn as a table: per style (and domain, grouped) the student's value
     * when one is selected, the group's, then each shown comparison group's. A row with
     * no value in any shown column draws nothing and is left out.
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} `null` while nothing is drawn.
     */
    dataTable() {
        const grouped = this.#isGroupedMode();
        const student = this.studentValues !== null;
        const comparisons = visibleComparisonGroups(this.comparisonGroups, this.visibilityState);
        const rows = this.#rows().filter(
            (row) =>
                row.value !== null ||
                (student && row.studentValue !== null) ||
                comparisons.some((group) => row.comparisons[group.id] !== null),
        );
        if (rows.length === 0) return null;
        return {
            columns: [
                { label: EN_TERMS.STYLE },
                ...(grouped ? [{ label: TERM_CONSTANTS.DOMAIN }] : []),
                ...(student ? [percentColumn(TERM_CONSTANTS.STUDENT)] : []),
                percentColumn(this.styleAverages.groupName ?? TERM_CONSTANTS.GROUP),
                ...comparisons.map((group) => percentColumn(comparisonSeriesLabel(group))),
            ],
            rows: rows.map((row) => [
                { text: row.styleLabel },
                ...(grouped ? [{ text: row.domainLabel }] : []),
                ...(student ? [figureCell(row.studentValue)] : []),
                figureCell(row.value),
                ...comparisons.map((group) => figureCell(row.comparisons[group.id])),
            ]),
        };
    }

    /**
     * The rows of the drawn domains, with the values their marks draw.
     * @returns {StyleLollipopRow[]} In draw order.
     */
    #rows() {
        return buildRows({
            styleCategories: this.enConfig.styleCategories,
            domainIds: this.#drawnDomainIds(),
            domainStyles: this.domainStyles,
            groupAverages: this.styleAverages.groupAverages,
            studentValues: this.studentValues,
            comparisonGroups: this.comparisonGroups,
        });
    }

    /**
     * The value pill's size: wide and tall enough for "100 %" at the value-label font.
     * @returns {HeadSize} The pill geometry and the plot's right reserve for the widest pill.
     */
    resolveHeadSize() {
        const measured = this.measureTexts([formatPercent(100, 0)], valueLabelFont('inside'));
        const width = Math.ceil(
            Math.max(
                CHART_CONFIG.HEAD.MIN_WIDTH_PX,
                measured.maxWidth + CHART_CONFIG.HEAD.PADDING_X_PX * 2,
            ),
        );
        const height = Math.ceil(
            Math.max(
                CHART_CONFIG.HEAD.MIN_HEIGHT_PX,
                measured.maxHeight + CHART_CONFIG.HEAD.PADDING_Y_PX * 2,
            ),
        );

        return {
            width,
            height,
            rightReserve: Math.ceil(
                width / 2 + CHART_CONFIG.HEAD.HOVER_GROWTH_PX + CHART_CONFIG.HEAD.RIGHT_GAP_PX,
            ),
        };
    }

    /**
     * The value pill's hover look: grown by `HOVER_GROWTH_PX` on every side, around its centre.
     * @param {RowPosition} getX - The pill's left edge.
     * @param {RowPosition} getY - The pill's top edge.
     * @param {HeadSize} headSize - The resting pill geometry.
     * @returns {import('../../../../common/charts/renderers/chartRenderer.js').HoverEffect}
     */
    #getHeadHoverConfig(getX, getY, headSize) {
        const grow = CHART_CONFIG.HEAD.HOVER_GROWTH_PX;
        const hoverWidth = headSize.width + grow * 2;
        const hoverHeight = headSize.height + grow * 2;

        return {
            enter: {
                x: (d) => getX(d) - grow,
                y: (d) => getY(d) - grow,
                width: hoverWidth,
                height: hoverHeight,
                rx: hoverHeight / 2,
                ry: hoverHeight / 2,
            },
            leave: {
                x: getX,
                y: getY,
                width: headSize.width,
                height: headSize.height,
                rx: headSize.height / 2,
                ry: headSize.height / 2,
            },
        };
    }

    /**
     * One value pill — a rounded rect with the value centred in it — as a keyed
     * join, shared by the group head and the student's pill so both keep the same
     * measured geometry and only differ in paint and placement. The rects and the
     * texts join in layers of their own, so every text paints over every pill.
     * @param {{rects: PlotGroup, labels: PlotGroup}} layers
     * @param {StyleLollipopRow[]} data
     * @param {object} o
     * @param {string} o.rectSelector - Class the rects are joined on.
     * @param {string} o.textSelector - Class the texts are joined on.
     * @param {RowPosition} o.getLeft - Left edge of the pill.
     * @param {RowPosition} o.getTop - Top edge of the pill.
     * @param {(d: StyleLollipopRow) => number|null} o.getValue
     * @param {(d: StyleLollipopRow) => string} o.fill
     * @param {(d: StyleLollipopRow) => string} o.stroke
     * @param {string|((d: StyleLollipopRow) => string)} o.textFill
     * @param {number} o.durationMs
     * @param {HeadSize} o.headSize
     * @param {boolean} [o.halo=false] - Ring the text in the pill's own fill, for a label a marker may sit under: the ring is invisible on the pill and cuts the glyphs free of the marker.
     * @returns {{rects: d3.Selection<SVGRectElement, StyleLollipopRow, SVGGElement, unknown>, labels: d3.Selection<SVGTextElement, StyleLollipopRow, SVGGElement, unknown>}}
     */
    #joinValuePill(
        layers,
        data,
        {
            rectSelector,
            textSelector,
            getLeft,
            getTop,
            getValue,
            fill,
            stroke,
            textFill,
            halo = false,
            durationMs,
            headSize,
        },
    ) {
        // One geometry for enter and update, set on a selection or a transition alike.
        // The paint is set on the joined rects below, never in the transition: the
        // colours are `var()` tokens, which a tween would interpolate digit by digit.
        const placeRect = (
            /** @type {d3.Selection<SVGRectElement, StyleLollipopRow, any, any>} */ sel,
        ) =>
            sel
                .attr('x', getLeft)
                .attr('y', getTop)
                .attr('width', headSize.width)
                .attr('height', headSize.height)
                .attr('rx', headSize.height / 2)
                .attr('ry', headSize.height / 2);
        const placeText = (
            /** @type {d3.Selection<SVGTextElement, StyleLollipopRow, any, any>} */ sel,
        ) =>
            sel
                .attr('x', (d) => getLeft(d) + headSize.width / 2)
                .attr('y', (d) => getTop(d) + headSize.height / 2);
        const text = (/** @type {StyleLollipopRow} */ d) => formatPercent(getValue(d), 0);

        const rects = joinFading(layers.rects, 'rect', rectSelector, data, placeRect, durationMs)
            .style('fill', fill)
            .style('stroke', stroke)
            .attr('stroke-width', MARK_DEFAULTS.outlineWidthPx);
        const labels = joinFading(
            layers.labels,
            'text',
            textSelector,
            data,
            placeText,
            durationMs,
        ).text(text);
        styleValueLabels(labels, { fill: textFill, halo })
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central');
        if (halo) labels.style('--value-label-halo', fill);

        return { rects, labels };
    }

    /**
     * The domain tag reads over the stem: ink on the shared surface halo.
     * @param {d3.Selection<SVGTextElement, StyleLollipopRow, SVGGElement, unknown>} tags
     * @returns {d3.Selection<SVGTextElement, StyleLollipopRow, SVGGElement, unknown>} The same selection.
     */
    #styleDomainTags(tags) {
        applyChartTextSize(tags, 'sm');
        tags.classed('value-label--halo', true)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'central')
            .style('fill', 'var(--text-color)')
            .attr('font-weight', fontWeightToken('bold'))
            .style('pointer-events', 'none');
        return tags;
    }

    /**
     * @returns {boolean} True when both domains share each style band.
     */
    #isGroupedMode() {
        return this.mode === 'all';
    }

    /**
     * @returns {string[]} The domains whose rows are drawn, in display order.
     */
    #drawnDomainIds() {
        return this.#isGroupedMode() ? this.enConfig.domainIds : [this.mode];
    }

    /**
     * Measure the container, after handing the host the rows' floor when it changed: the
     * card it grows is measured again, so the pass draws once, at the grown height,
     * rather than leaving a second draw to the resize observer's delay.
     * @override
     * @returns {import('../../../../common/charts/renderers/chartRenderer.js').ChartDimensions}
     */
    calculateDimensions() {
        const dimensions = super.calculateDimensions();
        const { headSize, axisSpace } = this.#measureFrame();
        const chartHeight = this.previewLayout(axisSpace, dimensions).chart.height;
        // The rows' floor plus everything around the plot, the key over it included.
        const minChartHeight = computeMinChartHeight(
            this.enConfig.styleCategories.length,
            headSize.height,
            Boolean(this.studentValues),
        );
        const minHeight = Math.ceil(
            minChartHeight + dimensions.containerHeight - chartHeight + dimensions.keyHeight,
        );
        if (minHeight === this.#reportedMinHeight) return dimensions;
        this.#reportedMinHeight = minHeight;
        this.options.onMinHeight?.(minHeight);
        return super.calculateDimensions();
    }

    /** @override */
    renderChart() {
        const styleLabels = this.enConfig.styleCategories.map((c) => c.label);
        const { headSize, axisSpace } = this.#measureFrame();
        // A first draw moves nothing.
        const durationMs = this.drawDurationMs;

        const { g, layout } = this.initializeSVG(axisSpace);

        const chartHeight = layout.chart.height;
        this.xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.chart.width]);

        // The style bands are laid out for both domains in every mode, so a switch moves
        // no tick; a single domain's row takes the centre of its band.
        const { yScaleOuter, yScaleInner } = resolveStyleBandScales(
            styleLabels,
            this.enConfig.domainIds,
            this.#drawnDomainIds(),
            chartHeight,
            headSize.height,
        );
        this.yScale = yScaleOuter;
        this.yScaleInner = yScaleInner;
        // Drawn before the marks, so the grid sits behind them.
        this.#createAxes(g, layout.chart);
        this.#drawRows(g, headSize, durationMs);
    }

    /**
     * What the plot's frame needs, by text measure: the value pill, and the axis bands
     * around the plot, the widest pill's reserve on the right. The floor and the draw
     * read the same.
     * @returns {{headSize: HeadSize, axisSpace: {left: number, right: number, bottom: number}}}
     */
    #measureFrame() {
        const headSize = this.resolveHeadSize();
        return {
            headSize,
            axisSpace: {
                left: this.measureAxisSpace(
                    'left',
                    this.enConfig.styleCategories.map((c) => c.label),
                ),
                right: headSize.rightReserve,
                bottom: measurePercentAxisSpace(this, 'bottom', {
                    axisTitleText: SOLUTION_RATE_AXIS_TITLE,
                }),
            },
        };
    }

    /**
     * The series the rows draw, in the current mode.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey|null}
     */
    chartKey() {
        return [{ items: buildLegendItems(this, this.#isGroupedMode()) }];
    }

    /**
     * Join every chart element (enter/update/exit) by row key, one path for every mode:
     * a kept row moves, an entering or leaving one fades.
     *
     * Stacking, bottom up, in layers the first draw makes in this order: stems, domain
     * tags, group pills and their values, comparison markers, the student's pills and
     * their values, and the rows' hit bands over all of it.
     * @param {PlotGroup} g
     * @param {HeadSize} headSize
     * @param {number} durationMs
     */
    #drawRows(g, headSize, durationMs) {
        const data = this.#rows();
        // Stem and group pill need a group value; a row without one draws neither, while
        // its student pill and comparison markers still draw from their own values.
        const groupData = data.filter((d) => d.value !== null);
        const { xScale, yScale, yScaleInner } = this;
        const surface = 'var(--color-card-background)';

        const key = (/** @type {StyleLollipopRow} */ d) => d.key;
        // The row's centre line: its domain's inner band's centre within its style band.
        /** @type {RowPosition} */
        const getY = (d) =>
            (yScale(d.styleLabel) ?? 0) +
            (yScaleInner(d.domainKey) ?? 0) +
            yScaleInner.bandwidth() / 2;
        // Heads and stems draw from `groupData` only, whose rows all carry a group value.
        /** @type {RowPosition} */
        const getHeadX = (d) => xScale(/** @type {number} */ (d.value)) - headSize.width / 2;
        /** @type {RowPosition} */
        const getHeadY = (d) => getY(d) - headSize.height / 2;
        /** @type {RowPosition} */
        const lineEnd = (d) => {
            const value = /** @type {number} */ (d.value);
            return d.studentValue !== null && d.studentValue > value ? d.studentValue : value;
        };
        const colorOf = (/** @type {StyleLollipopRow} */ d) => d.color;

        const layer = (/** @type {string} */ className) => selectOrAppend(g, 'g', className);
        const stemLayer = layer('style-stems');
        const tagLayer = layer('style-domain-tags');
        // The pills carry data colour; their labels sit in layers of their own.
        const dataLayer = (/** @type {string} */ className) =>
            selectOrAppend(g, 'g', className, asDataMark);
        // The comparison markers sit on the group pill, so its labels draw over them;
        // the first draw creates the layers in this order.
        const headRects = dataLayer('style-heads');
        const markerLayer = layer('average-markers');
        const headLayers = { rects: headRects, labels: layer('style-head-labels') };
        const studentLayers = {
            rects: dataLayer('style-student-heads'),
            labels: layer('style-student-labels'),
        };
        const hitLayer = layer('lollipop-hits');

        const lines = joinFading(
            stemLayer,
            'line',
            'lollipop-line',
            groupData,
            (/** @type {d3.Selection<SVGLineElement, StyleLollipopRow, any, any>} */ sel) =>
                sel
                    .attr('x1', 0)
                    .attr('stroke-width', MARK_DEFAULTS.lineWidthPx)
                    .attr('x2', (d) => xScale(lineEnd(d)))
                    .attr('y1', getY)
                    .attr('y2', getY),
            durationMs,
        ).style('stroke', colorOf);

        // --- Lollipop heads: the group value as a filled pill on the stem end ---
        const { rects: heads } = this.#joinValuePill(headLayers, groupData, {
            rectSelector: 'lollipop-head',
            textSelector: 'value-label',
            getLeft: getHeadX,
            getTop: getHeadY,
            getValue: (d) => d.value,
            fill: colorOf,
            stroke: () => surface,
            textFill: (d) => valueLabelInk(d.color),
            durationMs,
            headSize,
            // A marker under the value would cut into its glyphs.
            halo: true,
        });

        // --- Domain tags: the letter at the stem base names the row's domain, so the two
        // bars of a style band are not told apart by colour alone, and a single domain's
        // rows read the same way.
        const domainTags = joinFading(
            tagLayer,
            'text',
            'domain-tag',
            data,
            (/** @type {d3.Selection<SVGTextElement, StyleLollipopRow, any, any>} */ sel) =>
                sel.attr('x', CHART_CONFIG.DOMAIN_TAG.X_PX).attr('y', getY),
            durationMs,
        ).text((d) => this.domainStyles[d.domainKey].initial);
        this.#styleDomainTags(domainTags);

        // --- One marker series per delivered comparison group ---
        // Markers stay on their own stem and draw over the group pill, under its value
        // label: in grouped mode the neighbouring bar is only a pill height away, so there
        // is no room to move them off the stem without landing on the other domain's line.
        joinComparisonMarkers(this, markerLayer, this.comparisonGroups, {
            baseClass: 'average-marker comparison-average-marker',
            // A row the group has no value for gets no marker rather than one at 0 %.
            dataFor: (group) => data.filter((d) => d.comparisons[group.id] !== null),
            key,
            // `dataFor` left only rows with a value.
            getX: (d, group) => xScale(/** @type {number} */ (d.comparisons[group.id])),
            getY,
            durationMs,
            transitionName: MAIN,
            fade: true,
            classSuffix: (d) => ` ${d.domainKey}`,
        });

        // --- Student mark: a hollow pill on the value, same geometry as the group
        // pill and the same hue, so the person is told apart from the group by fill
        // mode. When the two pills would overlap, the student's rises straight off
        // the stem — its x stays on the value.
        const studentData = data.filter((d) => d.studentValue !== null);
        // The student pill draws from `studentData` only, whose rows all carry a value.
        /** @type {RowPosition} */
        const studentX = (d) => xScale(/** @type {number} */ (d.studentValue));
        const { LIFT_GAP_PX } = CHART_CONFIG.STUDENT;
        const overlapsGroup = (/** @type {StyleLollipopRow} */ d) =>
            d.value !== null &&
            Math.abs(studentX(d) - xScale(d.value)) <
                headSize.width + CHART_CONFIG.HEAD.MIN_PAIR_CLEARANCE_PX;

        this.#joinValuePill(studentLayers, studentData, {
            rectSelector: 'student-head',
            textSelector: 'student-value-label',
            getLeft: (d) => studentX(d) - headSize.width / 2,
            getTop: (d) =>
                overlapsGroup(d) ? getHeadY(d) - headSize.height - LIFT_GAP_PX : getHeadY(d),
            getValue: (d) => d.studentValue,
            fill: () => surface,
            stroke: colorOf,
            textFill: 'var(--text-color)',
            durationMs,
            headSize,
        });

        // One hit band per row over all of it: the row's stem, pill, markers and student
        // pill all say the one tooltip, which lists the comparison values.
        const { chart } = /** @type {NonNullable<typeof this.layout>} */ (this.layout);
        joinLollipopHits(this, hitLayer, data, {
            key,
            position: getY,
            bounds: [0, chart.height],
            across: [0, chart.width],
            horizontal: true,
            stems: lines,
            heads,
            head: this.#getHeadHoverConfig(getHeadX, getHeadY, headSize),
            getTooltipContent: (d) => this.formatTooltipContent(d),
        });
    }

    /**
     * The percent axis with its gridlines and title, and the style axis over
     * `this.yScale`, the same in every mode. Each style label links the term it resolves
     * to; a style the glossary does not know stays plain.
     * @param {PlotGroup} g
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').LayoutRect} chart - The plot rectangle.
     */
    #createAxes(g, chart) {
        appendPercentAxis(g, 'bottom', this.xScale, chart.height).attr(
            'transform',
            `translate(0, ${chart.height})`,
        );
        this.renderAxisTitle(g, 'bottom', SOLUTION_RATE_AXIS_TITLE);

        const { glossary } = this.context;
        appendAxisGroup(g, 'y-axis', { baseline: true })
            .call(createCategoryAxis('left', this.yScale))
            .selectAll('text')
            .each((d, i, nodes) => {
                glossary.stampGlossaryAttr(
                    d3.select(nodes[i]),
                    glossary.resolveEntryKey(/** @type {string} */ (d)),
                );
            });
    }
}

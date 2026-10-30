/**
 * The EN item lollipop renderer: the solution rate per item, with the Aufgabenniveau
 * carried by the lollipop's colour, one strip per domain.
 */

import {
    fitItemPitch,
    groupByDomain,
    lollipopMarkSizes,
} from '../../../../common/charts/renderers/lollipopMarks.js';
import { ItemLollipopChartRenderer } from '../../../../common/charts/renderers/itemLollipopChartRenderer.js';
import { animate } from '../../../../common/charts/motionPreference.js';
import { appendAxisGroup, createCategoryAxis } from '../../../../common/charts/chartAxisUtils.js';
import { createState } from '@tba3/module-base';
import * as d3 from 'd3';
import { formatPercent } from '../../../../common/utils/numberFormat.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { EN_TERMS } from '../../../enTerms.js';
import { applyChartTextSize } from '../../../../common/charts/chartTypography.js';
import { RESULT_CODE } from '../../../../common/domain/apiValueMaps.js';
import { distributionFields } from '../../../../common/tables/distributionFields.js';
import {
    LABEL_LINE_HEIGHT_EM,
    measureLabelBlockHeight,
} from '../../../../common/charts/chartLabelFit.js';
import { fontWeightToken } from '../../../../common/utils/fontTokens.js';

/**
 * @typedef {object} ItemData
 * @property {string} iqbId
 * @property {string} name - The item number as the payload delivers it.
 * @property {string} [displayName] - Display label with domain prefix (in 'all' mode)
 * @property {number} meanPercentage - The item's solution rate from items.json (`mean` × 100); the stem's height
 * @property {number|null} percentageCorrect - Share of responses scored correct; `null` without responses
 * @property {number|null} percentageIncorrect - Share of responses scored incorrect
 * @property {number|null} percentageNotAttempted - Share of responses left unattempted
 * @property {string} competenceLevel - The item's Aufgabenniveau
 * @property {string[]} [style]
 * @property {string} domainLabel
 */

/**
 * @typedef {object} ItemLollipopChartOptions
 * @property {import('../../../../common/domain/resultAggregations.js').ResultType[]} resultTypes - The result types the item aggregation delivers: the tooltip rows, and the `Richtig` entry whose glossary key the axis title links.
 * @property {string[]} itemCompetenceLevels - Every Aufgabenniveau in the dataset, repeats allowed: what the Niveau legend lists, whatever the table synced.
 * @property {string[]} axisLabels - Every tick label a strip without a heading can show (domain-prefixed in `all` mode): its x-axis reserve is measured from them, so no sync changes the plot's height.
 * @property {string[]} itemNames - Every item number, unprefixed: what a strip under its domain heading shows, and the reserve such strips are measured from.
 * @property {string[]} domains - Every domain in the dataset, in payload order: the strips stack in it, whatever order the table syncs its rows in.
 * @property {import('../../../../common/domain/itemComparisonGroups.js').ItemComparisonGroup[]} comparisonGroups - The comparison groups items.json carries means for.
 * @property {import('../../../../common/charts/comparisonState.js').ComparisonStateReader|null} [comparisonState]
 */

/**
 * The x geometry, in head radii: the reserve each side of the plot, and the widest
 * pitch between two Teilaufgaben, so a few items sit together in the middle rather than
 * spread across the card. The narrowest pitch is the shared `LOLLIPOP_MIN_PITCH_PX`.
 */
const CHART_CONSTANTS = Object.freeze({
    EDGE_RADII: 4,
    MAX_PITCH_RADII: 8,
});

/**
 * The item-id tick labels, turned -45° so dense ids stay legible side by side; measured
 * and drawn with the same geometry.
 */
const X_TICK_LABEL = Object.freeze({ rotationDeg: -45, dx: '-.8em', dy: '.15em', textSize: 'sm' });

/**
 * What one pass lays out for every strip; lengths in px.
 * @typedef {object} StripLayout
 * @property {number} width - Of the plot.
 * @property {number} height - Of one strip's plot.
 * @property {number} start - The first item's x.
 * @property {number} pitch - Between two items, the same in every strip.
 * @property {number} circleRadius - Of the head.
 * @property {number} lineStrokeWidth - Of the stem.
 * @property {boolean} headed - Whether each strip names its domain over it.
 * @property {(item: ItemData) => string} tickLabel - An item's tick: its number under a heading, else as the table names it.
 */

/**
 * A strip's domain and its items, in table order.
 * @typedef {[string, ItemData[]]} ItemStrip
 */

const SHARE_FIELDS = distributionFields('');

/**
 * Each result row's share field, by the result's code.
 * @type {Readonly<{[code: number]: 'percentageCorrect'|'percentageIncorrect'|'percentageNotAttempted'}>}
 */
const SHARE_FIELD_BY_CODE = Object.freeze(
    /** @type {{[code: number]: 'percentageCorrect'|'percentageIncorrect'|'percentageNotAttempted'}} */ ({
        [RESULT_CODE.CORRECT]: SHARE_FIELDS.correct,
        [RESULT_CODE.INCORRECT]: SHARE_FIELDS.incorrect,
        [RESULT_CODE.NOT_ATTEMPTED]: SHARE_FIELDS.notAttempted,
    }),
);

/**
 * Draws the items the host's `applySync` verb hands it, in the order handed;
 * comparison visibility follows the app's comparison state. Every
 * pass joins into the drawn chart (enter/update/exit), so a sync moves the lollipops
 * already drawn.
 * @augments ItemLollipopChartRenderer
 */
export class ItemLollipopChart extends ItemLollipopChartRenderer {
    /** @type {Map<string, Set<string>>} Each strip's ids the last pass drew: a changed set snaps its x axis, a re-sort slides it. */
    #drawnIds = new Map();

    /**
     * @param {HTMLElement} container
     * @param {ItemData[] | null | import('@preact/signals-core').Signal<ItemData[] | null>} itemData - The items to draw, or the host's signal of them, shared: a write redraws the chart
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & ItemLollipopChartOptions} options
     */
    constructor(container, itemData, options) {
        super(container, {
            legend: 'top',
            ...options,
            layout: { padding: { top: 10 } },
        });

        /** @type {import('@tba3/module-base').State<{items: ItemData[] | null}>} Reactive: the host writes `items` on every sync. */
        this.state = createState({ items: itemData });

        this.resultTypes = options.resultTypes;
        this.itemCompetenceLevels = options.itemCompetenceLevels;
        this.axisLabels = options.axisLabels;
        this.itemNames = options.itemNames;
        this.domains = options.domains;
    }

    /**
     * Items arrive as whole id lists from the table (`state.items`). An emptied
     * list keeps the drawn frame, with the no-data sentence over the plot; a chart that
     * has drawn nothing yet shows the card's no-data message instead.
     * @override
     */
    validateData() {
        const items = this.state.items.value;
        return Array.isArray(items) && (items.length > 0 || this.svg !== null);
    }

    /**
     * Every level in the dataset, so no sync changes the key, then the comparison groups.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey|null}
     */
    chartKey() {
        return this.itemLollipopLegend(this.itemCompetenceLevels);
    }

    /**
     * One strip per domain, stacked, each with its own 0–100 % axis and item axis; the
     * items keep their table order within a strip, and item i sits at the same x in
     * every strip. A single domain (a domain mode, or a filter that leaves one) draws
     * one strip at full height, its ticks labelled as the table labels them.
     * @override
     */
    renderChart() {
        const items = this.state.items.value ?? [];
        // A first draw moves nothing: its lollipops do not rise from the baseline.
        const durationMs = this.drawDurationMs;
        // In the dataset's domain order, so a table sort never swaps the strips. An
        // emptied list keeps one strip's frame, under the no-data sentence.
        const rank = (/** @type {string} */ domain) => this.domains.indexOf(domain);
        /** @type {ItemStrip[]} */
        const strips =
            items.length > 0
                ? groupByDomain(items).sort(([a], [b]) => rank(a) - rank(b))
                : [['', []]];
        const headed = strips.length > 1;
        const longest = Math.max(...strips.map(([, stripItems]) => stripItems.length));

        // The box the measure pass just read; a scrolling chart widens it below.
        const { circleRadius, lineStrokeWidth } = lollipopMarkSizes(
            this.measuredDimensions().geometryScale,
        );
        const axisLeftSpace = this.measureSolutionRateAxis();
        // Measured from every label the strips can show in this layout, so no sync
        // within it moves the plot's bottom edge: bare numbers under headings.
        const axisBottomSpace = this.measureAxisSpace(
            'bottom',
            headed ? this.itemNames : this.axisLabels,
            X_TICK_LABEL,
        );
        const fontSize = this.resolveChartTextSize();
        const headingSpace = headed
            ? measureLabelBlockHeight(
                  this,
                  strips.map(([domain]) => domain),
                  { fontWeight: fontWeightToken('semibold') },
              )
            : 0;
        const edgeReserve = 2 * circleRadius * CHART_CONSTANTS.EDGE_RADII;

        // Content-driven width: every Teilaufgabe of the longest strip gets at least the
        // minimum pitch.
        fitItemPitch(this, longest, axisLeftSpace, edgeReserve);

        const { g, layout } = this.initializeSVG({ left: axisLeftSpace, bottom: axisBottomSpace });
        const { width, height } = layout.chart;
        // Every strip but the last carries its item axis under it, inside the plot. A card
        // too short for those bands flattens the strips rather than turning them over.
        const stripHeight = Math.max(
            0,
            (height - (strips.length - 1) * axisBottomSpace - strips.length * headingSpace) /
                strips.length,
        );
        const span = Math.min(
            width - edgeReserve,
            circleRadius * CHART_CONSTANTS.MAX_PITCH_RADII * (longest - 1),
        );
        /** @type {StripLayout} */
        const stripLayout = {
            width,
            height: stripHeight,
            start: width / 2 - span / 2,
            pitch: longest > 1 ? span / (longest - 1) : 0,
            circleRadius,
            lineStrokeWidth,
            headed,
            tickLabel: headed ? (item) => item.name : (item) => item.displayName || item.name,
        };

        this.drawSolutionRateTitle(
            g,
            this.resultTypes.find((rt) => rt.numericCode === RESULT_CODE.CORRECT)?.glossaryKey,
        );
        const chart = this;
        const drawnIds = this.#drawnIds;
        this.#drawnIds = new Map();
        g.selectChildren('g.item-strip')
            .data(strips, (d) => /** @type {ItemStrip} */ (d)[0])
            .join('g')
            .attr('class', 'item-strip')
            .attr(
                'transform',
                (_, k) =>
                    `translate(0, ${headingSpace + k * (stripHeight + axisBottomSpace + headingSpace)})`,
            )
            .each(function (strip) {
                chart.#drawStrip(d3.select(/** @type {SVGGElement} */ (this)), strip, {
                    layout: stripLayout,
                    drawn: drawnIds.get(strip[0]) ?? new Set(),
                    fontSize,
                    durationMs,
                });
            });

        // A filter that leaves no item keeps the frame and says so over the plot.
        if (items.length === 0) {
            this.renderNoDataOverlay(
                this.context.glossary.getRequiredEntryText('general.messages.no-data-short'),
            );
        }
    }

    /**
     * Draw one strip into its group: its axes, its domain over it when the chart is
     * headed, and its lollipops, joined by item id so a table sync or a resize moves the
     * marks already drawn.
     * @param {d3.Selection<SVGGElement, any, any, any>} stripG
     * @param {ItemStrip} strip
     * @param {object} pass
     * @param {StripLayout} pass.layout
     * @param {Set<string>} pass.drawn - The ids this strip drew last pass.
     * @param {number} pass.fontSize - Of the chart's text, px.
     * @param {number} pass.durationMs - 0 sets everything outright.
     */
    #drawStrip(stripG, [domain, items], { layout, drawn, fontSize, durationMs }) {
        const { width, height, start, pitch } = layout;
        const yScale = this.drawSolutionRateAxis(stripG, { width, height });
        appendAxisGroup(stripG, 'x-axis', { baseline: true }).attr(
            'transform',
            `translate(0, ${height})`,
        );
        stripG
            .selectChildren('text.domain-label')
            .data(layout.headed ? [domain] : [])
            .join((enter) =>
                enter
                    .append('text')
                    .attr('class', 'domain-label axis-tick-label')
                    .style('font-weight', fontWeightToken('semibold')),
            )
            .attr('x', 0)
            // On the line over the strip, its descenders clear of the 100 % gridline.
            .attr('y', -fontSize * (LABEL_LINE_HEIGHT_EM - 1) - 2)
            .text((d) => d);

        // Keyed by id, so two rows with the same label keep their own tick.
        const x = d3
            .scalePoint()
            .domain(items.map((item) => item.iqbId))
            .range([start, start + pitch * Math.max(0, items.length - 1)]);
        this.joinItemLollipops(stripG, items, {
            x: (d) => x(d.iqbId) ?? 0,
            yScale,
            stemWidthPx: layout.lineStrokeWidth,
            headRadiusPx: layout.circleRadius,
            durationMs,
        });

        // A changed item set snaps the axis: rapid select/deselect fires several syncs
        // inside one transition window, and animated rotated labels would overlap. A
        // re-sort of the same items slides with the marks.
        const ids = new Set(items.map((item) => item.iqbId));
        const sameItems = ids.size === drawn.size && [...ids].every((id) => drawn.has(id));
        this.#drawnIds.set(domain, ids);
        this.#updateXAxis(stripG, items, x, layout.tickLabel, sameItems ? durationMs : 0);
    }

    /**
     * Draw the x-axis ticks at the items' positions, labelled by `tickLabel`.
     * @param {d3.Selection<SVGGElement, any, any, any>} g - The strip.
     * @param {ItemData[]} items
     * @param {d3.ScalePoint<string>} x
     * @param {StripLayout['tickLabel']} tickLabel
     * @param {number} durationMs
     */
    #updateXAxis(g, items, x, tickLabel, durationMs) {
        const labelById = new Map(items.map((item) => [item.iqbId, tickLabel(item)]));
        /** @type {d3.Selection<SVGGElement, unknown, null, undefined>} */
        const xAxisGroup = g.select('.x-axis');
        animate(xAxisGroup, { durationMs }).call(
            createCategoryAxis('bottom', x).tickFormat((id) => labelById.get(id) ?? ''),
        );

        // Always rotated, entering ticks included.
        const labels = xAxisGroup.selectAll('text');
        applyChartTextSize(labels, X_TICK_LABEL.textSize);
        labels
            .attr('text-anchor', 'end')
            .attr('dx', X_TICK_LABEL.dx)
            .attr('dy', X_TICK_LABEL.dy)
            .attr('transform', `rotate(${X_TICK_LABEL.rotationDeg})`);
    }

    /**
     * The items drawn, in table order: each Teilaufgabe as the table names it, with its
     * Aufgabenniveau (the lollipop's colour).
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null}
     */
    dataTable() {
        return this.itemDataTable(this.state.items.value ?? [], {
            columns: [
                { label: TERM_CONSTANTS.SUBTASK },
                { label: TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL },
            ],
            cells: (item) => [
                { text: item.displayName || item.name },
                { text: item.competenceLevel },
            ],
        });
    }

    /**
     * @param {ItemData} d
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     * @override
     */
    formatTooltipContent(d) {
        // The stem's own value first: it is the item mean, a different statistic from the
        // aggregation's Richtig share below, and otherwise never printed. Each result row
        // reads its own bucket's share, matched by result code — never by the row's
        // position among the result types.
        /** @type {import('../../../../common/services/cursorTooltip.js').TooltipRow[]} */
        const rows = [
            { label: TERM_CONSTANTS.SOLUTION_RATE, value: formatPercent(d.meanPercentage) },
            ...this.resultTypes.map((rt) => ({
                label: rt.value,
                value: formatPercent(d[SHARE_FIELD_BY_CODE[rt.numericCode]]),
            })),
        ];

        return {
            // As the table names it: in `all` mode two domains share item numbers.
            title: d.displayName || d.name,
            subtitle: TERM_CONSTANTS.SUBTASK,
            rows: [
                ...rows,
                ...this.itemComparisonRows(d),
                { label: TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL, value: d.competenceLevel },
                d.style?.length ? { label: EN_TERMS.STYLES, value: d.style.join(', ') } : null,
            ],
        };
    }
}

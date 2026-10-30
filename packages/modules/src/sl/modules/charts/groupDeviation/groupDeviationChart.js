/**
 * GroupDeviationChart — one subject×domain row of the SL school summary: the school
 * value in an HTML box in the plot's left margin, and every reference average and
 * group as a bar of its deviation from it, in percentage points. Every card shares the
 * y domain so bar heights stay comparable; the column band is the card's own entries,
 * so a group tested in one subject only leaves no empty column on the other cards.
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import {
    appendAxisBaseline,
    appendReferenceLine,
} from '../../../../common/charts/chartAxisUtils.js';
import { AXIS_DEFAULTS, bandBar } from '../../../../common/charts/chartDefaults.js';
import {
    BAND_LABEL_GAP_PX,
    LABEL_LINE_HEIGHT_EM,
    MAX_LABEL_LINES,
    appendLabelLines,
    fitLabelLines,
    splitLabelLines,
} from '../../../../common/charts/chartLabelFit.js';
import {
    VALUE_LABEL,
    setValueLabelText,
    styleValueLabels,
} from '../../../../common/charts/chartValueLabels.js';
import { animate } from '../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { formatPercentPoints, formatShare } from '../../../../common/utils/numberFormat.js';
import { figureCell, percentColumn } from '../../../../common/charts/dataTableCells.js';
import { toPercent } from '../../../../common/domain/itemResultCounts.js';
import { entryVerdict } from '../../../utils/slSchoolSummaryMetrics.js';
import { ABSENCE_REASONS } from '../../../utils/slSchoolSummaryMetricRegistry.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import * as d3 from 'd3';
import {
    applyChartTextSize,
    resolveChartTextSizePx,
} from '../../../../common/charts/chartTypography.js';
import { fontFamilyToken } from '../../../../common/utils/fontTokens.js';
import { createState, measureTextWidth } from '@tba3/module-base';
import './groupDeviationChart.css';

/** @typedef {import('../../../utils/slSchoolSummaryMetricRegistry.js').SummaryMetric} SummaryMetric */
/** @typedef {import('../../../../common/charts/renderers/chartRenderer.js').LayoutRect} LayoutRect */

/** @typedef {import('../../../utils/slSchoolSummaryMetrics.js').SummaryEntry} GroupDeviationEntry */
/** @typedef {import('../../../utils/slSchoolSummaryMetrics.js').SummaryRow} GroupDeviationRow */
/** @typedef {import('../../../utils/slSchoolSummaryMetrics.js').SummaryAbsence} GroupDeviationAbsence */

/**
 * The renderer input for one card.
 * @typedef {object} GroupDeviationData
 * @property {GroupDeviationRow|null} row - `null` when the metric yields no data for it.
 * @property {GroupDeviationAbsence|null} absence - Why there is no row, when there is none.
 * @property {[number, number]} yDomain - The y domain every card shares.
 * @property {number} labelLines - Column label lines every card reserves: 1 or 2.
 * @property {boolean} neutralKey - Whether every card's key lists the no-difference verdict.
 * @property {SummaryMetric} metric
 */

/**
 * The renderer's options: the base options plus its data, or the signal it follows.
 * @typedef {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & {
 *   data: GroupDeviationData | import('@preact/signals-core').ReadonlySignal<GroupDeviationData>,
 * }} GroupDeviationChartOptions
 */

/**
 * The scales one render was built with.
 * @typedef {object} GroupDeviationScales
 * @property {import('d3').ScaleBand<string>} xScale
 * @property {import('d3').ScaleLinear<number, number>} yScale - Deviation in percentage points.
 * @property {number} barWidth - In px.
 */

/**
 * The school value box in the plot's left margin: its width and its gap to the plot,
 * which together are the margin. The grid floor (`estimateMinRowWidth`) reads them too.
 */
const SCHOOL_BOX = Object.freeze({ widthPx: 152, gapPx: 20 });

const CHART_CONFIG = Object.freeze({
    /** Padding around the plot inside its SVG. */
    paddingPx: 10,

    bottomGutterPx: 12,

    barPaddingInnerRatio: 0.5,
    barPaddingOuterRatio: 0.4,
    /** Keeps a near-zero deviation visible as a hairline instead of nothing. */
    minBarHeightPx: 1,
});

/**
 * Why this card has no bars: one sentence per `ABSENCE_REASONS` cause, since the causes
 * have different remedies. Every sentence is the card's glossary copy; an absence
 * without a reason reads as `NO_GROUP_DATA`, whichever way it was reported.
 * @param {Pick<import('../../../../common/context/moduleContext.js').ModuleContext, 'glossary' | 'palette'>} context - The app's glossary, holding the sentences, and its palette, against which the metric names itself.
 * @param {{reason?: string}|null} absence - Which cause applies, from `ABSENCE_REASONS`.
 * @param {Pick<SummaryMetric, 'label' | 'unsupportedMessage'>} metric - The metric, which names itself and says why it can be unanswerable.
 * @returns {string}
 */
function buildNoDataMessage({ glossary, palette }, absence, metric) {
    const reason = absence?.reason ?? ABSENCE_REASONS.NO_GROUP_DATA;
    const messageKey =
        reason === ABSENCE_REASONS.METRIC_UNSUPPORTED ? metric.unsupportedMessage : reason;
    return applyTemplateTokens(
        glossary.getRequiredEntryText(`sl.summary.deviation.messages.${messageKey}`),
        { [TERM_CONSTANTS.METRIC]: metric.label(palette) },
    );
}

/** The transition a redraw moves the bars and their value labels in. */
const BAR_TRANSITION = 'deviation-bar';

/** Narrowest a column may get before its bar stops being readable. */
const MIN_COLUMN_SLOT_PX = 56;

/**
 * Narrowest a card's chart surface may be drawn at — the school box and the plot —
 * given the labels its columns carry.
 *
 * It is meant for CSS as `--summary-chart-min-width`, which adds the card's own
 * padding and border, so the responsive grid knows when a second card still fits
 * beside this one. A subject whose groups have long names therefore takes a whole row:
 * a column too narrow for its label is unreadable.
 *
 * Derived here because it follows this chart's geometry (gutter, bar widths).
 *
 * The slot is compared against the band step, not `bandwidth()`: the step sets the
 * labels' centre-to-centre distance, and for this scale it is ≈ width/n, which
 * multiplying by the column count models.
 *
 * Labels are measured on a canvas at the `sm` chart text size they are drawn at: this
 * feeds a floor for a CSS grid track, which is needed before any chart exists;
 * fitting a label into its band is the chart's (`fitLabelLines`).
 * @param {string[]} labels - Every column label the widest card carries, averages included.
 * @param {{size: number, weight: string, family: string}} font - The labels' font.
 * @returns {number} width in px
 */
function estimateMinRowWidth(labels, font) {
    const columns = labels.length;
    const widestLine = d3.max(labels.flatMap(splitLabelLines), (line) =>
        measureTextWidth(line, { font }),
    );

    const labelSlot = (widestLine ?? 0) + BAND_LABEL_GAP_PX;

    return (
        SCHOOL_BOX.widthPx +
        SCHOOL_BOX.gapPx +
        2 * CHART_CONFIG.paddingPx +
        Math.max(1, columns) * Math.max(MIN_COLUMN_SLOT_PX, labelSlot)
    );
}

/**
 * The widest card's chart surface for a summary, so the grid stays uniform even though
 * cards do not carry the same columns; seeded with the no-column floor so a metric no
 * subject×domain can answer still sizes the grid. Measured on every call, against the
 * fonts loaded then.
 * @param {{rows: Array<{entries: Array<{label: string}>}>}} summary
 * @returns {number} width in px
 */
export function summaryMinRowWidth(summary) {
    const font = {
        size: resolveChartTextSizePx('sm'),
        weight: '400',
        family: fontFamilyToken(),
    };
    return Math.max(
        estimateMinRowWidth([], font),
        ...summary.rows.map((row) =>
            estimateMinRowWidth(
                row.entries.map((entry) => entry.label),
                font,
            ),
        ),
    );
}

/**
 * How many lines the column labels of every card of one selection need, asked once for all
 * together: a per-card label band would change `chart.height`, and with it the pixels
 * one percentage point is worth, which the shared y domain keeps comparable.
 * @param {string[]} labels - Every column label across every card.
 * @returns {number} 1 or 2.
 */
export function resolveLabelLineCount(labels) {
    return labels.some((label) => splitLabelLines(label).length > 1) ? MAX_LABEL_LINES : 1;
}

export class GroupDeviationChart extends ChartRenderer {
    /**
     * @param {HTMLElement} container
     * @param {GroupDeviationChartOptions} options
     */
    constructor(container, options) {
        const { paddingPx } = CHART_CONFIG;
        super(container, {
            legend: 'top',
            ...options,
            layout: {
                padding: { top: paddingPx, right: paddingPx, bottom: paddingPx, left: paddingPx },
            },
        });

        /** @type {import('@tba3/module-base').State<{data: GroupDeviationData}>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<{data: GroupDeviationData}>} */ ({
                data: options.data,
            }),
        );
    }

    /**
     * The data in force.
     * @returns {GroupDeviationData}
     */
    get #data() {
        return this.state.data.value;
    }

    /**
     * The data with its row, for the calls that only run once `validateData` passed.
     * @returns {GroupDeviationData & {row: GroupDeviationRow}}
     */
    #drawn() {
        return /** @type {GroupDeviationData & {row: GroupDeviationRow}} */ (this.#data);
    }

    /** @override */
    validateData() {
        return Boolean(this.#data.row?.entries.length);
    }

    /**
     * What a bar's colour says, in the card's words: good, bad or no news for the
     * school, which on a lower-is-better metric runs against the bar's direction.
     * @param {ReturnType<typeof entryVerdict>} verdict
     * @returns {string} The key entry's label, and the tooltip's row value.
     */
    #verdictText(verdict) {
        return this.context.glossary.getRequiredEntryText(`sl.summary.deviation.key.${verdict}`);
    }

    /**
     * The bar colours: the only key to what they mean. The no-difference colour only
     * while some card of the selection draws it (`neutralKey`): a rare state, and decided for
     * every card at once, since a key that wraps on one card alone would shrink its plot
     * against the y domain every card shares.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey}
     */
    chartKey() {
        return [
            {
                items: [
                    {
                        symbol: 'square',
                        color: 'var(--tint-positive)',
                        stroke: 'var(--primary-color)',
                        label: this.#verdictText('favourable'),
                    },
                    {
                        symbol: 'square',
                        color: 'var(--tint-negative)',
                        stroke: 'var(--result-incorrect)',
                        label: this.#verdictText('unfavourable'),
                    },
                    ...(this.#data.neutralKey
                        ? [
                              {
                                  symbol: 'square',
                                  color: 'var(--tint-neutral)',
                                  stroke: 'var(--text-secondary)',
                                  label: this.#verdictText('neutral'),
                              },
                          ]
                        : []),
                ],
            },
        ];
    }

    /**
     * The row's absence reason, as a sentence.
     * @override
     * @protected
     * @returns {string}
     */
    noDataMessage() {
        const { absence, metric } = this.#data;
        return buildNoDataMessage(this.context, absence, metric);
    }

    /**
     * @override
     * @param {GroupDeviationEntry} entry
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     */
    formatTooltipContent(entry) {
        const { row, metric } = this.#drawn();

        return {
            title: entry.label,
            subtitle: row.rowLabel,
            rows: [
                // The group's own name, not the column label: the label may be the
                // Stammklasse, and the name says which course of it this bar is.
                {
                    label:
                        entry.kind === 'average'
                            ? entry.name
                            : `${TERM_CONSTANTS.GROUP} ${entry.name}`,
                    value: formatShare(entry.value),
                },
                { label: TERM_CONSTANTS.SCHOOL, value: formatShare(row.schoolValue) },
                { label: TERM_CONSTANTS.DIFFERENCE, value: formatPercentPoints(entry.deltaPP) },
                { label: TERM_CONSTANTS.METRIC, value: metric.label(this.context.palette) },
                {
                    label: TERM_CONSTANTS.RATING,
                    value: this.#verdictText(entryVerdict(entry, metric.higherIsBetter)),
                },
            ],
        };
    }

    /**
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} `null` while a sentence stands in for the chart.
     */
    dataTable() {
        const { row, metric } = this.#data;
        if (!row?.entries.length) return null;
        return {
            columns: [
                { label: TERM_CONSTANTS.VALUE_GROUP },
                percentColumn(metric.label(this.context.palette)),
                {
                    label: TERM_CONSTANTS.DIFFERENCE,
                    fields: [`${TERM_CONSTANTS.DIFFERENCE} (Prozentpunkte)`],
                },
                { label: TERM_CONSTANTS.RATING },
            ],
            rows: [
                [
                    { text: TERM_CONSTANTS.SCHOOL },
                    figureCell(toPercent(row.schoolValue)),
                    figureCell(null),
                    { text: '' },
                ],
                ...row.entries.map((entry) => [
                    { text: entry.label },
                    figureCell(toPercent(entry.value)),
                    figureCell(entry.deltaPP, formatPercentPoints),
                    { text: this.#verdictText(entryVerdict(entry, metric.higherIsBetter)) },
                ]),
            ],
        };
    }

    /** @override */
    renderChart() {
        // `ChartRenderer` applies `validateData()` before calling this, so the row is there.
        const data = this.#drawn();
        const durationMs = this.drawDurationMs;
        const { g, layout } = this.initializeSVG({
            top: this.#labelBandHeight(data.labelLines),
            bottom: CHART_CONFIG.bottomGutterPx,
            left: SCHOOL_BOX.widthPx + SCHOOL_BOX.gapPx,
        });

        const { chart } = layout;
        const scales = this.#createScales(data, chart);

        this.#renderSchoolValueBox(layout, scales, data);
        this.#renderZeroBaseline(g, chart, scales);
        this.#renderAverageDivider(g, chart, scales, data);
        this.#renderColumns(g, chart, scales, data, durationMs);
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * The band above the columns their labels take: the lines resolved for every card at
     * once (see `resolveLabelLineCount`), read off `data` rather than off this
     * row's own labels, at the size they are drawn, above the tick gap.
     * @param {number} labelLines - Lines every card's labels take, 1 or 2.
     * @returns {number} Height in px.
     */
    #labelBandHeight(labelLines) {
        const sm = this.resolveChartTextSize('sm');
        return sm * (1 + (labelLines - 1) * LABEL_LINE_HEIGHT_EM) + AXIS_DEFAULTS.tickPaddingPx;
    }

    /**
     * The column band and the deviation scale for one row.
     * @param {{row: GroupDeviationRow, yDomain: [number, number]}} data
     * @param {LayoutRect} chart
     * @returns {GroupDeviationScales}
     */
    #createScales({ row, yDomain }, chart) {
        const xScale = d3
            .scaleBand()
            .domain(row.entries.map((entry) => entry.name))
            .range([0, chart.width])
            .paddingInner(CHART_CONFIG.barPaddingInnerRatio)
            .paddingOuter(CHART_CONFIG.barPaddingOuterRatio);

        // The shared symmetric domain puts the baseline at the vertical centre. The
        // reserve at both ends — an outside value label and its gap — keeps the tallest
        // bar's label inside the chart area.
        const labelReserve = this.resolveChartTextSize('sm') + VALUE_LABEL.gapPx;
        const yScale = d3
            .scaleLinear()
            .domain(yDomain)
            .range([chart.height - labelReserve, labelReserve]);

        return { xScale, yScale, barWidth: bandBar(xScale).size };
    }

    /**
     * Band centre in chart-area coordinates.
     * @param {import('d3').ScaleBand<string>} xScale
     * @param {string} columnName
     * @returns {number}
     */
    #bandCenter(xScale, columnName) {
        // Every column name is in the band's domain: the domain is the row's own entries.
        return /** @type {number} */ (xScale(columnName)) + xScale.bandwidth() / 2;
    }

    /**
     * The zero line the bars diverge from: this chart's category baseline, the columns'
     * axis, so it takes the shared baseline and its ink.
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g
     * @param {LayoutRect} chart
     * @param {GroupDeviationScales} scales
     */
    #renderZeroBaseline(g, chart, { yScale }) {
        appendAxisBaseline(
            g,
            { x1: 0, x2: chart.width, y: yScale(0) },
            { className: 'zero-baseline' },
        );
    }

    /**
     * Vertical rule between the leading average columns and the group columns —
     * without it a Landesschnitt bar reads as just another group.
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g
     * @param {LayoutRect} chart
     * @param {GroupDeviationScales} scales
     * @param {{row: GroupDeviationRow}} data - Its entries lead with the averages; the rule goes before the first `group` one.
     */
    #renderAverageDivider(g, chart, { xScale }, { row }) {
        const entries = row.entries;
        const firstGroupIndex = entries.findIndex((entry) => entry.kind === 'group');
        if (firstGroupIndex <= 0) {
            // A redraw without averages (every ⌀ toggled off) takes the rule away.
            g.selectChildren('line.average-divider').remove();
            return;
        }

        const previous = entries[firstGroupIndex - 1];
        const next = entries[firstGroupIndex];
        const previousX = /** @type {number} */ (xScale(previous.name));
        const nextX = /** @type {number} */ (xScale(next.name));
        const x = (previousX + xScale.bandwidth() + nextX) / 2;

        appendReferenceLine(g, { x1: x, x2: x, y1: 0, y2: chart.height }, 'average-divider');
    }

    /**
     * The column headers, the bars and their signed value labels, and over them one hit
     * band per column: a near-zero deviation is a 1 px bar no pointer finds, so the
     * column, not the bar, takes the hover and the tab stop.
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g
     * @param {LayoutRect} chart
     * @param {GroupDeviationScales} scales
     * @param {GroupDeviationData & {row: GroupDeviationRow}} data
     * @param {number} durationMs - How long the drawn bars and labels move.
     */
    #renderColumns(g, chart, scales, data, durationMs) {
        const { xScale, yScale, barWidth } = scales;
        const { row, metric } = data;
        const entries = row.entries;

        // Every column carries a bar: a group this card has no value for gets no column.
        this.#renderColumnLabels(g, xScale, entries);

        /** @type {(entry: GroupDeviationEntry) => string} */
        const key = (entry) => entry.name;
        const barsGroup = selectOrAppend(g, 'g', 'deviation-bars');

        /**
         * Colour encodes good/bad/no news for the school, not the raw sign: on
         * `le_low` an upward group bar means more struggling students, and an
         * average bar is read from the school's side of the gap.
         * @param {GroupDeviationEntry} entry
         * @returns {string}
         */
        const barClass = (entry) =>
            `deviation-bar deviation-bar--${entry.kind} deviation-bar--${entryVerdict(entry, metric.higherIsBetter)}`;
        /** @type {(bars: any) => any} Write a bar's geometry, on its rect or a transition on it. */
        const placeBar = (bars) =>
            bars
                .attr(
                    'x',
                    (/** @type {GroupDeviationEntry} */ entry) =>
                        this.#bandCenter(xScale, entry.name) - barWidth / 2,
                )
                .attr('width', barWidth)
                .attr('y', (/** @type {GroupDeviationEntry} */ entry) =>
                    Math.min(yScale(0), yScale(entry.deltaPP)),
                )
                .attr('height', (/** @type {GroupDeviationEntry} */ entry) =>
                    Math.max(
                        CHART_CONFIG.minBarHeightPx,
                        Math.abs(yScale(entry.deltaPP) - yScale(0)),
                    ),
                );
        /** @type {d3.Selection<SVGRectElement, GroupDeviationEntry, SVGGElement, unknown>} */
        const drawnBars = barsGroup.selectChildren('rect.deviation-bar');
        const bars = drawnBars.data(entries, key).join(
            // The bars come before their labels.
            (enter) => placeBar(enter.insert('rect', 'text.value-label').attr('class', barClass)),
            (update) => {
                placeBar(
                    animate(update.attr('class', barClass).interrupt(BAR_TRANSITION), {
                        durationMs,
                        name: BAR_TRANSITION,
                    }),
                );
                return update;
            },
        );

        // Made after the bars' group on the first draw, so the bands lie over the bars
        // and their labels.
        const hitLayer = selectOrAppend(g, 'g', 'deviation-hits');

        // Signed labels sit outside the bar so they stay legible on every fill
        // and in every competence-level colour theme.
        /** @type {(entry: GroupDeviationEntry) => boolean} */
        const above = (entry) => entry.deltaPP >= 0;
        /** @type {(labels: any) => any} Write a label's anchor, on its text or a transition on it. */
        const placeLabel = (labels) =>
            labels
                .attr('x', (/** @type {GroupDeviationEntry} */ entry) =>
                    this.#bandCenter(xScale, entry.name),
                )
                .attr(
                    'y',
                    (/** @type {GroupDeviationEntry} */ entry) =>
                        yScale(entry.deltaPP) +
                        (above(entry) ? -VALUE_LABEL.gapPx : VALUE_LABEL.gapPx),
                );
        /** @type {d3.Selection<SVGTextElement, GroupDeviationEntry, SVGGElement, unknown>} */
        const drawnLabels = barsGroup.selectChildren('text.value-label');
        const labels = drawnLabels
            .data(entries, key)
            .join(
                (enter) => placeLabel(enter.append('text').attr('class', 'value-label')),
                (update) => {
                    placeLabel(
                        animate(update.interrupt(BAR_TRANSITION), {
                            durationMs,
                            name: BAR_TRANSITION,
                        }),
                    );
                    return update;
                },
            )
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', (entry) => (above(entry) ? 'auto' : 'hanging'));
        styleValueLabels(labels, { placement: 'outside' });
        labels.each(function (entry) {
            setValueLabelText(d3.select(this), formatPercentPoints(entry.deltaPP));
        });

        this.joinHitBands(hitLayer, entries, {
            key,
            position: (entry) => this.#bandCenter(xScale, entry.name),
            bounds: [0, chart.width],
            across: [0, chart.height],
            className: 'deviation-hit',
            getTooltipContent: (entry) => this.formatTooltipContent(entry),
            // The column's bar dims as it did when it was the target.
            linked: [
                { marks: bars, match: (bar, entry) => key(bar) === key(entry), effect: 'area' },
            ],
        });
    }

    /**
     * The column headers, one `text` per column and one `tspan` per label line.
     *
     * Lines are laid out upwards from the band's baseline, so the last line of
     * every label sits on it. A one-line label in a card whose band reserves two
     * therefore stays aligned with its neighbours' lower line rather than
     * floating between them.
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g
     * @param {import('d3').ScaleBand<string>} xScale
     * @param {GroupDeviationEntry[]} entries
     */
    #renderColumnLabels(g, xScale, entries) {
        // `step`, not `bandwidth`: the step is the distance to the next label's centre.
        const slot = Math.max(0, xScale.step() - BAND_LABEL_GAP_PX);
        // Every label is measured before any is written, so no measurement waits on
        // the layout a previous label's write invalidated.
        const fittedLines = entries.map((entry) =>
            fitLabelLines(this, entry.label, slot, { textSize: 'sm' }),
        );

        const layer = selectOrAppend(g, 'g', 'group-labels').style('pointer-events', 'none');
        /** @type {d3.Selection<SVGTextElement, GroupDeviationEntry, SVGGElement, unknown>} */
        const drawn = layer.selectChildren('text');
        const labels = drawn
            .data(entries, (entry) => entry.name)
            .join((enter) => enter.append('text'))
            .attr('class', (entry) => `group-label group-label--${entry.kind} axis-tick-label`)
            .attr('x', (entry) => this.#bandCenter(xScale, entry.name))
            .attr('y', -AXIS_DEFAULTS.tickPaddingPx)
            .attr('text-anchor', 'middle');

        labels.each((_entry, index, nodes) => {
            const text = d3.select(nodes[index]).text(null);
            appendLabelLines(text, fittedLines[index], {
                x: text.attr('x'),
                y: text.attr('y'),
                stack: 'up',
            });
        });

        applyChartTextSize(labels, 'sm');
    }

    /**
     * The school value box — the value and the metric's caption, which wraps in its box —
     * in the plot's left margin, centred on the zero line (`translateY(-50%)` in the
     * stylesheet). HTML in the plot area, so the caption wraps; a pass without a row
     * clears the plot area, and the box with it.
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ComputedChartLayout} layout
     * @param {GroupDeviationScales} scales
     * @param {{row: GroupDeviationRow, metric: SummaryMetric}} data
     */
    #renderSchoolValueBox(layout, { yScale }, { row, metric }) {
        let box = /** @type {HTMLElement|null} */ (
            this.container.querySelector(':scope > .school-value-box')
        );
        if (!box) {
            box = document.createElement('div');
            box.className = 'school-value-box';
            // Before the SVG, as on screen: the value the bars deviate from is read first.
            this.container.prepend(box);
        }
        const value = document.createElement('div');
        value.className = 'school-value';
        value.textContent = formatShare(row.schoolValue, 0);
        const caption = document.createElement('div');
        caption.className = 'school-value-caption';
        caption.textContent = metric.caption(this.context.palette);
        box.replaceChildren(value, caption);

        // `initializeSVG` drew the SVG just now, so it has a position.
        const origin = /** @type {{x: number, y: number}} */ (this.svgOrigin());
        box.style.width = `${SCHOOL_BOX.widthPx}px`;
        // At the SVG's left edge: the plot's padding joins the gap between box and plot.
        box.style.left = `${origin.x}px`;
        box.style.top = `${origin.y + layout.chart.y + yScale(0)}px`;
    }
}

/**
 * ClassDeviationChart — one subject×domain row of the SL "Überblick" view.
 *
 * Reduces the row to a single school value, drawn in a box on the left, and
 * plots every reference average and every class as a vertical bar above or
 * below the zero baseline: that column's deviation from the school value, in
 * percentage points. Averages lead, separated from the classes by a divider.
 *
 * Extends ChartRenderer directly rather than BarChartRenderer — the latter adds
 * only stacked-bar highlight helpers this chart never uses (same reasoning as
 * LollipopChartRenderer).
 *
 * The y domain is supplied by the view, not derived here: every row shares it so
 * bar heights stay comparable across subjects. The column band, by contrast, is
 * this card's own — it is the row's entries, so a column exists exactly where a
 * bar does. A shared band would import columns from other subjects, which on
 * API data are the majority: a test group sits one subject, so its
 * column can never hold a bar on another subject's card.
 */

import {
    ChartRenderer,
    createOpacityHoverEffect,
} from '../../../../common/charts/renderers/chartRenderer.js';
import { chartLayoutPreset } from '../../../../common/charts/chartAxisUtils.js';
import {
    MAX_LABEL_LINES,
    fitLabelLine,
    splitLabelLines,
} from '../../../../common/charts/chartLabelFit.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import { getNumberFormat } from '../../../../common/utils/numberFormat.js';
import { ABSENCE_REASONS, isEntryFavourable } from '../../../utils/slSchoolSummaryMetrics.js';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary/glossaryText.js';
import * as d3 from 'd3';

// ============================================================================
// CONSTANTS
// ============================================================================

const CHART_CONFIG = Object.freeze({
    defaultWidth: 720,
    defaultHeight: 180,

    /** Left gutter reserved for the school value box. */
    schoolBoxWidth: 152,
    schoolBoxGap: 20,
    schoolBoxRadius: 10,
    schoolBoxPaddingX: 10,
    schoolBoxPaddingY: 12,
    schoolBoxStrokeWidth: 1.5,

    /**
     * Top gutter reserved for the class column labels, per number of label lines.
     * The view picks one for every card at once — a per-card band would change
     * `chart.height`, and with it the pixels one percentage point is worth, which
     * is exactly the comparability the shared y domain exists to protect.
     */
    classLabelBand: 26,
    classLabelBandTwoLine: 40,
    classLabelBaselineGap: 9,
    classLabelLineHeightScale: 1.15,
    bottomGutter: 12,

    /** Vertical room kept free at both ends so a bar's label never clips. */
    labelReserve: 18,
    valueLabelGap: 5,

    barPaddingInner: 0.5,
    barPaddingOuter: 0.4,
    maxBarWidth: 72,
    /** Keeps a near-zero deviation visible as a hairline instead of nothing. */
    minBarHeight: 1,

    /** Divider between the leading average columns and the class columns. */
    dividerDash: '4 4',
    dividerWidth: 1,

    /** The school value is a display numeral — deliberately larger than --fs-lg. */
    schoolValueFontScale: 1.6,
    captionLineHeightScale: 1.35,
});

const TOOLTIP_ID = 'class-deviation';

/**
 * Why this card has no bars, per cause.
 *
 * The absences have different remedies and only some are defects, so a single
 * "keine Daten" would tell a Schulleitung nothing it could act on:
 *
 * - `NO_CLASS_DATA` — the export ships a Landesschnitt for this subject×domain but no
 *   school or class rows. A gap in the export.
 * - `NO_SCHOOL_ROW` — the classes are there but the school's own row is not, so there
 *   is no school value to deviate from. A gap in the export.
 * - `METRIC_UNSUPPORTED` — the classes are there, but this metric cannot be answered
 *   on their scale. Correct and permanent: Niedersachsen's Englisch ladder stops at
 *   B1, so it has no top-rank level, and reporting 0 % would be a lie.
 * - `NO_CLASS_VALUES` — the school resolved but no individual class did.
 *
 * Every sentence is the card's glossary copy; an absence without a reason reads as
 * `NO_CLASS_DATA`, whichever way it was reported.
 * @param {{reason?: string}|null} absence - Which cause applies, from `ABSENCE_REASONS`.
 * @param {{label: () => string, unsupportedMessage: string}} metric - The metric, which names itself and says why it can be unanswerable.
 * @returns {string} The sentence to show in place of the bars.
 */
function buildNoDataMessage(absence, metric) {
    const reason = absence?.reason ?? ABSENCE_REASONS.NO_CLASS_DATA;
    const messageKey =
        reason === ABSENCE_REASONS.METRIC_UNSUPPORTED ? metric.unsupportedMessage : reason;
    return applyTemplateTokens(
        glossaryAnnotator.getRequiredEntryText(`sl.summary.deviation.messages.${messageKey}`),
        { Kennzahl: metric.label() },
    );
}

/** Narrowest a column may get before its bar stops being readable. */
const MIN_COLUMN_SLOT = 56;
/** Card padding and border around the chart surface (see content-module.css). */
const CARD_CHROME_WIDTH = 44;
/** Breathing room between two neighbouring column labels. */
const LABEL_GAP = 10;
/**
 * Width of one label character, as a fraction of the label font size.
 *
 * An estimate, not a measurement, and deliberately so: this feeds a *floor for a
 * CSS grid track*, which the view has to know before any chart exists. The only
 * measurement primitives are `ChartRenderer` instance methods and
 * `charts/renderers/internal/`, neither of which a view can reach without
 * forking that boundary. Where exactness matters — fitting a label into the band
 * it actually got — the chart measures instead (`fitLabelLine`).
 *
 * Sized for the upper case and digits these labels are full of (`D_E_08a_ABCD`),
 * which run wider than the 0.5em a lower-case average would suggest.
 */
const LABEL_CHAR_WIDTH_EM = 0.62;
/** `--fs-sm` at its 12px floor, the size column labels are drawn at. */
const LABEL_FONT_SIZE = 12;

/**
 * Narrowest a row card may be drawn at, given the labels its columns carry.
 *
 * The view hands this to CSS as `--summary-row-min-width` so the responsive
 * grid knows when a second card still fits beside this one; past a third of the
 * container the grid drops to two cards per row, then to one (summary.css). A
 * subject whose test groups have long names therefore takes a whole row, which
 * is the intended trade — a column too narrow for its label is unreadable
 * whatever else the grid gains.
 *
 * It lives here because it is derived from this chart's geometry — a layout
 * guess in the view would drift the moment the gutter or bar widths change.
 *
 * The slot is compared against the band **step**, not `bandwidth()`: the step is
 * what sets label centre-to-centre distance, and for this scale it is ≈ width/n,
 * which is what multiplying by the column count models.
 * @param {string[]} labels - Every column label the widest card carries, averages included.
 * @returns {number} width in px
 */
export function estimateMinRowWidth(labels) {
    const columns = labels?.length ?? 0;
    const widestLine = (labels ?? []).reduce(
        (widest, label) => Math.max(widest, ...splitLabelLines(label).map((line) => line.length)),
        0,
    );

    const labelSlot = widestLine * LABEL_CHAR_WIDTH_EM * LABEL_FONT_SIZE + LABEL_GAP;

    return (
        CHART_CONFIG.schoolBoxWidth +
        CHART_CONFIG.schoolBoxGap +
        Math.max(1, columns) * Math.max(MIN_COLUMN_SLOT, labelSlot) +
        CARD_CHROME_WIDTH
    );
}

/**
 * How many lines the column labels of a whole view need.
 *
 * Asked once for every card together: the label band is part of `chart.height`,
 * so a card that reserved fewer lines would draw the same deviation at a
 * different pixel height and break the shared y domain.
 * @param {string[]} labels - Every column label across every card.
 * @returns {number} 1 or 2.
 */
export function resolveLabelLineCount(labels) {
    return (labels ?? []).some((label) => splitLabelLines(label).length > 1) ? MAX_LABEL_LINES : 1;
}

const percentFormatter = getNumberFormat({ style: 'percent', maximumFractionDigits: 0 });

const percentPreciseFormatter = getNumberFormat({
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});

const deviationFormatter = getNumberFormat({
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
});

/**
 * Percentage points, e.g. `+3,7 PP`. Not `%` — these are differences of percentages.
 * @param {number} deltaPP - The deviation.
 * @returns {string} The formatted value, always signed so the direction is explicit.
 */
function formatDeviation(deltaPP) {
    return `${deviationFormatter.format(deltaPP)} PP`;
}

// ============================================================================
// CLASS DEVIATION CHART
// ============================================================================

export class ClassDeviationChart extends ChartRenderer {
    /**
     * @param {string} containerId - Id of the element the chart draws into.
     * @param {object} data - { row, absence, yDomain, labelLines, metric }
     * @param {object} [options] - Renderer options.
     */
    constructor(containerId, data, options = {}) {
        super(containerId, {
            defaultWidth: CHART_CONFIG.defaultWidth,
            defaultHeight: CHART_CONFIG.defaultHeight,
            ...options,
            layout: chartLayoutPreset('paddedNoLegend', {
                axis: {
                    left: CHART_CONFIG.schoolBoxWidth + CHART_CONFIG.schoolBoxGap,
                    // Read off `data` rather than off the row's own labels: the band
                    // is the view's decision for every card at once (see CHART_CONFIG).
                    top:
                        data?.labelLines >= 2
                            ? CHART_CONFIG.classLabelBandTwoLine
                            : CHART_CONFIG.classLabelBand,
                    bottom: CHART_CONFIG.bottomGutter,
                },
            }),
        });

        this.setData(data);
    }

    /** @override */
    validateData() {
        const { row } = this.getData() ?? {};
        return Boolean(row?.entries?.length);
    }

    /**
     * This is the only place the reason can be applied: `ChartRenderer` checks
     * `validateData()` itself and calls `showNoDataMessage()` with no argument before
     * `renderChart()` ever runs, so a message chosen inside `renderChart` is
     * unreachable. Defaulting here rather than passing one down keeps that base-class
     * path intact.
     * @override
     * @param {string} [message] - An explicit message; omitted, one is derived from the row's absence reason.
     */
    showNoDataMessage(message) {
        const data = this.getData();
        super.showNoDataMessage(message ?? buildNoDataMessage(data?.absence, data?.metric));
    }

    /** @override */
    formatTooltipContent(entry) {
        const { row, metric } = this.getData();

        return this.buildTooltipHTML({
            title: `${row.rowLabel} — ${entry.label}`,
            rows: [
                // The group's own name, not the column label: the label may be the
                // Stammklasse, and the name says which course of it this bar is.
                {
                    label: entry.kind === 'average' ? entry.name : `Klasse ${entry.name}`,
                    value: percentPreciseFormatter.format(entry.value),
                },
                { label: 'Schule', value: percentPreciseFormatter.format(row.schoolValue) },
                { label: 'Differenz', value: formatDeviation(entry.deltaPP) },
                { label: 'Metrik', value: metric.label() },
            ],
        });
    }

    /** @override */
    renderChart() {
        // No `validateData()` guard here on purpose: ChartRenderer applies it before
        // calling this, so a guard would be dead code — see showNoDataMessage above.
        const data = this.getData();
        const { svg, g, layout } = this.initializeSVG();
        this.svg = svg;
        this.g = g;
        this.mainGroup = g;

        const { chart } = layout;
        const scales = this.#createScales(data, chart);

        this.#renderSchoolValueBox(svg, layout, scales, data);
        this.#renderZeroBaseline(g, chart, scales);
        this.#renderAverageDivider(g, chart, scales, data);
        this.#renderColumns(g, scales, data);

        this.normalizeSvgTypography(svg);
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    #createScales({ row, yDomain }, chart) {
        const xScale = d3
            .scaleBand()
            .domain(row.entries.map((entry) => entry.name))
            .range([0, chart.width])
            .paddingInner(CHART_CONFIG.barPaddingInner)
            .paddingOuter(CHART_CONFIG.barPaddingOuter);

        // The shared symmetric domain puts the baseline at the vertical centre.
        // `labelReserve` keeps the tallest bar's label inside the chart area.
        const yScale = d3
            .scaleLinear()
            .domain(yDomain)
            .range([chart.height - CHART_CONFIG.labelReserve, CHART_CONFIG.labelReserve]);

        return { xScale, yScale, barWidth: Math.min(xScale.bandwidth(), CHART_CONFIG.maxBarWidth) };
    }

    /**
     * Band centre in chart-area coordinates.
     * @param {any} xScale - Column band scale.
     * @param {string} columnName - The column to locate.
     * @returns {number} Its centre in px.
     */
    #bandCenter(xScale, columnName) {
        return xScale(columnName) + xScale.bandwidth() / 2;
    }

    #renderZeroBaseline(g, chart, { yScale }) {
        const colors = getThemeColors();

        g.append('line')
            .attr('class', 'zero-baseline')
            .attr('x1', 0)
            .attr('x2', chart.width)
            .attr('y1', yScale(0))
            .attr('y2', yScale(0))
            .attr('stroke', colors.chrome.textSecondary)
            .attr('stroke-width', 1.5);
    }

    /**
     * Vertical rule between the leading average columns and the class columns —
     * without it a Landesschnitt bar reads as just another class.
     * @param {d3.Selection} g - The plot group the rule is drawn into.
     * @param {object} chart - The measured chart area.
     * @param {object} scales - The scales this render was built with.
     * @param {any} scales.xScale - Column band scale.
     * @param {object} data - The row being drawn.
     * @param {object} data.row - The row, whose entries lead with the averages; the first `class` one is where the rule goes.
     */
    #renderAverageDivider(g, chart, { xScale }, { row }) {
        const entries = row.entries;
        const firstClassIndex = entries.findIndex((entry) => entry.kind === 'class');
        if (firstClassIndex <= 0) return;

        const previous = entries[firstClassIndex - 1];
        const next = entries[firstClassIndex];
        const x = (xScale(previous.name) + xScale.bandwidth() + xScale(next.name)) / 2;

        g.append('line')
            .attr('class', 'average-divider')
            .attr('x1', x)
            .attr('x2', x)
            .attr('y1', 0)
            .attr('y2', chart.height)
            .attr('stroke', getThemeColors().chrome.border)
            .attr('stroke-width', CHART_CONFIG.dividerWidth)
            .attr('stroke-dasharray', CHART_CONFIG.dividerDash);
    }

    #renderColumns(g, scales, data) {
        const { xScale, yScale, barWidth } = scales;
        const { row, metric } = data;
        const colors = getThemeColors();
        const entries = row.entries;

        // Colour encodes good/bad news for the school, not the raw sign: on
        // `below_minimum` an upward class bar means more struggling students, and
        // an average bar is read from the school's side of the gap.
        const isFavourable = (entry) => isEntryFavourable(entry, metric.higherIsBetter);

        // Column headers. Every column carries a bar, so none needs muting or a
        // placeholder: a class this card has no value for gets no column at all.
        this.#renderColumnLabels(g, xScale, entries, colors);

        const barsGroup = g.append('g').attr('class', 'deviation-bars');

        const bars = barsGroup
            .selectAll('rect')
            .data(entries)
            .join('rect')
            .attr(
                'class',
                (entry) =>
                    `deviation-bar deviation-bar--${entry.kind} ${isFavourable(entry) ? 'deviation-bar--favourable' : 'deviation-bar--unfavourable'}`,
            )
            .attr('x', (entry) => this.#bandCenter(xScale, entry.name) - barWidth / 2)
            .attr('width', barWidth)
            .attr('y', (entry) => Math.min(yScale(0), yScale(entry.deltaPP)))
            .attr('height', (entry) =>
                Math.max(CHART_CONFIG.minBarHeight, Math.abs(yScale(entry.deltaPP) - yScale(0))),
            )
            // A tint of the sign's hue with a hairline edge: the label carries the
            // magnitude, the fill only the sign — and "behind the school" no longer
            // wears the falsch red of a result bar.
            .attr('fill', (entry) =>
                isFavourable(entry) ? colors.tint.positive : colors.tint.negative,
            )
            .attr('stroke', (entry) =>
                isFavourable(entry) ? colors.tint.positiveEdge : colors.tint.negativeEdge,
            )
            .attr('stroke-width', 1);

        this.wireTooltipEvents(bars, {
            getTooltipContent: (entry) => this.formatTooltipContent(entry),
            hoverEffect: createOpacityHoverEffect(),
            tooltipId: TOOLTIP_ID,
        });

        // Signed labels sit outside the bar so they stay legible on every fill
        // and in every KS colour theme.
        this.applyChartTextSize(
            barsGroup
                .selectAll('text')
                .data(entries)
                .join('text')
                .attr('class', 'deviation-label')
                .style('pointer-events', 'none')
                .attr('x', (entry) => this.#bandCenter(xScale, entry.name))
                .attr('y', (entry) =>
                    entry.deltaPP >= 0
                        ? yScale(entry.deltaPP) - CHART_CONFIG.valueLabelGap
                        : yScale(entry.deltaPP) + CHART_CONFIG.valueLabelGap,
                )
                .attr('dominant-baseline', (entry) => (entry.deltaPP >= 0 ? 'auto' : 'hanging'))
                .attr('text-anchor', 'middle')
                .attr('fill', colors.chrome.text)
                .text((entry) => formatDeviation(entry.deltaPP)),
            'sm',
        );
    }

    /**
     * The column headers, one `text` per column and one `tspan` per label line.
     *
     * Lines are laid out upwards from the band's baseline, so the last line of
     * every label sits on it. A one-line label in a card whose band reserves two
     * therefore stays aligned with its neighbours' lower line rather than
     * floating between them.
     * @param {d3.Selection} g - The plot group the labels are drawn into.
     * @param {any} xScale - Column band scale.
     * @param {Array<object>} entries - The row's entries, one column each.
     * @param {object} colors - Resolved theme colors.
     */
    #renderColumnLabels(g, xScale, entries, colors) {
        const lineHeight = this.resolveChartTextSize('sm') * CHART_CONFIG.classLabelLineHeightScale;
        // `step`, not `bandwidth`: the step is the distance to the next label's centre.
        const slot = Math.max(0, xScale.step() - LABEL_GAP);

        const labels = g
            .append('g')
            .attr('class', 'class-labels')
            .style('pointer-events', 'none')
            .selectAll('text')
            .data(entries)
            .join('text')
            .attr('class', (entry) => `class-label class-label--${entry.kind}`)
            .attr('x', (entry) => this.#bandCenter(xScale, entry.name))
            .attr('y', -CHART_CONFIG.classLabelBaselineGap)
            .attr('text-anchor', 'middle')
            .attr('fill', colors.chrome.text);

        labels.each((entry, index, nodes) => {
            const text = d3.select(nodes[index]);
            const lines = splitLabelLines(entry.label);

            lines.forEach((line, lineIndex) => {
                text.append('tspan')
                    .attr('x', text.attr('x'))
                    .attr('y', text.attr('y'))
                    .attr('dy', `${-(lines.length - 1 - lineIndex) * lineHeight}px`)
                    .text(fitLabelLine(this, line, slot, { textSize: 'sm' }));
            });
        });

        this.applyChartTextSize(labels, 'sm');
    }

    #renderSchoolValueBox(svg, layout, { yScale }, { row, metric }) {
        const colors = getThemeColors();
        const boxX = Math.max(
            0,
            layout.chart.x - CHART_CONFIG.schoolBoxGap - CHART_CONFIG.schoolBoxWidth,
        );
        const centerY = layout.chart.y + yScale(0);

        const valueFontSize = this.resolveChartTextSize('lg') * CHART_CONFIG.schoolValueFontScale;
        const captionFontSize = this.resolveChartTextSize('sm');
        const captionLineHeight = captionFontSize * CHART_CONFIG.captionLineHeightScale;

        const captionLines = this.#wrapCaption(
            metric.caption(),
            CHART_CONFIG.schoolBoxWidth - CHART_CONFIG.schoolBoxPaddingX * 2,
            captionFontSize,
        );

        const contentHeight = valueFontSize + captionLines.length * captionLineHeight;
        const boxHeight = Math.min(
            contentHeight + CHART_CONFIG.schoolBoxPaddingY * 2,
            layout.container.height,
        );
        const boxY = centerY - boxHeight / 2;

        const box = svg.append('g').attr('class', 'school-value-box');

        box.append('rect')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', CHART_CONFIG.schoolBoxWidth)
            .attr('height', boxHeight)
            .attr('rx', CHART_CONFIG.schoolBoxRadius)
            .attr('fill', colors.chrome.surface)
            .attr('stroke', colors.chrome.textSecondary)
            .attr('stroke-width', CHART_CONFIG.schoolBoxStrokeWidth);

        const centerX = boxX + CHART_CONFIG.schoolBoxWidth / 2;
        const valueBaseline = boxY + CHART_CONFIG.schoolBoxPaddingY + valueFontSize * 0.82;

        box.append('text')
            .attr('class', 'school-value')
            .attr('x', centerX)
            .attr('y', valueBaseline)
            .attr('text-anchor', 'middle')
            .style('font-size', `${valueFontSize}px`)
            .style('font-weight', 'var(--fw-semibold)')
            .attr('fill', colors.chrome.text)
            .text(percentFormatter.format(row.schoolValue));

        box.append('g')
            .attr('class', 'school-value-caption')
            .selectAll('text')
            .data(captionLines)
            .join('text')
            .attr('x', centerX)
            .attr('y', (_line, index) => valueBaseline + (index + 1) * captionLineHeight)
            .attr('text-anchor', 'middle')
            .style('font-size', `${captionFontSize}px`)
            .attr('fill', colors.chrome.textSecondary)
            .text((line) => line);
    }

    /**
     * Greedy word wrap against the measured width of the box's inner area.
     * @param {any} caption - The caption text.
     * @param {number} maxWidth - Width available in px.
     * @param {number} fontSize - Size the text is measured at.
     * @returns {string[]} One entry per rendered line.
     */
    #wrapCaption(caption, maxWidth, fontSize) {
        const words = String(caption ?? '')
            .split(/\s+/)
            .filter(Boolean);
        if (words.length === 0) return [];

        const lines = [];
        let current = '';

        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            const tooWide = this.measureTexts([candidate], { fontSize }).maxWidth > maxWidth;

            if (current && tooWide) {
                lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }

        if (current) lines.push(current);
        return lines;
    }
}

/**
 * ItemSuccessLollipopChart — each Mathe item's solution rate as a lollipop coloured by
 * its Aufgabenniveau, grouped by Leitidee, with a marker per comparison group.
 */

import {
    fitItemPitch,
    groupByDomain,
    lollipopMarkSizes,
} from '../../../../common/charts/renderers/lollipopMarks.js';
import { ItemLollipopChartRenderer } from '../../../../common/charts/renderers/itemLollipopChartRenderer.js';
import {
    REFERENCE_LINE_CLASS,
    appendAxisBaseline,
    categoryLabelBaseline,
} from '../../../../common/charts/chartAxisUtils.js';
import { AXIS_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import { LABEL_LINE_HEIGHT_EM } from '../../../../common/charts/chartLabelFit.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { MA_DOMAIN_TERM } from '../../../maTerms.js';
import { formatPercent } from '../../../../common/utils/numberFormat.js';
import { layoutDomains } from './itemSuccessLollipopLayout.js';

/**
 * The item record fields the chart reads.
 * @typedef {object} ItemSuccessItem
 * @property {string} iqbId - The item's id, which positions it.
 * @property {string} name
 * @property {string} exerciseName
 * @property {string} domainLabel - The Leitidee's name.
 * @property {number} meanPercentage - The payload mean in percent, like the comparison means beside it — not the result-count share the item table's bar draws.
 * @property {string} competenceLevel - The item's Aufgabenniveau.
 */

/** @typedef {import('../../../../common/domain/itemComparisonGroups.js').ItemComparisonGroup} ItemComparisonGroup */

/** @augments ItemLollipopChartRenderer */
export class ItemSuccessLollipopChart extends ItemLollipopChartRenderer {
    /**
     * @param {HTMLElement} container
     * @param {ItemSuccessItem[]} items
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & {comparisonGroups: ItemComparisonGroup[]}} options - `comparisonGroups`: those items.json carries means for; the comparison state picks the ones shown first.
     */
    constructor(container, items, options) {
        super(container, {
            legend: 'auto',
            layout: { padding: { top: 15 } },
            ...options,
        });

        /** @type {ItemSuccessItem[]} */
        this.items = items;
        /** The Leitideen the items name, in item order. */
        this.domainLabels = [...new Set(items.map((item) => item.domainLabel))];
    }

    /** @override */
    validateData() {
        return this.items.length > 0;
    }

    /**
     * The item, its solution rate, then each shown comparison group's value for it: the
     * markers sit under the item's hit band, so their values are said here.
     * @override
     * @param {ItemSuccessItem} segment
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     */
    formatTooltipContent(segment) {
        return {
            title: segment.exerciseName,
            rows: [
                { label: TERM_CONSTANTS.SUBTASK, value: segment.name },
                { label: MA_DOMAIN_TERM, value: segment.domainLabel },
                { label: TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL, value: segment.competenceLevel },
                {
                    label: TERM_CONSTANTS.SOLUTION_RATE,
                    value: formatPercent(segment.meanPercentage),
                },
                ...this.itemComparisonRows(segment),
            ],
        };
    }

    /**
     * The items drawn, by Leitidee as the plot groups them: each Teilaufgabe with its
     * Aufgabe, Leitidee and Aufgabenniveau.
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null}
     */
    dataTable() {
        return this.itemDataTable(
            groupByDomain(this.items).flatMap(([, items]) => items),
            {
                columns: [
                    { label: TERM_CONSTANTS.SUBTASK },
                    { label: TERM_CONSTANTS.EXERCISE },
                    { label: MA_DOMAIN_TERM },
                    { label: TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL },
                ],
                cells: (item) => [
                    { text: item.name },
                    { text: item.exerciseName },
                    { text: item.domainLabel },
                    { text: item.competenceLevel },
                ],
            },
        );
    }

    /**
     * The drawn items' levels, then the comparison groups.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey|null}
     */
    chartKey() {
        return this.itemLollipopLegend(this.items.map((item) => item.competenceLevel));
    }

    /** @override */
    renderChart() {
        const { items } = this;

        const axisLeftSpace = this.measureSolutionRateAxis();
        const domainLabels = this.#measureDomainLabels();
        // Every item gets at least the shared minimum pitch (`layoutDomains` spends
        // n + D + 2 pitches on n items in D Leitideen).
        fitItemPitch(this, items.length + this.domainLabels.length + 2, axisLeftSpace);

        // Entering marks rise and fade in, which a first draw (or one after a message)
        // must not do; `create()` and the message states clear `this.svg`.
        const durationMs = this.drawDurationMs;
        const { g, dimensions, layout } = this.initializeSVG({
            left: axisLeftSpace,
            bottom: domainLabels.reserve,
        });
        const { width, height } = layout.chart;
        const { x, spans } = layoutDomains(items, width);
        /** @type {(d: {iqbId: string}) => number} */
        const xOf = (d) => /** @type {number} */ (x.get(d.iqbId));
        const yScale = this.drawSolutionRateAxis(g, { width, height });
        this.drawSolutionRateTitle(
            g,
            this.context.glossary.resolveEntryKey(TERM_CONSTANTS.SOLUTION_RATE) ?? undefined,
        );
        // The x axis is a baseline only: the Leitidee labels under it name the items.
        appendAxisBaseline(g, { x1: 0, x2: width, y: height });

        const { circleRadius, lineStrokeWidth } = lollipopMarkSizes(dimensions.geometryScale);
        this.joinItemLollipops(g, items, {
            x: xOf,
            yScale,
            stemWidthPx: lineStrokeWidth,
            headRadiusPx: circleRadius,
            durationMs,
        });

        this.#drawDomainSeparatorsAndLabels(g, spans, domainLabels, width, height);
    }

    /**
     * The Leitidee labels, alternating over two rows so neighbours cannot collide, with
     * their measured widths, and the axis space they take: the tick padding, two label
     * rows and the edge buffer.
     * @returns {{widths: Map<string, number>, rowStep: number, reserve: number}} No widths and no reserve for a single Leitidee.
     */
    #measureDomainLabels() {
        const domains = this.domainLabels;
        if (domains.length <= 1) return { widths: new Map(), rowStep: 0, reserve: 0 };

        const { sizes, maxHeight } = this.measureTexts(domains);
        const rowStep = this.resolveChartTextSize() * LABEL_LINE_HEIGHT_EM;
        return {
            widths: new Map(domains.map((domain, i) => [domain, sizes[i].width])),
            rowStep,
            reserve:
                AXIS_DEFAULTS.tickPaddingPx + maxHeight + rowStep + AXIS_DEFAULTS.edgeTickBufferPx,
        };
    }

    /**
     * A separator midway between two Leitideen, and each Leitidee's label centred under
     * its items, kept inside the plot, where a d3 bottom axis would put its tick labels;
     * every second label one row lower. Both join by Leitidee.
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} g
     * @param {import('./itemSuccessLollipopLayout.js').DomainLayout['spans']} spans
     * @param {{widths: Map<string, number>, rowStep: number}} domainLabels
     * @param {number} width
     * @param {number} height - Where the labels hang from.
     */
    #drawDomainSeparatorsAndLabels(g, spans, domainLabels, width, height) {
        const labelled = domainLabels.widths.size > 0;
        // A separator stands left of each Leitidee but the first, keyed by it.
        const gaps = labelled
            ? spans.slice(1).map((span, k) => ({
                  domain: span.domain,
                  x: (spans[k].x1 + span.x0) / 2,
              }))
            : [];
        g.selectChildren('line.domain-separator')
            .data(gaps, (d) => /** @type {{domain: string}} */ (d).domain)
            .join((enter) =>
                enter
                    .append('line')
                    .attr('class', `${REFERENCE_LINE_CLASS.separator} domain-separator`),
            )
            .attr('x1', (d) => d.x)
            .attr('x2', (d) => d.x)
            .attr('y1', 0)
            .attr('y2', height);

        const baseline = height + categoryLabelBaseline(this);
        g.selectChildren('text.domain-label')
            .data(labelled ? spans : [], (d) => /** @type {{domain: string}} */ (d).domain)
            .join((enter) =>
                enter
                    .append('text')
                    .attr('class', 'domain-label axis-tick-label')
                    .attr('text-anchor', 'middle'),
            )
            .attr('x', ({ domain, x0, x1 }) => {
                const half = /** @type {number} */ (domainLabels.widths.get(domain)) / 2;
                return Math.max(half, Math.min(width - half, (x0 + x1) / 2));
            })
            .attr('y', (_, k) => baseline + (k % 2) * domainLabels.rowStep)
            .text((d) => d.domain);
    }
}

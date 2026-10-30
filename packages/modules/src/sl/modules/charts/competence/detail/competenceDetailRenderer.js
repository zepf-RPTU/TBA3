/**
 * CompetenceDetailRenderer — the detail-mode competence distribution chart: 1..N
 * Domänen with every group per Domäne, an interactive HTML legend in a side panel,
 * and the teaching-quality box-plots or stacked bars.
 *
 * As a thumbnail (`options.thumbnail`) it renders bar geometry only — no axes, axis
 * titles, legends, labels or tooltip listeners — as a watermark. It mirrors the active teaching-quality geometry, so it stays aligned with the
 * full chart.
 */

import { createState } from '@tba3/module-base';
import { ChartRenderer } from '../../../../../common/charts/renderers/chartRenderer.js';
import { formatChartSubjectDomainLabel } from '../../../../../common/charts/domainLabelFormatter.js';
import { measureRatingAxisSpace } from '../../../../../common/charts/chartAxisUtils.js';
import { RATING_DOMAIN } from '../../../../../common/domain/apiValueMaps.js';
import { populationLabel, prepareCompetenceLevelNames } from '../shared/competenceChartData.js';
import {
    closeShareFrame,
    competenceShareTable,
    competenceShareTooltip,
    openShareFrame,
    shareAxisSpace,
} from '../shared/competenceShareFrame.js';
import { prepareCompetenceDetailChartData, rowHasTeachingQuality } from './competenceDetailData.js';
import { detailXDomain, getGroupingConfig, rowsInDrawOrder } from './competenceDetailGrouping.js';
import {
    buildDetailBottomAxisLabels,
    drawDetailBottomAxis,
    measureDetailBottomAxisSpace,
    measureDetailBottomLabelWidths,
} from './competenceDetailAxes.js';
import {
    measureDetailTopAxisSpace,
    measureDomainLabels,
    showsMultiDomainBarLabels,
} from './competenceDetailLabels.js';
import { createDetailBars } from './competenceDetailBars.js';
import { ALL_VISIBLE, requiredBarLayoutWidth } from './competenceDetailBarLayout.js';
import {
    TEACHING_QUALITY_AXIS_TITLE,
    drawTeachingQualityOverlay,
    removeTeachingQualityAxis,
    renderTeachingQualityAxis,
    resolveTeachingQualityEntries,
} from './competenceTeachingQuality.js';
import { buildDetailKey } from './competenceDetailLegend.js';
import { buildBarVisibility } from './competenceDetailVisibility.js';
import { buildLevelVisibility } from '../shared/competenceLegend.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import { BOX_STATS_COLUMNS, boxStatsCells } from '../../../../utils/slBoxPlotStats.js';
import { RATING_STATS_COLUMNS, ratingStatsCells } from '../../../../utils/slRatingAppearance.js';
import { VIZ_MODES } from '../../../../slVizModes.js';
import * as d3 from 'd3';

/** @typedef {import('./competenceDetailData.js').CompetenceChartRow} CompetenceChartRow */

/**
 * Options of the detail renderer, on top of what every chart renderer reads.
 * @typedef {import('../../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & {
 *     groupName?: string|null,
 *     showOnlySchoolData?: boolean,
 *     averagesHidden?: boolean,
 *     vizMode: string | import('@preact/signals-core').Signal<string>,
 *     teachingQuality?: Map<string, import('./competenceDetailData.js').TeachingQualityRow>|null,
 *     index: import('../../../../slCompetenceLevelIndex.js').CompetenceLevelIndex,
 * }} CompetenceDetailRendererOptions
 */

/**
 * What the chart draws, worked out once from its rows: none of it depends on the size
 * or the visualisation mode.
 * @typedef {object} DetailModel
 * @property {CompetenceChartRow[]} chartData
 * @property {boolean} hasTeachingQuality - Whether any row carries a Unterrichtsqualität mark.
 * @property {import('./competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @property {string[]} xDomain - The x-axis groups in draw order.
 * @property {{[groupKey: string]: CompetenceChartRow[]}} groups - Each x-axis group's rows, in the order its bars are drawn.
 * @property {ReturnType<typeof prepareCompetenceLevelNames>} levels - The bands across every row, and how each is painted.
 * @property {boolean} showBarLabels - Whether each bar is labelled above.
 * @property {import('./competenceDetailAxes.js').DetailBottomAxisLabel[]} bottomLabels - None for the watermark.
 */

/**
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {CompetenceChartRow[]} chartData
 * @param {string|null} groupName - The scope group, if any.
 * @param {boolean} thumbnail - Whether this is the watermark, which draws no labels.
 * @returns {DetailModel}
 */
function buildDetailModel(palette, chartData, groupName, thumbnail) {
    const hasTeachingQuality = chartData.some(rowHasTeachingQuality);
    const groupingConfig = getGroupingConfig(chartData, groupName, hasTeachingQuality);
    const xDomain = detailXDomain(chartData, groupingConfig);
    /** @type {DetailModel['groups']} */
    const groups = Object.fromEntries(
        [...d3.group(chartData, groupingConfig.getGroupKey)].map(([key, rows]) => [
            key,
            rowsInDrawOrder(rows, groupingConfig),
        ]),
    );
    return {
        chartData,
        hasTeachingQuality,
        groupingConfig,
        xDomain,
        groups,
        levels: prepareCompetenceLevelNames(palette, chartData),
        showBarLabels: showsMultiDomainBarLabels(chartData, groupingConfig),
        bottomLabels: thumbnail
            ? []
            : buildDetailBottomAxisLabels(chartData, xDomain, groupingConfig),
    };
}

export class CompetenceDetailRenderer extends ChartRenderer {
    /** @type {import('../shared/competenceLegend.js').SeriesShown} */
    #isShown = (key, group) => this.isSeriesShown(key, group);

    /**
     * @param {HTMLElement} container
     * @param {import('../shared/competenceChartData.js').SubjectCompetenceLevelsValueGroup[][]} domainBuckets - One group-entry array per Domäne.
     * @param {CompetenceDetailRendererOptions} options
     */
    constructor(container, domainBuckets, options) {
        super(container, {
            legend: 'side',
            ...options,
            layout: { padding: { top: 10 } },
        });

        /** @type {import('@tba3/module-base').State<{vizMode: string}>} The visualisation: the host's signal, so a switch redraws in place. */
        this.state = createState({ vizMode: options.vizMode });

        /** @type {CompetenceChartRow[]} Prepared once: it never changes for the renderer's life. */
        this.chartData = prepareCompetenceDetailChartData(
            this.context.palette,
            domainBuckets,
            options,
        );
        /** `null` without rows. */
        this.model =
            this.chartData.length > 0
                ? buildDetailModel(
                      this.context.palette,
                      this.chartData,
                      options.groupName ?? null,
                      this.options.thumbnail,
                  )
                : null;
    }

    /** @override */
    validateData() {
        return this.model !== null;
    }

    /**
     * The side panel's pills and, with the Unterrichtsqualität boxes, their reading key.
     * @override
     * @returns {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKey}
     */
    chartKey() {
        const model = /** @type {DetailModel} */ (this.model);
        return buildDetailKey(this.context.palette, this.context.glossary, model, {
            boxPlot: this.#showsQualityBoxes(model),
            averagesHidden: this.options.averagesHidden ?? false,
        });
    }

    /**
     * @param {DetailModel} model
     * @returns {boolean} Whether the Unterrichtsqualität draws as boxes on an axis of its own.
     */
    #showsQualityBoxes(model) {
        return (
            !this.options.thumbnail &&
            model.hasTeachingQuality &&
            this.state.vizMode.value === VIZ_MODES.BOXPLOT
        );
    }

    /**
     * The tooltip of one segment, counted on the bar's own row: titled with the row's
     * Bereich, subtitled with whom the bar counts, as the overview's.
     * @override
     * @param {{row: CompetenceChartRow, level: string}} segment
     * @param {{type?: string}} [context] - `type` is the bar's subtitle, its `populationLabel`.
     * @returns {import('../../../../../common/services/cursorTooltip.js').TooltipContent}
     */
    formatTooltipContent({ row, level }, { type } = {}) {
        return competenceShareTooltip(this, row, level, {
            title: this.#areaLabel(row),
            subtitle: type,
        });
    }

    /**
     * The Bereich a row's bar is of, in full: the Fach, with its Domäne where it has
     * several. The tooltip titles and the table rows read it.
     * @param {CompetenceChartRow} row
     * @returns {string}
     */
    #areaLabel(row) {
        return formatChartSubjectDomainLabel(
            row.subject,
            row.subjectDomainCount === 1 ? null : row.domainLabel,
            { abbreviate: false },
        );
    }

    /**
     * The bars the pills leave on, as tables: the Kompetenzstufen, one row per bar in
     * draw order, and, where the Unterrichtsqualität draws, its marks, one row per group
     * slot under its Fach — as box plot figures or as rating shares, as the mode draws them.
     * @override
     * @returns {import('../../../../../common/charts/host/chartDataTable.js').ChartDataTables} `null` without a model.
     */
    dataTable() {
        const model = this.model;
        if (!model) return null;
        const visibility = buildBarVisibility(this.#isShown, model.groupingConfig);
        const { competenceLevelNames, scaleIdForLevel } = model.levels;
        const levels = competenceLevelNames.filter(
            buildLevelVisibility(this.#isShown, this.context.palette, scaleIdForLevel),
        );
        const rows = model.xDomain.flatMap((key) => model.groups[key].filter(visibility.row));
        const quality =
            model.hasTeachingQuality && visibility.teachingQuality
                ? [...resolveTeachingQualityEntries(model.chartData, model.groupingConfig)]
                      .filter(([key]) => visibility.group(model.groups[key][0]))
                      .map(([, row]) => row)
                : [];
        const [qualityColumns, qualityCells] =
            this.state.vizMode.value === VIZ_MODES.BOXPLOT
                ? [BOX_STATS_COLUMNS, boxStatsCells]
                : [RATING_STATS_COLUMNS, ratingStatsCells];
        const headColumns = [{ label: TERM_CONSTANTS.AREA }, { label: TERM_CONSTANTS.VALUE_GROUP }];
        /**
         * @param {CompetenceChartRow} row
         * @param {string} area - The Bereich the row's figures are of.
         * @returns {import('../../../../../common/charts/host/chartDataTable.js').ChartDataCell[]}
         */
        const headOf = (row, area) => [
            { text: area },
            { text: populationLabel(row.type, row.name) },
        ];
        return [
            rows.length > 0 && {
                title: TERM_CONSTANTS.COMP_LEVELS,
                ...competenceShareTable(
                    rows.map((row) => ({
                        area: this.#areaLabel(row),
                        valueGroup: populationLabel(row.type, row.name),
                        row,
                        ladder: row.competenceLevelNames,
                    })),
                    levels,
                ),
            },
            quality.length > 0 && {
                title: TERM_CONSTANTS.TEACHING_QUALITY_MEASURE,
                columns: [...headColumns, ...qualityColumns],
                // Rated per Fach: the row it rides on is its Fach's first Domäne, whose
                // name is not the Bereich it is of.
                rows: quality.map((row) => [
                    ...headOf(row, row.subject),
                    ...qualityCells(
                        /** @type {import('./competenceDetailData.js').TeachingQualityStats} */ (
                            row.teachingQuality
                        ),
                    ),
                ]),
            },
        ];
    }

    /**
     * Draw the chart for the legend state, or bring the drawn one to it: the layout is
     * solved for the bars the legend leaves on, the marks join by group and bar, and a
     * hidden Kompetenzstufe leaves every bar. A legend toggle and a `vizMode` switch
     * redraw in place, so the viewer's toggles also survive a resize.
     * @override
     */
    renderChart() {
        const model = /** @type {DetailModel} */ (this.model);
        const { hasTeachingQuality, groupingConfig, levels, bottomLabels } = model;
        const labels = !this.options.thumbnail;
        const showTeachingQualityAxis = this.#showsQualityBoxes(model);
        const barLabelFontSize = this.resolveChartTextSize();
        const durationMs = this.drawDurationMs;

        /** @type {import('./competenceDetailBarLayout.js').LabelSpace|null} */
        let labelSpace = null;
        const axes = { left: 0, right: 0, bottom: 0, top: 0 };
        if (labels) {
            const domainLabels = measureDomainLabels(this, model, barLabelFontSize);
            labelSpace = {
                domainLabels,
                bottomLabelWidths: measureDetailBottomLabelWidths(this, bottomLabels),
            };

            axes.left = shareAxisSpace(this);
            if (showTeachingQualityAxis) {
                axes.right = measureRatingAxisSpace(this, 'right', {
                    min: RATING_DOMAIN[0],
                    max: RATING_DOMAIN[1],
                    axisTitleText: TEACHING_QUALITY_AXIS_TITLE,
                });
            }
            axes.bottom = measureDetailBottomAxisSpace(this, bottomLabels);
            axes.top = measureDetailTopAxisSpace(this, model, domainLabels, barLabelFontSize);

            // Every bar keeps a readable width and every label its clearance; where the
            // card is too narrow for that, the chart grows and scrolls rather than
            // squeezing either.
            this.fitContentWidth(
                requiredBarLayoutWidth({
                    xDomain: model.xDomain,
                    groups: model.groups,
                    groupingConfig,
                    hasTeachingQuality,
                    barLabelFontSize,
                    labelSpace,
                }) +
                    axes.left +
                    axes.right,
            );
        }

        const { g, width, height, yScale } = openShareFrame(this, axes, { axis: labels });
        const yScaleQuality = d3.scaleLinear().domain(RATING_DOMAIN).range([height, 0]);

        // The pills' state outlives the draw, so a redraw keeps the viewer's toggles. A
        // thumbnail has no key, so every pill reads on: it draws every bar, at the one
        // layout the bars solve for all of them.
        const isShown = this.#isShown;
        const visibility = this.options.thumbnail
            ? ALL_VISIBLE
            : buildBarVisibility(isShown, groupingConfig);
        const isLevelShown = buildLevelVisibility(
            isShown,
            this.context.palette,
            levels.scaleIdForLevel,
        );

        const bars = createDetailBars(this, g, {
            model,
            labelSpace,
            yScale,
            width,
            barLabelFontSize,
            visibility,
            isLevelShown,
            durationMs,
        });
        if (labels) {
            drawDetailBottomAxis(
                this,
                g,
                width,
                height,
                bottomLabels,
                bars.bottomLabelPlace,
                durationMs,
            );
        }
        if (hasTeachingQuality) {
            if (showTeachingQualityAxis) renderTeachingQualityAxis(this, g, yScaleQuality, width);
            else removeTeachingQualityAxis(g);
            drawTeachingQualityOverlay(this, bars.qualitySlots, {
                yScale,
                yScaleQuality,
                groupingConfig,
                barWidth: bars.barWidth,
                labels,
                durationMs,
            });
        }
        closeShareFrame(this, g, { axis: labels });
        if (bars.empty) this.renderAllHiddenOverlay();
    }
}

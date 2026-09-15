/**
 * CompetencyDetailRenderer — the detail-mode competency distribution chart: 1..N
 * Domänen with every class per Domäne, an interactive HTML legend in a side panel,
 * and the teaching-quality box-plots or stacked bars.
 *
 * Compact mode (`options.compact`) renders bar geometry only — no axes, axis titles,
 * legends, per-bar labels, domain headers or tooltip listeners — for the watermark
 * behind an overview thumbnail. A compact preview still mirrors the active
 * teaching-quality geometry, so the thumbnail stays aligned with the full chart.
 */

import { BarChartRenderer } from '../../../../../common/charts/renderers/barChartRenderer.js';
import {
    chartLayoutPreset,
    measurePercentAxisSpace,
    measureRatingAxisSpace,
} from '../../../../../common/charts/chartAxisUtils.js';
import { CHART_CONFIG, TYPE_ORDER } from '../shared/competencyChartConstants.js';
import {
    buildCompetencyTooltipRows,
    createStackedData,
    getUniqueValues,
    lookupLandesschnittDistribution,
    lookupTeachingQuality,
    prepareCompetencyDetailChartData,
    prepareCompetencyLevels,
} from '../shared/competencyChartData.js';
import { getGroupingConfig } from './competencyDetailGrouping.js';
import {
    addMultiDomainAxes,
    addSingleDomainAxes,
    measureDetailBottomAxisSpace,
} from './competencyDetailAxes.js';
import { measureDetailTopAxisSpace } from './competencyDetailLabels.js';
import { createMultiDomainBars, createStandardStackedBars } from './competencyDetailBars.js';
import {
    drawTeachingQualityBoxPlots,
    drawTeachingQualityStackedBars,
    renderTeachingQualityAxis,
} from './competencyTeachingQuality.js';
import { buildDetailLegendSections } from './competencyDetailLegend.js';
import { applyDetailLegendState } from './competencyDetailVisibility.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import * as d3 from 'd3';

/**
 * CompetencyDetailRenderer — detail mode of the competency distribution chart.
 * Consumes competence-levels.json entries directly.
 */
export class CompetencyDetailRenderer extends BarChartRenderer {
    /**
     * @param {string} containerId - Id of the element the chart draws into.
     * @param {Array|Array<Array>} data - JSON class entries (single domain: flat array; multi-domain: array of arrays)
     * @param {object} [options] - Renderer options; an external `legendContainer` switches the layout to one without an in-SVG legend.
     */
    constructor(containerId, data, options = {}) {
        const layout =
            options.layout ||
            (options.legendContainer
                ? chartLayoutPreset('noLegend')
                : chartLayoutPreset('rightLegend', {
                      legends: [{ position: 'right', gap: 10 }],
                  }));

        super(containerId, {
            defaultWidth: 900,
            defaultHeight: 500,
            ...options,
            layout,
        });

        this.setData(data);
        this.className = options.className || '';
        this.showOnlySchoolData = options.showOnlySchoolData || false;

        /**
         * Compact preview mode. When true, the renderer paints only the bar
         * geometry — no axes, no axis titles, no legends, no per-bar labels,
         * no tooltips, no domain/subject headers. Used by overview thumbnail
         * cards to show a watermark of the full chart.
         */
        this.compact = options.compact === true;

        /** @type {Array} Teaching quality data from DataStore */
        this._teachingQuality = options.teachingQuality || null;
        /** @type {Array|null} Persisted state-average competence rows */
        this._stateEntries = Array.isArray(options.stateEntries) ? options.stateEntries : null;

        /** @type {Array} Prepared chart data (populated in validateData) */
        this.chartData = [];
    }

    // ========================================================================
    // REACTIVE STATE
    // ========================================================================

    /** @override */
    getInitialState() {
        // Use this.options (set in ChartRenderer super constructor) instead of
        // this.qualityVizMode which is assigned after super() returns.
        // Compact previews suppress axes, legends, and tooltips, but they still
        // honor the requested teaching-quality viz mode.
        return { vizMode: this.options?.qualityVizMode || 'boxplot' };
    }

    /** @override */
    validateData() {
        this.chartData = this.#prepareChartData();
        return true;
    }

    /**
     * Suppress tooltip wiring in compact preview mode so the watermark is
     * non-interactive and avoids registering listeners we'd then have to clean up.
     * @override
     */
    wireTooltipEvents(selection, options = /** @type {any} */ ({})) {
        if (this.compact) return selection;
        return super.wireTooltipEvents(selection, /** @type {any} */ (options));
    }

    /**
     * Format tooltip content for detail competency chart segments.
     * @override
     */
    formatTooltipContent(segment, context = {}) {
        const { data, stackedData, level } = segment;
        const { type, showDomain } = context;

        const result = buildCompetencyTooltipRows(stackedData, level);

        if (result.noData) {
            return this.buildTooltipHTML({
                title: data?.name || 'Unbekannt',
                subtitle: type || '',
                rows: result.rows,
            });
        }

        let title;
        if (showDomain) {
            const hasSingleDomain = data.subjectDomainCount === 1;
            const subjectName = data.subjectLabel || data.subject?.toUpperCase() || '';
            title = hasSingleDomain
                ? `${data.name} - ${subjectName}`
                : `${data.name} - ${subjectName}: ${data.domainLabel}`;
        } else {
            title = data.name || data.domain;
        }

        return this.buildTooltipHTML({ title, subtitle: type, rows: result.rows });
    }

    /** @override */
    renderChart() {
        const containerElement = document.getElementById(this.containerId);
        if (!containerElement) return;

        // Drop the previous render's pills before anything can return early:
        // a no-data (or compact) render draws no legend, and a stale panel would
        // keep a live click binding pointing at an SVG that no longer exists.
        this.htmlLegend.reset();
        containerElement.innerHTML = '';

        if (this.chartData.length === 0) {
            this.showNoDataMessage();
            return;
        }

        this.#renderDetailMode();
    }

    // ========================================================================
    // TEACHING QUALITY
    // ========================================================================

    #hasTeachingQuality() {
        return this.chartData.some((d) => d.teachingQuality && d.type !== 'landesschnitt');
    }

    // ========================================================================
    // DATA PREPARATION
    // ========================================================================

    /**
     * Dispatch data preparation to single-domain or multi-domain pipeline based on input shape.
     * @returns {object} The prepared chart data.
     */
    #prepareChartData() {
        return prepareCompetencyDetailChartData(this.getData(), {
            className: this.className,
            showOnlySchoolData: this.showOnlySchoolData,
            lookupTeachingQuality: (className, subjectName) =>
                lookupTeachingQuality(this._teachingQuality, className, subjectName),
            lookupLandesschnittDistribution: (target) =>
                lookupLandesschnittDistribution(this._stateEntries, target),
        });
    }

    // ========================================================================
    // GROUPING CONFIG
    // ========================================================================

    // ========================================================================
    // RENDERING (main pipeline)
    // ========================================================================

    /** Main detail rendering pipeline — sets up chart base, scales, bars, axes, legends. */
    #renderDetailMode() {
        const hasTeachingQuality = this.#hasTeachingQuality();
        const showTeachingQualityAxis = hasTeachingQuality && this._state.vizMode === 'boxplot';
        const uniqueDomains = getUniqueValues(this.chartData, (d) => d.domain);
        const uniqueSubjects = getUniqueValues(this.chartData, (d) => d.subject);
        const classDataFiltered = this.chartData.filter((d) => d.type === 'class');
        const uniqueClassNames = getUniqueValues(classDataFiltered, (d) => d.name);
        const { xDomain, renderMode: resolvedRenderMode } = this.#resolveXDomain(
            uniqueDomains,
            uniqueSubjects,
            uniqueClassNames,
            hasTeachingQuality,
        );
        const groupingConfig = getGroupingConfig(
            this.chartData,
            this.className,
            hasTeachingQuality,
        );

        // Measure axes (skipped in compact preview mode — bars fill the container)
        const { competencyLevels, getColorForLevel, scaleIdForLevel } = prepareCompetencyLevels(
            this.chartData,
        );
        let leftAxis = 0;
        let bottomAxis = 0;
        let topAxis = 0;
        let rightAxis = 0;

        if (!this.compact) {
            this.calculateDimensions();
            const chartTextMeasureSize = this.getChartTextMeasureSize();
            leftAxis = measurePercentAxisSpace(this, 'left', {
                step: 10,
                axisTitleText: `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`,
            });
            if (showTeachingQualityAxis) {
                const { SCALE_MIN, SCALE_MAX } = CHART_CONFIG.TEACHING_QUALITY;
                rightAxis = measureRatingAxisSpace(this, 'right', {
                    min: SCALE_MIN,
                    max: SCALE_MAX,
                    axisTitleText: 'Unterrichtsqualität',
                });
            }
            bottomAxis = measureDetailBottomAxisSpace(this, xDomain, groupingConfig);
            topAxis = measureDetailTopAxisSpace(
                this,
                groupingConfig,
                resolvedRenderMode,
                hasTeachingQuality,
                chartTextMeasureSize,
            );
        }

        const { g, layout } = this.initializeSVG({
            axisOverrides: { left: leftAxis, right: rightAxis, bottom: bottomAxis, top: topAxis },
            legendConfigs: [],
        });

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;
        const chartTextMeasureSize = this.getChartTextMeasureSize();

        const { xScale, yScale, yScaleQuality, stackedData, renderMode } = this.#createDetailScales(
            xDomain,
            resolvedRenderMode,
            chartWidth,
            chartHeight,
            uniqueSubjects,
            uniqueClassNames,
            competencyLevels,
            g,
        );

        if (renderMode === 'multi-domain') {
            createMultiDomainBars(
                this,
                g,
                this.chartData,
                competencyLevels,
                getColorForLevel,
                xScale,
                yScale,
                stackedData,
                chartHeight,
                chartTextMeasureSize,
                hasTeachingQuality,
            );
            if (!this.compact) {
                addMultiDomainAxes(this, g, xScale, yScale, this.chartData, chartHeight);
            }
        } else {
            createStandardStackedBars(
                this,
                g,
                this.chartData,
                competencyLevels,
                getColorForLevel,
                xScale,
                yScale,
                stackedData,
                {
                    showDomain: true,
                },
            );
            if (!this.compact) {
                addSingleDomainAxes(this, g, xScale, yScale, this.chartData, chartHeight);
            }
        }

        if (hasTeachingQuality) {
            if (this.compact) {
                // Compact previews skip the right-hand TQ axis, but still mirror
                // the active teaching-quality geometry.
                if (this._state.vizMode === 'boxplot') {
                    drawTeachingQualityBoxPlots(
                        this,
                        g,
                        this.chartData,
                        xScale,
                        yScaleQuality,
                        groupingConfig,
                    );
                } else {
                    drawTeachingQualityStackedBars(
                        this,
                        g,
                        this.chartData,
                        xScale,
                        yScale,
                        groupingConfig,
                    );
                }
            } else {
                renderTeachingQualityAxis(
                    this,
                    g,
                    xScale,
                    yScale,
                    yScaleQuality,
                    chartWidth,
                    groupingConfig,
                );
            }
        }

        if (!this.compact) {
            this.renderAxisTitle(g, 'left', `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`, {
                fontWeight: 'bold',
                className: 'axis-label',
            });

            // The KS level→group map is per render and reaches the change handler
            // by closure. The legend state outlives the render, so a re-render
            // re-applies any toggles the viewer already made.
            const ksLegend = { ksLevelToGroup: /** @type {Map<string,string>|null} */ (null) };
            const state = this.htmlLegend.render(
                buildDetailLegendSections(
                    this,
                    competencyLevels,
                    getColorForLevel,
                    groupingConfig,
                    ksLegend,
                    scaleIdForLevel,
                ),
                (change) =>
                    applyDetailLegendState(this, change.state, {
                        groupingConfig,
                        yScale,
                        ksLevelToGroup: ksLegend.ksLevelToGroup,
                        group: change.group,
                    }),
            );
            if (this.htmlLegend.anyHidden()) {
                applyDetailLegendState(this, state, {
                    groupingConfig,
                    yScale,
                    ksLevelToGroup: ksLegend.ksLevelToGroup,
                    group: null,
                    duration: 0,
                });
            }
        }
    }

    /**
     * Determine the x-axis domain labels and rendering mode (multi-domain vs single-domain).
     * @param {string[]} uniqueDomains - The Domänen present; more than one switches to multi-domain mode.
     * @param {string[]} uniqueSubjects - The Fächer present.
     * @param {string[]} uniqueClassNames - The classes present.
     * @param {boolean} [hasTeachingQuality] - Whether a Unterrichtsqualität column is drawn, which needs its own slot even in single-domain mode.
     * @returns {{xDomain: string[], renderMode: string}} The x-axis ticks in draw order, and which bar builder they are meant for.
     */
    #resolveXDomain(uniqueDomains, uniqueSubjects, uniqueClassNames, hasTeachingQuality = false) {
        const isMultiDomain = uniqueDomains.length > 1;

        // Single-domain without TQ — simple name-based x-axis
        if (!isMultiDomain && !hasTeachingQuality) {
            return { xDomain: this.chartData.map((d) => d.name), renderMode: 'single-domain' };
        }

        const isByClassesMode = !!this.className;
        const isSingleSubjectView = uniqueSubjects.length === 1;
        const groupByDomain = isByClassesMode
            ? uniqueClassNames.length <= 1
            : !isSingleSubjectView && uniqueClassNames.length <= 1;
        const groupBySubject = groupByDomain && uniqueSubjects.length > 1;

        if (groupBySubject) {
            const subjectGroups = {};
            this.chartData.forEach((d) => {
                if (!subjectGroups[d.subject]) subjectGroups[d.subject] = [];
                subjectGroups[d.subject].push(d);
            });

            const xDomain = Object.keys(subjectGroups).sort((a, b) => {
                const aLabel = subjectGroups[a][0].subjectLabel || a;
                const bLabel = subjectGroups[b][0].subjectLabel || b;
                return aLabel.localeCompare(bLabel);
            });

            return { xDomain, renderMode: 'multi-domain' };
        }

        if (groupByDomain) {
            const domainGroups = {};
            this.chartData.forEach((d) => {
                const key = `${d.subject}|${d.domain}`;
                if (!domainGroups[key]) domainGroups[key] = [];
                domainGroups[key].push(d);
            });

            const xDomain = Object.keys(domainGroups).sort((a, b) => {
                const aParts = a.split('|');
                const bParts = b.split('|');
                if (aParts[0] !== bParts[0]) return aParts[0].localeCompare(bParts[0]);
                return aParts[1].localeCompare(bParts[1]);
            });

            return { xDomain, renderMode: 'multi-domain' };
        }

        const classGroups = {};
        this.chartData.forEach((d) => {
            if (!classGroups[d.name]) classGroups[d.name] = [];
            classGroups[d.name].push(d);
        });

        const xDomain = Object.keys(classGroups).sort((a, b) => {
            const aData = classGroups[a][0];
            const bData = classGroups[b][0];
            if (TYPE_ORDER[aData.type] !== TYPE_ORDER[bData.type]) {
                return TYPE_ORDER[aData.type] - TYPE_ORDER[bData.type];
            }
            return a.localeCompare(b);
        });

        return { xDomain, renderMode: 'multi-domain' };
    }

    /**
     * Create D3 scales (x, y, yQuality), stacked data, and resolved render mode.
     * @param {string[]} xDomain - The x-axis ticks in draw order.
     * @param {string} renderMode - Which bar builder the scales are for.
     * @param {number} chartWidth - Plot width in px.
     * @param {number} chartHeight - Plot height in px.
     * @param {string[]} uniqueSubjects - The Fächer present.
     * @param {string[]} uniqueClassNames - The classes present.
     * @param {string[]} competencyLevels - The scale's bands, which the stack is built over.
     * @param {d3.Selection} g - The plot group, measured against for label space.
     * @returns {object} The x, y and Unterrichtsqualität scales, the stacked data, and the resolved render mode.
     */
    #createDetailScales(
        xDomain,
        renderMode,
        chartWidth,
        chartHeight,
        uniqueSubjects,
        uniqueClassNames,
        competencyLevels,
        g,
    ) {
        const isByClassesMode = !!this.className;
        const isSingleSubjectView = uniqueSubjects.length === 1;
        const groupByDomain = isByClassesMode
            ? uniqueClassNames.length <= 1
            : !isSingleSubjectView && uniqueClassNames.length <= 1;
        const groupBySubject = groupByDomain && uniqueSubjects.length > 1;

        const scalePadding = groupBySubject
            ? CHART_CONFIG.PADDING.SUBJECT_GROUPED_SCALE
            : CHART_CONFIG.PADDING.X_SCALE;
        const outerPadding = groupBySubject
            ? CHART_CONFIG.PADDING.OUTER_COMPACT
            : CHART_CONFIG.PADDING.OUTER_DEFAULT;

        const xScale = d3
            .scaleBand()
            .domain(xDomain)
            .range([0, chartWidth])
            .padding(scalePadding)
            .paddingOuter(outerPadding);

        g.datum({ xScaleBandwidth: xScale.bandwidth() });

        const yScale = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);

        const { SCALE_MIN, SCALE_MAX } = CHART_CONFIG.TEACHING_QUALITY;
        const yScaleQuality = d3
            .scaleLinear()
            .domain([SCALE_MIN, SCALE_MAX])
            .range([chartHeight, 0]);

        const stackedData = createStackedData(this.chartData, competencyLevels, 'distribution');

        return { xScale, yScale, yScaleQuality, stackedData, renderMode };
    }
}

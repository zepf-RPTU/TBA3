/**
 * CompetencyOverviewRenderer — Overview mode competency distribution chart.
 *
 * Shows multiple domains with grouped bars (Landesschnitt / Schulschnitt / classes),
 * an interactive legend with show/hide toggles, and animated bar redistribution.
 *
 * Used exclusively by competencyChartConfig.js (via ChartHostModule) on the
 * Welcome view (welcomeViewModule).
 *
 * Extends BarChartRenderer for stacked bar and tooltip support.
 */

import {
    BarChartRenderer,
    createChartStackedBar,
} from '../../../../../common/charts/renderers/barChartRenderer.js';
import { formatChartSubjectDomainLabel } from '../../../../../common/charts/domainLabelFormatter.js';
import {
    chartLayoutPreset,
    measurePercentAxisSpace,
} from '../../../../../common/charts/chartAxisUtils.js';
import { parseCompetenceLevels } from '../../../../../common/charts/competenceLevelAdapter.js';
import { buildCompetenceLevelIndex } from '../../../../slCompetenceLevelIndex.js';
import { createStackedData } from '../shared/competencyChartData.js';

import { ordinalShortLabel } from '../../../../../common/domain/comparisonGroupLabels.js';
import {
    CHART_CONFIG,
    STYLE_CONFIG,
    COMPETENCY_TOOLTIP_ID,
    BAR_HOVER_CONFIG,
} from '../shared/competencyChartConstants.js';
import {
    buildCompetencyTooltipRows,
    getUniqueValues,
    prepareCompetencyLevels,
} from '../shared/competencyChartData.js';
import {
    buildComparisonLegendItems,
    renderCompetencyLevelLegendSection,
} from '../shared/competencyLegendRender.js';
import { fitLabelLine, splitLabelLines } from '../../../../../common/charts/chartLabelFit.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import {
    addOverviewAxes,
    addOverviewLabelsAndTitle,
    computeRequiredOverviewChartWidth,
    measureOverviewBottomAxisSpace,
    measureOverviewTopAxisSpace,
    OVERVIEW_CLASS_LABEL_GAP,
    OVERVIEW_CLASS_LABEL_LINE_HEIGHT,
} from './competencyOverviewAxes.js';
import {
    getVisibleBarTypes,
    updateChartVisibility,
    updateKsSegmentVisibility,
} from './competencyOverviewVisibility.js';
import * as d3 from 'd3';
import { glossaryAnnotator } from '../../../../../common/glossary/glossaryAnnotator.js';

/**
 * Adds a label above a bar group.
 *
 * With a `fit` context the label is treated as a free-text class name: split
 * over up to two lines (stacked upwards, so the last line keeps the single-line
 * baseline) and each line middle-ellipsed to the sub-band step as a last
 * resort. Without one the label is a short fixed tag (`L1`, `S`) and is drawn
 * as-is.
 * @param {*} barGroup - The bar group selection to add label to
 * @param {number} bandwidth - Width of the bar for centering
 * @param {string|Function} labelText - Label text or function returning text
 * @param {{chart: object, slot: number, lineHeight: number}|null} [fit] - Wrap-and-fit context for free-text names.
 */
function addBarLabel(barGroup, bandwidth, labelText, fit = null) {
    const text = barGroup
        .append('text')
        .attr('class', 'bar-label')
        .attr('x', bandwidth / 2)
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .style('font-weight', 'bold')
        .style('fill', STYLE_CONFIG.COLORS.TEXT_SECONDARY);

    if (!fit) {
        text.text(labelText);
        return;
    }

    text.each((d, i, nodes) => {
        const node = d3.select(nodes[i]);
        const label = typeof labelText === 'function' ? labelText(d) : labelText;
        const lines = splitLabelLines(label);

        lines.forEach((line, lineIndex) => {
            node.append('tspan')
                .attr('x', bandwidth / 2)
                .attr('y', -5)
                .attr('dy', `${-(lines.length - 1 - lineIndex) * fit.lineHeight}px`)
                .text(fitLabelLine(fit.chart, line, fit.slot, { fontWeight: 'bold' }));
        });
    });
}

const reportedMissingOverviewLandesschnitt = new Set();

/**
 * Warn once per Fach/Domäne that no Landesschnitt distribution was delivered, so the
 * omitted comparison is visible without one warning per re-render.
 * @param {string|null} subject - The Fach with the gap.
 * @param {string|null} domain - The Domäne with the gap.
 */
function warnMissingOverviewLandesschnitt(subject, domain) {
    const key = `${subject ?? '(unknown subject)'}|${domain ?? '(no domain)'}`;
    if (reportedMissingOverviewLandesschnitt.has(key)) return;
    reportedMissingOverviewLandesschnitt.add(key);
    console.warn(
        `[CompetencyOverviewRenderer] Missing Landesschnitt distribution for ${key}; comparison omitted.`,
    );
}

/**
 * CompetencyOverviewRenderer — overview mode of the competency distribution chart.
 * Consumes competence-levels.json entries directly.
 */
export class CompetencyOverviewRenderer extends BarChartRenderer {
    /**
     * @param {string} containerId - Id of the element the chart draws into.
     * @param {Array} data - competence-levels.json entries (flat array, school + class rows)
     * @param {object} [options] - Renderer options, including an external legend container.
     */
    constructor(containerId, data, options = {}) {
        super(containerId, {
            defaultWidth: 900,
            defaultHeight: 500,
            ...options,
            layout: chartLayoutPreset('noLegend'),
        });

        this.setData(data);

        /** @type {Array} Prepared chart data (populated in validateData) */
        this.chartData = [];
    }

    /** @override */
    validateData() {
        const data = this.getData();
        if (!data?.length) return true;

        this.chartData = this.#prepareOverviewData();
        return true;
    }

    /**
     * Format tooltip content for overview competency chart segments.
     * @override
     */
    formatTooltipContent(segment, context = {}) {
        const { data, stackedData, level } = segment;
        const { type } = context;

        const title = data.name || data.domain;
        // The bar's own stacked row: a class or Landesschnitt bar sits in its Fach's
        // group, and `data` is that group — the school's figures, not the bar's.
        const result = buildCompetencyTooltipRows(stackedData, level);

        if (result.noData) {
            return this.buildTooltipHTML({
                title: data?.className || data?.name || 'Unbekannt',
                subtitle: type || '',
                rows: result.rows,
            });
        }

        return this.buildTooltipHTML({ title, subtitle: type, rows: result.rows });
    }

    /** @override */
    renderChart() {
        const containerElement = document.getElementById(this.containerId);
        if (!containerElement) return;

        // Drop the previous render's pills before anything can return early:
        // a no-data render draws no legend, and a stale panel would keep a live
        // click binding pointing at an SVG that no longer exists.
        this.htmlLegend.reset();
        containerElement.innerHTML = '';

        const data = this.getData();
        if (!data?.length || this.chartData.length === 0) {
            this.showNoDataMessage();
            return;
        }

        this.#renderOverviewMode();
    }

    // ========================================================================
    // DATA PREPARATION
    // ========================================================================

    /**
     * Prepares data for overview mode from competence-levels.json entries.
     * Groups by subject+domain, uses parseCompetenceLevels() for distributions.
     * @returns {Array<object>} One row per Fach/Domäne and bar type, in draw order.
     */
    #prepareOverviewData() {
        const chartData = [];
        const index = buildCompetenceLevelIndex(this.getData());
        const {
            schoolRows: schoolEntries,
            subjectDomains: subjectDomainMap,
            classGroups: domainGroups,
        } = index;

        for (const group of domainGroups) {
            const first = group[0];
            const subjectName = first.subject?.name;
            if (!subjectName) continue;

            // Parse class-level distributions
            const parsed = parseCompetenceLevels(group);
            if (!parsed.levels.length) continue;

            const { levels, scaleId } = parsed;

            // Find the matching subject entry in the map to check domain count
            const subjectInfo = subjectDomainMap.find((s) => s.subjectName === subjectName);
            const hasSingleDomain = subjectInfo?.domains.length === 1;
            const domainName = first.domain?.name;
            const domainLabel =
                hasSingleDomain || !domainName ? subjectName : `${subjectName}: ${domainName}`;
            const displayDomainLabel =
                hasSingleDomain || !domainName
                    ? subjectName
                    : formatChartSubjectDomainLabel(subjectName, domainName);

            // School aggregate for this subject+domain
            const schoolEntry = schoolEntries.find(
                (e) =>
                    e.subject?.name === subjectName &&
                    (e.domain?.id ?? null) === (first.domain?.id ?? null),
            );

            let averageDistribution;
            let averageCounts;
            let totalStudents;
            if (schoolEntry) {
                const schoolGroup = parseCompetenceLevels([schoolEntry]).groups[0];
                averageDistribution = schoolGroup?.percentages || {};
                averageCounts = schoolGroup?.counts || {};
                totalStudents = schoolGroup?.total || 0;
            } else {
                // Fallback: compute average from class data
                totalStudents = parsed.groups.reduce((s, g) => s + g.total, 0);
                averageDistribution = {};
                averageCounts = {};
                for (const level of levels) {
                    const totalCount = parsed.groups.reduce(
                        (s, g) => s + (g.counts[level] || 0),
                        0,
                    );
                    averageCounts[level] = totalCount;
                    averageDistribution[level] =
                        totalStudents > 0 ? (totalCount / totalStudents) * 100 : 0;
                }
            }

            // Class distributions. Each row names its ladder: these rows are what the
            // stacks are built from, and a level name can belong to two ladders on this page.
            // Each also carries its own counts and total, which its tooltip reads.
            const classDistributions = parsed.groups
                .filter((g) => g.total > 0)
                .map((g) => ({
                    className: g.name,
                    distribution: g.percentages,
                    counts: g.counts,
                    totalStudents: g.total,
                    scaleId,
                }));

            const stateDistributions = index.stateRows
                .filter(
                    (entry) =>
                        entry.subject?.name === subjectName &&
                        (entry.domain?.id ?? null) === (first.domain?.id ?? null),
                )
                .flatMap((entry) => {
                    const parsedState = parseCompetenceLevels([entry]);
                    const stateGroup = parsedState.groups[0];
                    const distribution = stateGroup?.percentages;
                    if (!distribution || Object.keys(distribution).length === 0) return [];
                    const sourceId = entry.id;
                    return [
                        {
                            key: `state:${sourceId}`,
                            sourceId,
                            name: entry.name,
                            distribution,
                            counts: stateGroup.counts,
                            totalStudents: stateGroup.total,
                            scaleId: parsedState.scaleId ?? scaleId,
                        },
                    ];
                });
            if (stateDistributions.length === 0) {
                warnMissingOverviewLandesschnitt(subjectName, first.domain?.id ?? null);
            }

            chartData.push({
                domain: domainLabel,
                displayDomain: displayDomainLabel,
                subject: subjectName,
                competencyLevels: levels,
                scaleId,
                distribution: averageDistribution,
                counts: averageCounts,
                stateDistributions,
                classDistributions,
                totalStudents,
            });
        }

        return chartData;
    }

    // ========================================================================
    // RENDERING
    // ========================================================================

    /** Main overview rendering pipeline — chart base, grouped bars, axes, HTML legend. */
    #renderOverviewMode() {
        const preCalcDims = this.calculateDimensions();

        // Measure axes
        const leftAxis = measurePercentAxisSpace(this, 'left', {
            step: 10,
            axisTitleText: `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`,
        });

        const { competencyLevels, getColorForLevel, scaleIdForLevel } = prepareCompetencyLevels(
            this.chartData,
        );

        const uniqueClassNames = getUniqueValues(
            this.chartData.flatMap((domainData) =>
                domainData.classDistributions.map((classData) => classData.className),
            ),
            (name) => name,
        ).sort();

        const stateTracks = this.#getStateTracks(this.chartData);

        // Content-driven width: the chart's natural width is subjects × (states +
        // school + classes) sub-bands, each wide enough for its class label's
        // longest line. When that exceeds the container the SVG is created wider
        // and the svg area scrolls horizontally (sl-competency-overview-svg) —
        // full names, never abbreviated columns. The resize observer watches the
        // container, whose width the overflow does not change, so no re-render loop.
        const requiredWidth =
            leftAxis +
            computeRequiredOverviewChartWidth(
                this,
                this.chartData.length,
                stateTracks.length + 1 + uniqueClassNames.length,
                uniqueClassNames,
            );
        if (requiredWidth > preCalcDims.containerWidth) {
            preCalcDims.containerWidth = requiredWidth;
            // Margins are zeroed until initializeSVG patches them from the layout.
            preCalcDims.chartWidth = requiredWidth;
            this.dimensions = preCalcDims;
        }

        const bottomAxis = measureOverviewBottomAxisSpace(
            this,
            this.chartData.map((d) => d.displayDomain || d.domain),
            preCalcDims.containerWidth,
            leftAxis,
        );
        const topAxis = measureOverviewTopAxisSpace(this, uniqueClassNames);

        const { svg, g, dimensions, layout } = this.initializeSVG({
            axisOverrides: { left: leftAxis, bottom: bottomAxis, top: topAxis },
        });

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;
        const margin = dimensions.margins;

        const domainList = this.chartData.map((d) => d.domain);

        const xScale = d3
            .scaleBand()
            .domain(domainList)
            .range([0, chartWidth])
            .padding(CHART_CONFIG.PADDING.X_SCALE);

        // Build unique subjects list for legend
        const uniqueSubjects = getUniqueValues(
            this.chartData.map((d) => d.subject),
            (name) => name,
        );

        // The legend renders before the bars: its state survives re-renders, so
        // the first paint already honours the viewer's toggles. The KS level→group
        // map is per render and travels to the change handler by closure.
        const ksLegend = { ksLevelToGroup: /** @type {Map<string,string>|null} */ (null) };
        const visibilityState = this.htmlLegend.render(
            this.#legendSections(
                uniqueClassNames,
                uniqueSubjects,
                competencyLevels,
                getColorForLevel,
                stateTracks,
                ksLegend,
                scaleIdForLevel,
            ),
            (change) => this.#onLegendChange(change, ksLegend),
        );

        svg.datum({
            width: chartWidth,
            height: chartHeight,
            xScale: xScale,
            margin: margin,
            uniqueClassNames: uniqueClassNames,
            stateTracks,
            chartData: this.chartData,
        });

        const initiallyVisibleTypes = getVisibleBarTypes(
            visibilityState,
            uniqueClassNames,
            stateTracks.map((track) => track.key),
        );
        const xSubScale = d3
            .scaleBand()
            .domain(initiallyVisibleTypes)
            .range([0, xScale.bandwidth()])
            .padding(CHART_CONFIG.PADDING.X_SUB_SCALE);

        const yScale = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);

        const stackedData = createStackedData(this.chartData, competencyLevels, 'distribution');
        const stateStackedData = this.chartData.map((domainData) =>
            createStackedData(
                domainData.stateDistributions ?? [],
                competencyLevels,
                'distribution',
            ),
        );

        const classStackedData = this.chartData.map((domainData) =>
            createStackedData(domainData.classDistributions, competencyLevels, 'distribution'),
        );

        this.#createOverviewBars(
            g,
            this.chartData,
            competencyLevels,
            getColorForLevel,
            xScale,
            xSubScale,
            yScale,
            stackedData,
            stateStackedData,
            classStackedData,
            visibilityState,
            uniqueClassNames,
            stateTracks,
        );

        addOverviewAxes(this, g, xScale, yScale, chartHeight);

        addOverviewLabelsAndTitle(this, g);

        // A re-render draws every Fach; toggles the viewer already made are
        // re-applied without animation so the chart opens where they left it.
        if (this.htmlLegend.anyHidden()) {
            updateChartVisibility(this, this.containerId, visibilityState, 0);
            const svg = d3.select(`#${this.containerId} svg`);
            if (ksLegend.ksLevelToGroup) {
                updateKsSegmentVisibility(
                    this,
                    svg,
                    visibilityState,
                    svg.datum(),
                    ksLegend.ksLevelToGroup,
                    0,
                );
            }
        }
    }

    // ========================================================================
    // BARS
    // ========================================================================

    /**
     * Create grouped stacked bars for all bar types (Landesschnitt, Schulschnitt, classes) per domain.
     * @param {d3.Selection} g - The plot group the bars are drawn into.
     * @param {Array<object>} chartData - The prepared rows.
     * @param {string[]} competencyLevels - The scale's bands, in stack order.
     * @param {(level: string) => string} getColorForLevel - Maps a band to its colour.
     * @param {any} xScale - Outer band scale, one slot per Fach/Domäne.
     * @param {any} xSubScale - Inner band scale, one slot per bar within a group.
     * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale.
     * @param {Array} stackedData - Stack series for the school bars.
     * @param {Array} stateStackedData - Stack series for the Landesschnitt bars.
     * @param {Array} classStackedData - Stack series for the class bars.
     * @param {object} visibilityState - The live legend toggle state.
     * @param {string[]} uniqueClassNames - The classes present.
     * @param {Array<object>} stateTracks - The Landesschnitt tracks the payload delivered, one bar each.
     */
    #createOverviewBars(
        g,
        chartData,
        competencyLevels,
        getColorForLevel,
        xScale,
        xSubScale,
        yScale,
        stackedData,
        stateStackedData,
        classStackedData,
        visibilityState,
        uniqueClassNames,
        stateTracks,
    ) {
        const chartInstance = this;

        const domainGroups = g
            .selectAll('.domain-group')
            .data(chartData)
            .enter()
            .append('g')
            .attr('class', 'domain-group')
            .attr('transform', (d) => `translate(${xScale(d.domain)}, 0)`)
            .attr('data-bandwidth', xScale.bandwidth())
            .style('cursor', 'default');

        const stateBarGroups = domainGroups
            .selectAll('.state-average-bar-group')
            .data((d, i) =>
                stateTracks.map((track, stateIndex) => {
                    const stateData = stateStackedData[i].find((entry) => entry.key === track.key);
                    return stateData
                        ? { ...stateData, domainData: d, stateIndex, hasData: true }
                        : { ...track, domainData: d, stateIndex, hasData: false };
                }),
            )
            .enter()
            .append('g')
            .attr(
                'class',
                (d) =>
                    `landesschnitt-bar-group state-average-bar-group state-average-${d.stateIndex}`,
            )
            .attr('data-state-key', (d) => d.key)
            .attr('transform', (d) => `translate(${xSubScale(d.key)}, 0)`)
            .style('display', (d) =>
                d.hasData && visibilityState.comparison[d.key] !== false ? 'block' : 'none',
            );

        const schoolBarGroups = domainGroups
            .append('g')
            .attr('class', 'school-bar-group')
            .attr('transform', `translate(${xSubScale('school')}, 0)`)
            .style('display', visibilityState.comparison.school !== false ? 'block' : 'none');

        const classBarGroups = domainGroups
            .selectAll('.class-bar-group')
            .data((d, i) => {
                const domainClassData = classStackedData[i];

                const result = uniqueClassNames.map((className, globalIndex) => {
                    const existingData = domainClassData.find((c) => c.className === className);

                    if (existingData) {
                        return {
                            ...existingData,
                            domainData: d,
                            classIndex: globalIndex,
                            hasData: true,
                        };
                    } else {
                        return {
                            className: className,
                            domainData: d,
                            classIndex: globalIndex,
                            hasData: false,
                        };
                    }
                });
                return result;
            })
            .enter()
            .append('g')
            // The class's identity lives in `data-class-name`, not in a class token:
            // live names (`8.2`, `8 a Mathe`) are not valid CSS identifiers, so a
            // name-derived class silently breaks every selector built from it.
            .attr('class', 'class-bar-group')
            .attr('data-class-name', (d) => d.className)
            .attr('transform', (d) => {
                const classPosition = xSubScale(`class-${d.classIndex}`);
                return classPosition !== undefined
                    ? `translate(${classPosition}, 0)`
                    : `translate(0, 0)`;
            })
            .style('display', (d) =>
                visibilityState['individual-class'][d.className] !== false ? 'block' : 'none',
            );

        addBarLabel(
            stateBarGroups.filter((d) => d.hasData),
            xSubScale.bandwidth(),
            (d) => ordinalShortLabel('L', d.stateIndex, stateTracks.length),
        );
        addBarLabel(schoolBarGroups, xSubScale.bandwidth(), 'S');
        // The fit keeps only half the gap: the width computation reserved
        // `widest + GAP` per slot, so testing against `step - GAP` would sit on
        // an exact boundary where sub-pixel measurement noise ellipsizes a label
        // the reserve made room for.
        addBarLabel(classBarGroups, xSubScale.bandwidth(), (d) => d.className, {
            chart: this,
            slot: Math.max(0, xSubScale.step() - OVERVIEW_CLASS_LABEL_GAP / 2),
            lineHeight: this.resolveChartTextSize('base') * OVERVIEW_CLASS_LABEL_LINE_HEIGHT,
        });

        const chartHeight = yScale.range()[0];
        classBarGroups
            .filter((d) => !d.hasData)
            .append('text')
            .attr('class', 'no-participation-label')
            .attr('x', xSubScale.bandwidth() / 2)
            .attr('y', chartHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('transform', `rotate(-90, ${xSubScale.bandwidth() / 2}, ${chartHeight / 2})`)
            .style('fill', STYLE_CONFIG.COLORS.TEXT_SECONDARY)
            .text(glossaryAnnotator.getRequiredEntryText('general.messages.no-participation'));

        // Shared options for all overview stacked bars
        const barOpts = (typeLabel) => ({
            barWidth: xSubScale.bandwidth(),
            fillOpacity: 1,
            getTooltipContent: (data, stackedEntry, level) =>
                chartInstance.formatTooltipContent(
                    { data, stackedData: stackedEntry, level },
                    { type: typeLabel, showDomain: false },
                ),
            tooltipId: COMPETENCY_TOOLTIP_ID,
            hoverEffect: BAR_HOVER_CONFIG,
        });

        // Landesschnitt bars
        stateBarGroups
            .filter((d) => d.hasData)
            .each(function (stateData) {
                createChartStackedBar(
                    d3.select(this),
                    stateData.domainData,
                    stateData,
                    competencyLevels,
                    getColorForLevel,
                    { yScale },
                    barOpts(stateData.name),
                    chartInstance,
                );
            });

        // Schulschnitt bars
        schoolBarGroups.each(function (d, i) {
            createChartStackedBar(
                d3.select(this),
                d,
                stackedData[i],
                competencyLevels,
                getColorForLevel,
                { yScale },
                barOpts('Schulschnitt'),
                chartInstance,
            );
        });

        // Class bars
        classBarGroups
            .filter((d) => d.hasData)
            .each(function (classData) {
                createChartStackedBar(
                    d3.select(this),
                    classData.domainData,
                    classData,
                    competencyLevels,
                    getColorForLevel,
                    { yScale },
                    barOpts(`Klasse ${classData.className}`),
                    chartInstance,
                );
            });
    }

    // ========================================================================
    // AXES & LABELS
    // ========================================================================

    // ========================================================================
    // HTML LEGEND
    // ========================================================================

    /**
     * Legend sections: Fächer (one always stays on), Vergleich (one pill per
     * delivered Landesschnitt plus the Schulschnitt), Klassen behind a derived
     * master pill, and the shared Kompetenzstufen section.
     * @param {string[]} uniqueClassNames - The classes present.
     * @param {string[]} uniqueSubjects - The Fächer present.
     * @param {string[]} competencyLevels - The scale's bands, in scale order.
     * @param {(level: string) => string} getColorForLevel - Maps a band to its swatch colour.
     * @param {Array<object>} stateTracks - The Landesschnitt tracks, which each get their own pill.
     * @param {{ksLevelToGroup: Map<string,string>|null}} ksLegend - Receives the level → group map the KS section builds.
     * @param {(level: string) => string|undefined} scaleIdForLevel - The ladder a bare level name resolves on.
     * @returns {Array<import('../../../../../common/charts/legend/htmlLegendController.js').HtmlLegendSection>} What the panel shows.
     */
    #legendSections(
        uniqueClassNames,
        uniqueSubjects,
        competencyLevels,
        getColorForLevel,
        stateTracks,
        ksLegend,
        scaleIdForLevel,
    ) {
        return [
            {
                title: 'Fächer',
                group: 'subject',
                minVisible: 1,
                items: uniqueSubjects.map((subject) => ({ key: subject, label: subject })),
            },
            {
                title: 'Vergleich',
                group: 'comparison',
                items: buildComparisonLegendItems(stateTracks),
            },
            {
                title: 'Klassen',
                group: 'individual-class',
                masterLabel: 'Klassen',
                pillGroupClass: 'class-legend-pills',
                items: uniqueClassNames.map((className) => ({
                    key: className,
                    label: className,
                    isChild: true,
                })),
            },
            {
                group: 'competency-level',
                render: (panel) => {
                    const { ksGroupOrder, ksLevelToGroup } = renderCompetencyLevelLegendSection(
                        panel,
                        competencyLevels,
                        getColorForLevel,
                        { scaleIdForLevel },
                    );
                    ksLegend.ksLevelToGroup = ksLevelToGroup;
                    return ksGroupOrder;
                },
            },
        ];
    }

    // ========================================================================
    // TOGGLE HANDLERS & VISIBILITY
    // ========================================================================

    /**
     * Apply a legend change to the SVG: a Kompetenzstufen toggle re-stacks the
     * segments inside every bar, anything else re-solves the bar layout.
     * @param {import('../../../../../common/charts/legend/htmlLegendController.js').HtmlLegendChange} change - What the pills changed.
     * @param {{ksLevelToGroup: Map<string,string>|null}} ksLegend - The level → group map of this render.
     */
    #onLegendChange(change, ksLegend) {
        if (change.group === 'competency-level') {
            const ksSvg = d3.select(`#${this.containerId} svg`);
            const ksData = ksSvg.datum();
            if (ksData && ksLegend.ksLevelToGroup) {
                updateKsSegmentVisibility(
                    this,
                    ksSvg,
                    change.state,
                    ksData,
                    ksLegend.ksLevelToGroup,
                );
            }
            return;
        }
        updateChartVisibility(this, this.containerId, change.state);
    }

    #getStateTracks(chartData) {
        const byKey = new Map();
        for (const domainData of chartData ?? []) {
            for (const state of domainData.stateDistributions ?? []) {
                if (!byKey.has(state.key))
                    byKey.set(state.key, { key: state.key, name: state.name });
            }
        }
        return [...byKey.values()];
    }
}

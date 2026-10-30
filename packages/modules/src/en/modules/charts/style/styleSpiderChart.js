/**
 * A radar of one student's style-category results across both domains, against the
 * group and the comparison groups. The polar math (angles, radius, label reach,
 * fit loop) lives in styleSpiderGeometry.js.
 */

import {
    ChartRenderer,
    setRestingSize,
} from '../../../../common/charts/renderers/chartRenderer.js';
import { joinComparisonMarkers } from '../../../../common/charts/averageMarkers.js';
import { MARK_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import { GLOSSARY_KEYS } from '../../../../common/glossary/glossaryKeys.js';
import { formatStudentName } from '../../../../common/domain/index.js';
import { buildDomainStyles } from './styleDomainStyles.js';
import {
    comparisonMarkerLegendItem,
    comparisonSeriesClass,
    comparisonSeriesColor,
    comparisonTooltipKey,
    comparisonSeriesLabel,
    visibleComparisonGroups,
} from '../../../../common/charts/comparisonSeries.js';
import { figureCell, percentColumn } from '../../../../common/charts/dataTableCells.js';
import { EN_TERMS } from '../../../enTerms.js';
import { buildStyleCategoryPerformance } from '../../../utils/enStyleAggregation.js';
import { styleCategoryKey } from '../../../utils/enStyleOrder.js';
import { createState } from '@tba3/module-base';
import * as d3 from 'd3';
import { formatPercent, isFiniteNumber } from '../../../../common/utils/numberFormat.js';
import {
    angleToCoordinate,
    calculateCategoryAngle,
    fitChartSizeForLabelOverflow,
    getLabelAnchor,
    labelCoordinate,
    radiusFor,
} from './styleSpiderGeometry.js';
import { applyChartTextSize } from '../../../../common/charts/chartTypography.js';
import { fontWeightToken } from '../../../../common/utils/fontTokens.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { animate, fadeOutAndRemove, takeBack } from '../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { asDataMark } from '../../../../common/services/dataMark.js';

const CHART_CONFIG = {
    LEVELS: 4,
    CIRCLE_STROKE_WIDTH_PX: 1,
    CIRCLE_STROKE_OPACITY: 0.5,
    POINT_RADIUS_RATIO: 0.015,
    MIN_POINT_RADIUS_PX: 3,
    /** A ring's percent label sits this far right of the vertical axis and above its ring. */
    RING_LABEL_OFFSET_PX: 3,
    /** How far a spoke's hit wedge reaches past the outer ring: a vertex at 100 % sits on it. */
    WEDGE_REACH_PX: 12,
    COLORS: {
        GROUP: 'var(--group-average-color)',
        STUDENT: 'var(--student-performance-color)',
        FILL_OPACITY: {
            COMPARISON: 0.1,
            GROUP: 0.1,
            STUDENT: 0.2,
        },
    },
};

/** The transition a redraw moves, brings back and retires the web's marks in. */
const SPIDER_TRANSITION = 'spider';

/**
 * One vertex of the group's or the student's own ring, with its series.
 * @typedef {{point: SpiderPoint, series: SpiderSeries}} OwnVertex
 */

/**
 * The paint of the group's and the student's circle vertices.
 * @param {string} color
 * @returns {import('../../../../common/charts/averageMarkers.js').AverageMarkerPaint}
 */
const ownVertexPaint = (color) => ({
    fill: color,
    stroke: 'var(--color-card-background)',
    strokeWidth: MARK_DEFAULTS.outlineWidthPx,
    dotFill: null,
});

/**
 * @typedef {object} StyleSpiderChartOptions
 * @property {StudentRecord|null|import('@preact/signals-core').ReadonlySignal<StudentRecord|null>} [student] - The selected student's record, or the host's signal of it; `null` draws the group alone.
 * @property {import('./styleDomainStyles.js').StyleChartEnConfig} enConfig - Exactly two domains.
 * @property {import('../../../utils/enStyleAggregationAdapter.js').ParsedStyleAggregation} groupStyleAverages - The group-level parse.
 * @property {import('../../../../common/charts/comparisonState.js').ComparisonStateReader|null} [comparisonState]
 */

/** @typedef {import('../../../utils/enStudentDataAdapter.js').EnStudentRecord} StudentRecord */

/**
 * One drawn series: its ring and its paint.
 * @typedef {object} SpiderSeries
 * @property {string} key - Series key: a comparison group's id, `group` or `student`; the join key of its area and vertices.
 * @property {string} className - Class its area and vertices share; a comparison group's is its index class, which its visibility toggles.
 * @property {import('../../../../common/charts/comparisonSeries.js').ComparisonSeriesGroup|null} group - The comparison group, whose role shape the vertices take; `null` for the group and the student, whose vertices are circles.
 * @property {SpiderPoint[]} data - The ring's vertices, in angle order; the path closes itself.
 * @property {string} color - Polygon outline and fill, and the circle vertices' fill.
 * @property {number} fillOpacity - Of the polygon.
 * @property {boolean} visibility
 */

/** @augments ChartRenderer */
export class StyleSpiderChart extends ChartRenderer {
    /** @type {{[domainId: string]: import('./styleDomainStyles.js').DomainStyle}} Each spoke prefix's colour and glossary key. */
    domainStyles;
    /** @type {SpiderCategory[]} The spokes; they follow the immutable EN config alone. */
    categories;
    /** @type {Map<string, number>} Each drawn area's vertex count, by series key: a ring that keeps it morphs, one that gains or loses a vertex is redrawn at once. */
    #drawnVertexCounts = new Map();

    /**
     * One radar vertex; `key` is its spoke's, the marker join key.
     * @typedef {{key: string, x: number, y: number, value: number, seriesLabel: string}} SpiderPoint
     */

    /**
     * One spoke: a domain × style pair, with the angle it sits at.
     * @typedef {{key: string, domainId: string, domainLabel: string, displayDomainLabel: string, styleLabel: string, angle: number}} SpiderCategory
     */

    /**
     * @param {HTMLElement} container
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & StyleSpiderChartOptions} options
     */
    constructor(container, options) {
        super(container, { legend: 'auto', ...options });

        /** @type {import('@tba3/module-base').State<{student: StudentRecord|null}>} Reactive: a new student redraws. */
        this.state = createState({ student: options.student ?? null });
        this.enConfig = options.enConfig;
        this.domainStyles = buildDomainStyles(this.enConfig, this.context.glossary);
        this.groupStyleAverages = options.groupStyleAverages;
        // One series per delivered group, in payload order; an unrecognised type draws
        // as the catch-all series.
        this.comparisonGroups = this.groupStyleAverages.comparisonGroups;
        this.setComparisonModes(this.comparisonGroups);
        this.categories = this.#createCategoryDefinitions();
    }

    /** @returns {StudentRecord|null} A tracked read of the host's signal. */
    get student() {
        return this.state.student.value;
    }

    /**
     * The category label widths, measured in one batch; the base caches each box by
     * font and text, so a resize or a student switch costs no layout.
     * @returns {number[]} One width per category, in px.
     */
    #measureCategoryLabels() {
        const labels = this.categories.map(
            (category) => `${category.displayDomainLabel} ${category.styleLabel}`,
        );
        return this.measureTexts(labels, { fontWeight: fontWeightToken('semibold') }).sizes.map(
            (size) => size.width,
        );
    }

    /**
     * The spokes: one per domain × style.
     * @returns {SpiderCategory[]} Sorted by angle, so the polygon traces clockwise.
     */
    #createCategoryDefinitions() {
        const defs = this.enConfig.domainIds.flatMap((domainId, domainIndex) => {
            const { label, abbreviation } = this.domainStyles[domainId];
            return this.enConfig.styleCategories.map((cat, styleIndex) => ({
                key: styleCategoryKey(domainId, cat.value),
                domainId,
                domainLabel: label,
                displayDomainLabel: abbreviation,
                styleLabel: cat.label,
                angle: calculateCategoryAngle(
                    domainIndex,
                    styleIndex,
                    this.enConfig.styleCategories.length,
                ),
            }));
        });

        return defs.sort((a, b) => a.angle - b.angle);
    }

    /**
     * The student first when one is selected, then the group, then the comparison
     * groups in payload order, as the web draws them.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey}
     */
    chartKey() {
        // Legend keys are the series keys: a comparison group's id, which the
        // visibility state tracks, or 'group'/'student', which are always shown.
        /**
         * @param {string} series
         * @param {{label?: string, labelSegments?: Array<{text: string, glossaryKey: string|null}>|null, glossaryKey?: string|null, color: string}} entry
         * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyItem}
         */
        const item = (series, { label, labelSegments = null, glossaryKey, color }) => ({
            label,
            labelSegments,
            glossaryKey,
            color,
            symbol: 'line',
            key: series,
        });

        // A comparison group's entry shows its vertex marker, the role shape every other
        // chart draws it with; the group and the student are the web's own lines.
        const items = [
            item('group', {
                label: this.groupStyleAverages.groupName ?? undefined,
                glossaryKey: GLOSSARY_KEYS.LERNGRUPPENSCHNITT,
                color: CHART_CONFIG.COLORS.GROUP,
            }),
            ...this.comparisonGroups.map((group) => comparisonMarkerLegendItem(group)),
        ];
        const student = this.student;
        if (student) {
            items.unshift(
                item('student', {
                    label: formatStudentName(student),
                    color: CHART_CONFIG.COLORS.STUDENT,
                }),
            );
        }
        return [{ items }];
    }

    /** @override */
    renderChart() {
        const { containerWidth, containerHeight } = this.measuredDimensions();

        const labelWidths = this.#measureCategoryLabels();
        const { chartSize, labelOverflow } = fitChartSizeForLabelOverflow(
            containerHeight,
            containerWidth,
            this.categories.map((category) => category.angle),
            labelWidths,
        );
        const radius = radiusFor(chartSize);
        const totalWidth = labelOverflow.left + chartSize + labelOverflow.right;
        const chartCenterX = labelOverflow.left + chartSize / 2;

        // A first draw moves nothing.
        const durationMs = this.drawDurationMs;
        // Scaled into its box through the viewBox, not drawn at a pixel size.
        const svg = this.createSVGElement(totalWidth, chartSize)
            .attr('width', null)
            .attr('height', null)
            .attr('viewBox', `0 0 ${totalWidth} ${chartSize}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('width', '100%')
            .style('height', '100%');

        // The web's layers, made in paint order on the first draw and found again after.
        const g = selectOrAppend(svg, 'g', 'spider-plot').attr(
            'transform',
            `translate(${chartCenterX}, ${chartSize / 2})`,
        );
        const rScale = d3.scaleLinear().domain([0, 100]).range([0, radius]);

        this.#drawBackgroundCircles(selectOrAppend(g, 'g', 'spider-rings'), radius, durationMs);
        this.#drawAxesAndLabels(selectOrAppend(g, 'g', 'spider-spokes'), radius, durationMs);

        const series = this.#buildSeries(rScale);
        this.#drawAreas(selectOrAppend(g, 'g', 'spider-areas', asDataMark), series, durationMs);
        const vertices = this.#drawDataPoints(
            selectOrAppend(g, 'g', 'spider-points', asDataMark),
            series,
            radius,
            durationMs,
        );
        this.#drawWedges(selectOrAppend(g, 'g', 'spider-wedges'), series, vertices, radius);
    }

    /**
     * The spokes as a table, in angle order: per style and domain the student's value
     * when one is selected, the group's, then each shown comparison group's, as the
     * spoke's tooltip lists them. A spoke a series has no value on is an empty cell.
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable}
     */
    dataTable() {
        const { student } = this;
        const performance = student ? buildStyleCategoryPerformance(student, this.enConfig) : null;
        const { groupAverages, groupName } = this.groupStyleAverages;
        const comparisons = visibleComparisonGroups(this.comparisonGroups, this.visibilityState);
        return {
            columns: [
                { label: EN_TERMS.STYLE },
                { label: TERM_CONSTANTS.DOMAIN },
                ...(student ? [percentColumn(formatStudentName(student))] : []),
                percentColumn(groupName ?? TERM_CONSTANTS.GROUP),
                ...comparisons.map((group) => percentColumn(comparisonSeriesLabel(group))),
            ],
            rows: this.categories.map((category) => [
                { text: category.styleLabel },
                { text: category.domainLabel },
                ...(performance ? [figureCell(performance[category.key])] : []),
                figureCell(groupAverages[category.key]),
                ...comparisons.map((group) => figureCell(group.averages[category.key])),
            ]),
        };
    }

    /**
     * One spoke: every shown series' value on it, each keyed by its vertex mark, in draw
     * order reversed so the student and the group lead.
     * @override
     * @param {{category: SpiderCategory, series: SpiderSeries[]}} spoke
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     */
    formatTooltipContent({ category, series }) {
        return {
            title: category.styleLabel,
            subtitle: category.domainLabel,
            rows: [...series].reverse().flatMap((config) => {
                const point = config.data.find((d) => d.key === category.key);
                if (!point || !config.visibility) return [];
                return [
                    {
                        label: point.seriesLabel,
                        value: formatPercent(point.value),
                        key: config.group
                            ? comparisonTooltipKey(config.group)
                            : { symbol: 'circle', paint: ownVertexPaint(config.color) },
                    },
                ];
            }),
        };
    }

    /**
     * The background rings, one group per level keyed by level, every second with its
     * percent label: drawn on the first pass, resized on the next.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} layer
     * @param {number} radius - The outermost ring's, the 100 % level.
     * @param {number} durationMs - `0` resizes at once.
     */
    #drawBackgroundCircles(layer, radius, durationMs) {
        const levels = d3.range(1, CHART_CONFIG.LEVELS + 1);
        const levelRadius = (/** @type {number} */ level) => (radius * level) / CHART_CONFIG.LEVELS;
        const labelY = (/** @type {number} */ level) =>
            -levelRadius(level) - CHART_CONFIG.RING_LABEL_OFFSET_PX;

        /** @type {d3.Selection<SVGGElement, number, SVGGElement, unknown>} */
        const existing = layer.selectChildren('g.spider-ring');
        const rings = existing
            .data(levels, (level) => level)
            .join((enter) => {
                const ring = enter.append('g').attr('class', 'spider-ring');
                ring.append('circle')
                    .attr('cx', 0)
                    .attr('cy', 0)
                    .attr('r', levelRadius)
                    .attr('fill', 'none')
                    .style('stroke', 'var(--color-border)')
                    .attr('stroke-width', CHART_CONFIG.CIRCLE_STROKE_WIDTH_PX)
                    .attr('stroke-opacity', CHART_CONFIG.CIRCLE_STROKE_OPACITY);

                // The web's scale, read once: every other ring names its percent on the
                // vertical axis, which runs between two spokes and so stays clear of them.
                const ringLabel = ring
                    .filter((level) => level % 2 === 0)
                    .append('text')
                    .attr('class', 'ring-label')
                    .attr('x', CHART_CONFIG.RING_LABEL_OFFSET_PX)
                    .attr('y', labelY)
                    .attr('text-anchor', 'start')
                    .style('fill', 'var(--text-secondary)')
                    .text((level) => formatPercent((100 * level) / CHART_CONFIG.LEVELS, 0));
                applyChartTextSize(ringLabel, 'sm');
                return ring;
            });

        animate(rings.select('circle'), { durationMs, name: SPIDER_TRANSITION }).attr(
            'r',
            levelRadius,
        );
        animate(rings.select('.ring-label'), { durationMs, name: SPIDER_TRANSITION }).attr(
            'y',
            labelY,
        );
    }

    /**
     * The spokes and their labels, one group per category keyed by its key: drawn on the
     * first pass, moved to the new radius on the next. A label's text is the category's
     * alone, so it is written once.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} layer
     * @param {number} radius - The outer ring's, where the spokes end.
     * @param {number} durationMs - `0` moves them at once.
     */
    #drawAxesAndLabels(layer, radius, durationMs) {
        const { glossary } = this.context;
        const end = (/** @type {SpiderCategory} */ category) =>
            angleToCoordinate(category.angle, radius);
        const labelAt = (/** @type {SpiderCategory} */ category) =>
            labelCoordinate(category.angle, radius);

        /** @type {d3.Selection<SVGGElement, SpiderCategory, SVGGElement, unknown>} */
        const existing = layer.selectChildren('g.spider-spoke');
        const spokes = existing
            .data(this.categories, (category) => category.key)
            .join((enter) => {
                const spoke = enter.append('g').attr('class', 'spider-spoke');
                spoke
                    .append('line')
                    .attr('x1', 0)
                    .attr('y1', 0)
                    .attr('x2', (category) => end(category).x)
                    .attr('y2', (category) => end(category).y)
                    .style('stroke', 'var(--color-border)')
                    .attr('stroke-width', 1);

                // Centred with `dy`, not `dominant-baseline`: Firefox drops the glossary
                // underline on text that sets a dominant baseline.
                spoke
                    .append('text')
                    .attr('x', (category) => labelAt(category).x)
                    .attr('y', (category) => labelAt(category).y)
                    .attr('dy', '0.35em')
                    .style('font-weight', fontWeightToken('semibold'))
                    .attr('text-anchor', (category) => getLabelAnchor(labelAt(category).x))
                    .each((category, i, nodes) => {
                        // One line: the domain prefix in text ink, the style name in
                        // secondary ink. Text never wears a data colour: the domain
                        // orange is 2.5:1 on white.
                        const text = d3.select(nodes[i]);
                        const prefix = category.displayDomainLabel;
                        const { glossaryKey } = this.domainStyles[category.domainId];
                        glossary.renderTextSegments(text.append('tspan'), prefix, {
                            segments: [{ text: prefix, glossaryKey }],
                            force: true,
                        });
                        const styleName = category.styleLabel;
                        if (styleName) {
                            const styleRoot = text
                                .append('tspan')
                                // Two terms side by side: far enough apart to be
                                // targets of their own (WCAG 2.5.8 spacing).
                                .attr('dx', '0.6em')
                                .style('fill', 'var(--text-secondary)');
                            glossary.renderTextSegments(styleRoot, styleName, {
                                segments: glossary.getTextSegments(styleName),
                                force: true,
                            });
                        }
                    });
                return spoke;
            });

        animate(spokes.select('line'), { durationMs, name: SPIDER_TRANSITION })
            .attr('x2', (category) => end(category).x)
            .attr('y2', (category) => end(category).y);
        const labels = spokes
            .select('text')
            .attr('text-anchor', (category) => getLabelAnchor(labelAt(category).x));
        animate(labels, { durationMs, name: SPIDER_TRANSITION })
            .attr('x', (category) => labelAt(category).x)
            .attr('y', (category) => labelAt(category).y);
    }

    /**
     * Every drawn series in draw order — comparison groups first, then the group, then
     * the student on top — with its ring of vertices and its paint.
     * @param {d3.ScaleLinear<number, number>} rScale - Maps a percentage onto a distance from the centre.
     * @returns {SpiderSeries[]}
     */
    #buildSeries(rScale) {
        /**
         * One ring. A spoke the series has no value on gets no vertex: the ring runs from
         * its neighbour to its neighbour instead of dipping to a 0 % it never had; a
         * series without any value stays empty and draws nothing.
         * @param {(key: string) => unknown} valueFor - The series' value for a category key.
         * @param {string} seriesLabel - The series name the tooltip shows.
         * @returns {SpiderPoint[]} In angle order.
         */
        const ring = (valueFor, seriesLabel) =>
            this.categories.flatMap((category) => {
                const value = valueFor(category.key);
                if (!isFiniteNumber(value)) return [];
                const { x, y } = angleToCoordinate(category.angle, rScale(value));
                return [{ key: category.key, x, y, value, seriesLabel }];
            });

        /**
         * The group's or the student's own series: a circle-vertex ring, always shown.
         * @param {'group'|'student'} key
         * @param {SpiderPoint[]} data
         * @param {string} color
         * @param {number} fillOpacity
         * @returns {SpiderSeries}
         */
        const ownSeries = (key, data, color, fillOpacity) => ({
            key,
            className: `spider-series-${key}`,
            group: null,
            data,
            color,
            fillOpacity,
            visibility: true,
        });

        /** @type {SpiderSeries[]} */
        const series = this.comparisonGroups.map((group, index) => ({
            key: group.id,
            className: comparisonSeriesClass(index),
            group,
            data: ring((key) => group.averages[key], comparisonSeriesLabel(group)),
            color: comparisonSeriesColor(group),
            fillOpacity: CHART_CONFIG.COLORS.FILL_OPACITY.COMPARISON,
            visibility: this.visibilityState[group.id],
        }));

        // Only the group's own aggregation carries group averages, and it names the group.
        const groupAverages = this.groupStyleAverages.groupAverages;
        series.push(
            ownSeries(
                'group',
                ring(
                    (key) => groupAverages[key],
                    /** @type {string} */ (this.groupStyleAverages.groupName),
                ),
                CHART_CONFIG.COLORS.GROUP,
                CHART_CONFIG.COLORS.FILL_OPACITY.GROUP,
            ),
        );

        const student = this.student;
        if (student) {
            const performance = buildStyleCategoryPerformance(student, this.enConfig);
            series.push(
                ownSeries(
                    'student',
                    ring((key) => performance[key], formatStudentName(student)),
                    CHART_CONFIG.COLORS.STUDENT,
                    CHART_CONFIG.COLORS.FILL_OPACITY.STUDENT,
                ),
            );
        }

        return series;
    }

    /**
     * The series' polygons, keyed by series key and kept in draw order. A ring that keeps
     * its vertex count morphs to its new shape; one that gains or loses a vertex (another
     * student, a spoke without a value) is redrawn at once, since a path tween between
     * two vertex counts scrambles the shape on the way. A series that goes (the student
     * deselected) fades out.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} layer
     * @param {SpiderSeries[]} series - In draw order.
     * @param {number} durationMs - `0` redraws at once.
     */
    #drawAreas(layer, series, durationMs) {
        const line = d3.line().curve(d3.curveLinearClosed);
        const pathOf = (/** @type {SpiderSeries} */ config) =>
            line(config.data.map((p) => /** @type {[number, number]} */ ([p.x, p.y])));
        const counts = this.#drawnVertexCounts;
        const keepsShape = (/** @type {SpiderSeries} */ config) =>
            counts.get(config.key) === config.data.length;

        /** @type {d3.Selection<SVGPathElement, SpiderSeries, SVGGElement, unknown>} */
        const existing = layer.selectChildren('path.spider-area');
        existing
            .data(series, (config) => config.key)
            .join(
                (enter) =>
                    enter
                        .append('path')
                        .attr('d', pathOf)
                        .attr('class', (config) => `spider-area ${config.className}`)
                        .style('fill', (config) => config.color)
                        .attr('fill-opacity', (config) => config.fillOpacity)
                        .style('stroke', (config) => config.color)
                        .attr('stroke-width', 2),
                (update) => {
                    takeBack(update, SPIDER_TRANSITION);
                    update.filter((config) => !keepsShape(config)).attr('d', pathOf);
                    animate(update.filter(keepsShape), {
                        durationMs,
                        name: SPIDER_TRANSITION,
                    }).attr('d', pathOf);
                    return update;
                },
                (exit) => fadeOutAndRemove(exit, SPIDER_TRANSITION, durationMs),
            )
            .attr('opacity', (config) => (config.visibility ? 1 : 0))
            .order();

        this.#drawnVertexCounts = new Map(series.map((config) => [config.key, config.data.length]));
    }

    /**
     * Draw each series' vertices: a comparison group's in its role shape through the
     * shared average-marker join, the group's and the student's as circles, joined by
     * series and spoke, so a student switch moves the student's points and keeps the
     * group's.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} layer
     * @param {SpiderSeries[]} series - In draw order.
     * @param {number} radius - Outer-ring radius, which the marker size scales with.
     * @param {number} durationMs - `0` moves them at once.
     * @returns {d3.Selection<SVGCircleElement, OwnVertex, SVGGElement, unknown>} The group's and the student's vertices.
     */
    #drawDataPoints(layer, series, radius, durationMs) {
        const pointRadius = Math.max(
            CHART_CONFIG.MIN_POINT_RADIUS_PX,
            radius * CHART_CONFIG.POINT_RADIUS_RATIO,
        );
        // The comparison groups' vertices in their role shapes, at the shared marker size
        // every chart that draws the role shapes uses.
        const ringOf = new Map(
            series.filter((config) => config.group).map((config) => [config.key, config.data]),
        );
        joinComparisonMarkers(this, layer, this.comparisonGroups, {
            baseClass: 'spider-point',
            dataFor: (group) => ringOf.get(group.id) ?? [],
            key: (d) => d.key,
            getX: (d) => d.x,
            getY: (d) => d.y,
            durationMs,
            transitionName: 'avg',
        });

        /** @type {OwnVertex[]} */
        const vertices = series
            .filter((config) => !config.group)
            .flatMap((config) => config.data.map((point) => ({ point, series: config })));
        /** @type {d3.Selection<SVGCircleElement, OwnVertex, SVGGElement, unknown>} */
        const existing = layer.selectChildren('circle.spider-point');
        const points = existing
            .data(vertices, (d) => `${d.series.key}:${d.point.key}`)
            .join(
                (enter) =>
                    enter
                        .append('circle')
                        .attr('class', (d) => `spider-point ${d.series.className}`)
                        .attr('cx', (d) => d.point.x)
                        .attr('cy', (d) => d.point.y)
                        .attr('r', pointRadius)
                        .style('fill', (d) => ownVertexPaint(d.series.color).fill)
                        .style('stroke', (d) => ownVertexPaint(d.series.color).stroke)
                        .attr('stroke-width', (d) => ownVertexPaint(d.series.color).strokeWidth),
                (update) => {
                    // A point caught leaving takes the pointer and the keyboard again.
                    takeBack(update, SPIDER_TRANSITION).style('opacity', null);
                    animate(update, { durationMs, name: SPIDER_TRANSITION })
                        .attr('cx', (d) => d.point.x)
                        .attr('cy', (d) => d.point.y)
                        .attr('r', pointRadius);
                    return update;
                },
                // A leaving point is off the pointer and the keyboard at once, so it
                // cannot keep the chart's tab stop into its removal.
                (exit) => fadeOutAndRemove(exit, SPIDER_TRANSITION, durationMs),
            )
            .order();
        // The size the hover grows from and returns to.
        setRestingSize(points, 'r', pointRadius);
        return points;
    }

    /**
     * One transparent wedge per spoke, over every vertex: the spoke's hover target and
     * tab stop. A vertex is a few px across, and several series meet on a spoke, so the
     * wedge around it — halfway to each neighbouring spoke, a little past the outer ring — takes
     * the pointer, tints with the `band` look, lists every series on the spoke and grows
     * its own-series vertices. The wedges keep the spokes' clockwise order, which the
     * arrow keys walk.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} layer - The wedges' layer, over the vertices.
     * @param {SpiderSeries[]} series
     * @param {d3.Selection<SVGCircleElement, OwnVertex, SVGGElement, unknown>} vertices - The group's and the student's vertices, which the hover grows.
     * @param {number} radius - Of the outer ring.
     */
    #drawWedges(layer, series, vertices, radius) {
        const half = Math.PI / this.categories.length;
        const arc = d3.arc();
        const outerRadius = radius + CHART_CONFIG.WEDGE_REACH_PX;
        const spokes = this.categories.map((category) => ({ category, series }));
        /** @type {d3.Selection<SVGPathElement, (typeof spokes)[number], SVGGElement, unknown>} */
        const drawn = layer.selectChildren('path.spider-wedge');
        const wedges = drawn
            .data(spokes, (d) => d.category.key)
            .join((enter) => enter.append('path').attr('class', 'chart-hit spider-wedge'))
            .attr('d', (d) => {
                const angle = (d.category.angle * Math.PI) / 180;
                return arc({
                    innerRadius: 0,
                    outerRadius,
                    startAngle: angle - half,
                    endAngle: angle + half,
                });
            })
            .order();

        this.wireTooltipEvents(wedges, {
            getTooltipContent: (d) => this.formatTooltipContent(d),
            hoverEffect: 'band',
            linked: [
                {
                    marks: vertices,
                    match: (vertex, d) => vertex.point.key === d.category.key,
                    effect: 'point',
                },
            ],
        });
    }
}

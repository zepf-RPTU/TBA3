/**
 * ItemRingChart — one cell of the Aufgabenring grid: a Leitidee's or competence value's ring (or every item's)
 * under its title and item count. A rate over few items reads with caution, so the count
 * stands under every title, at every size. The ring itself — radii, arcs, ticks, centre
 * text — belongs to `itemRingFigure.js`; the
 * title band, which must be equally tall in every cell or the rings stop aligning, is
 * measured by `itemRingTitleMetrics.js`.
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { createState } from '@tba3/module-base';
import { appendLabelLines } from '../../../../common/charts/chartLabelFit.js';
import {
    COUNT_FONT_RATIO,
    FONT_MAX_PX,
    itemCountText,
    ringFrame,
    TITLE_PADDING_PX,
    titleBandHeight,
    titleCountBaseline,
} from './itemRingTitleMetrics.js';
import { groupStats, ringFigures } from './ringStatistics.js';
import { ringSelection } from './selection.js';
import { describeItemRing, drawItemRing, meanPilotSolutionFrequency } from './itemRingFigure.js';
import { ringItems } from '../../../utils/maItemRings.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import './itemRingBase.css';

/** @typedef {import('../../../../common/charts/renderers/chartRenderer.js').LayoutRect} LayoutRect */
/** @typedef {import('../../../../common/domain/studentIdentity.js').StudentName} StudentName */

/**
 * The item fields a grid ring reads: the figure's inputs plus the id its ring is filtered by.
 * @typedef {import('./itemRingFigure.js').ItemRingFigureEntry & {iqbId: string}} ItemRingEntry
 */

/**
 * What the grid controller hands one ring.
 * @typedef {object} ItemRingChartOptions
 * @property {{iqbIds: Set<string>, title: string}|null} [ring] - The ring (`ItemRingChartDefinition`): its items and its title; `null` draws every item, untitled.
 * @property {Array<string>|null|import('@preact/signals-core').Signal<Array<string>|null>} [selectedStudents] - The grid hands every ring its host's signal, so a write to it redraws them all.
 * @property {boolean|import('@preact/signals-core').Signal<boolean>} [innerRingVisible] - On by default; shared like `selectedStudents`.
 */

/**
 * What a ring draws from, as signals.
 * @typedef {object} ItemRingState
 * @property {Array<string>|null} selectedStudents
 * @property {boolean} innerRingVisible
 */

/**
 * The title layout the grid solved: the text size the cell's CSS carries (from the
 * solve, not read back from the computed style, which would cost a style recalc per
 * query), the title's lines and how many lines the band of every cell reserves.
 * @typedef {{fontSize: number, titleLines: string[], titleLineCount: number}} RingTitle
 */

/** @augments ChartRenderer */
export class ItemRingChart extends ChartRenderer {
    /**
     * @type {RingTitle} Cell geometry, not state: a new one comes with a new cell box, so
     * the grid draws it through a measured pass. The stand-in the grid returns when it
     * has no rings never draws; it keeps the token size and no title band.
     */
    #titleLayout = { fontSize: FONT_MAX_PX, titleLines: [], titleLineCount: 0 };

    /**
     * @param {HTMLElement} container
     * @param {ItemRingEntry[]} itemArray - Every item of the booklet; the ring filters by `ring`.
     * @param {StudentName[]} studentArray - The full student array, against which a selection is judged.
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & ItemRingChartOptions} options
     */
    constructor(container, itemArray, studentArray, options) {
        super(container, {
            // The grid resizes its rings.
            autoResize: false,
            ...options,
        });

        this.studentArray = studentArray;
        /** Whether the booklet has any item: a ring without its own draws the placeholder ring. */
        this.hasItems = itemArray.length > 0;
        // Items and filter are fixed for the ring's life: the grid builds new rings
        // when either changes.
        /** @type {ItemRingEntry[]} */
        this.filteredItems = options.ring ? ringItems(itemArray, options.ring) : itemArray;
        /** The ring's item count with its unit, under the title. */
        this.itemCountText = itemCountText(this.filteredItems.length);
        this.chartTitle = options.ring?.title;
        /** @type {import('@tba3/module-base').State<ItemRingState>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<ItemRingState>} */ ({
                selectedStudents: options.selectedStudents ?? null,
                innerRingVisible: options.innerRingVisible ?? true,
            }),
        );

        // The group figures and the pilot rate follow the items alone, so they are counted
        // once; the selection's figures are recounted per draw by #ringSpec.
        this.groupItemData = groupStats(this.context.palette, this.filteredItems);
        this.pilotFrequency = meanPilotSolutionFrequency(this.filteredItems);
    }

    /**
     * Take the title layout the grid solved for this ring's cell. Stored only: the next
     * measured pass (`measureIfStale`, `drawMeasured`) draws with it.
     * @param {RingTitle} title
     */
    setTitleLayout(title) {
        this.#titleLayout = title;
    }

    /** @returns {number} The title band's height above the ring, px. */
    get titleSpace() {
        const { fontSize, titleLineCount } = this.#titleLayout;
        return this.chartTitle ? titleBandHeight(fontSize, titleLineCount) : 0;
    }

    /**
     * One ring of several in the grid card: named by its own title, not the card's, with
     * its item count, which the SVG's `img` role keeps from being read off the drawn line.
     * @override
     * @protected
     */
    accessibleName() {
        return this.chartTitle ? `${this.chartTitle}. ${this.itemCountText}` : null;
    }

    // ============================================================================
    // LIFECYCLE
    // ============================================================================

    /**
     * A ring draws whenever the booklet has items: one without items of its own is
     * the placeholder ring, so the grid stays complete.
     * @override
     */
    validateData() {
        return this.hasItems;
    }

    /**
     * Draw the ring into the one already on screen: every mark of the figure is joined,
     * so a selection change or the inner-ring toggle moves only the marks that changed.
     * @override
     */
    renderChart() {
        const { svg, g, radius, chartArea } = this.#createRingCanvas();
        const spec = this.#ringSpec();
        drawItemRing(g, radius, spec);
        this.renderTitle(svg, chartArea);
        // Marks kept out of the tab order mean the cell is the keyboard target: it
        // carries what the marks would announce, redrawn with every selection.
        if (!this.options.focusableMarks) {
            this.container.setAttribute(
                'aria-label',
                `${this.chartTitle}. ${this.itemCountText}. ${describeItemRing(spec)}`,
            );
        }
    }

    /**
     * The figure's inputs for the ring as it currently stands: the figures for the
     * selection in state, so a deselection (`null`) is reflected.
     * @returns {import('./itemRingFigure.js').ItemRingSpec}
     */
    #ringSpec() {
        const selection = ringSelection(
            this.context.glossary,
            this.state.selectedStudents.value,
            this.studentArray,
        );
        return {
            ...ringFigures(this.context.palette, this.filteredItems, selection, this.groupItemData),
            selection,
            pilotFrequency: this.pilotFrequency,
            innerRingVisible: this.state.innerRingVisible.value,
            durationMs: this.drawDurationMs,
            chartInstance: this,
        };
    }

    /**
     * Size the SVG, compute the radius, and place the centred ring group: the root and
     * the group are the ones on screen when the ring has been drawn before. The ring
     * takes the cell's whole content box, without the plot inset `initializeSVG()`
     * keeps: the grid sized the cell for exactly the diameter it solved.
     * @returns {{svg: d3.Selection<SVGSVGElement, unknown, any, any>, g: d3.Selection<SVGGElement, unknown, any, any>, radius: number, chartArea: LayoutRect}}
     */
    #createRingCanvas() {
        const { containerWidth, containerHeight } = this.measuredDimensions();
        const svg = this.createSVGElement(containerWidth, containerHeight);

        // The ring text inherits the cell's `--ring-fs`, which the grid scaled with the ring.
        svg.classed('item-ring-chart-svg', true);

        const chartArea = { x: 0, y: 0, width: containerWidth, height: containerHeight };
        const { radius, centerY } = ringFrame(chartArea, this.titleSpace);
        const centerX = chartArea.x + chartArea.width / 2;
        const g = selectOrAppend(svg, 'g', 'item-ring-figure').attr(
            'transform',
            `translate(${centerX}, ${centerY})`,
        );

        return { svg, g, radius, chartArea };
    }

    /**
     * The title above the ring, and the item count under it, as SVG text.
     * @param {d3.Selection<SVGSVGElement, unknown, any, any>} svg
     * @param {LayoutRect} chartArea
     */
    renderTitle(svg, chartArea) {
        const { fontSize, titleLines } = this.#titleLayout;
        const x = chartArea.x + chartArea.width / 2;
        const lines = titleLines.length === 0 ? [] : [titleLines];
        const title = svg
            .selectChildren('text.item-ring-svg-title')
            .data(lines)
            .join((enter) => enter.append('text').attr('class', 'item-ring-svg-title'))
            .attr('x', x)
            .attr('y', chartArea.y + fontSize + TITLE_PADDING_PX);

        // The lines are leaves: a new title layout breaks the title afresh.
        title.selectChildren('tspan').remove();
        if (!title.empty()) appendLabelLines(title, titleLines, { x, stack: 'down' });

        // Sized here, not in the sheet: the ratio is the one that reserved the count's
        // line in the title band (titleCountBaseline).
        svg.selectChildren('text.item-ring-svg-count')
            .data(lines)
            .join((enter) => enter.append('text').attr('class', 'item-ring-svg-count'))
            .style('font-size', `${fontSize * COUNT_FONT_RATIO}px`)
            .attr('x', x)
            .attr('y', chartArea.y + titleCountBaseline(fontSize, titleLines.length))
            .text(this.itemCountText);
    }
}

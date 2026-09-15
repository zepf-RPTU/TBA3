/**
 * Task Ring Focus Chart for Mathematics Domain Analysis
 *
 * Displays a single domain task ring with text blocks below:
 * - Auffällige Aufgaben (Notable tasks)
 * - Leitideen und Fähigkeiten (Competencies)
 *
 * The ring itself is drawn by `taskRingFigure.js`, the same figure the grid cells use.
 * This chart owns only what surrounds it: the fixed-size ring box, the two text blocks
 * and the placeholder notice.
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { chartLayoutPreset } from '../../../../common/charts/chartAxisUtils.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { compareLevelLabels } from '../../../../common/domain/levels.js';
import { MA_TERM_CONSTANTS } from '../../../maTerms.js';
import { classStats, selectionStats } from './ringStatistics.js';
import { normalizeSelectedStudents } from './taskRingBase.js';
import { drawTaskRing } from './taskRingFigure.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import * as d3 from 'd3';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TASK_RING_FOCUS_CONFIG = {
    RING: {
        /** The ring box follows the card: never smaller than a grid ring, never a poster. */
        MIN_SIZE: 250,
        MAX_SIZE: 420,
        MARGIN: 30,
    },
    TEXT_BLOCKS: {
        MAX_ITEMS: 5,
    },
};

/**
 * One entry of the focus chart's glossary fragment.
 * @param {string} path - Dot-path below `ma.items.task-ring-focus`.
 * @returns {string} The entry text.
 */
function focusText(path) {
    return glossaryAnnotator.getRequiredEntryText(`ma.items.task-ring-focus.${path}`);
}

// =============================================================================
// DATA PROCESSING
// =============================================================================

/**
 * Identifies notable tasks (outliers in success rate)
 * @param {Array<object>} itemArray - The Leitidee's items.
 * @param {number} [threshold] - How many percentage points below the mean a task must fall to count as notable.
 * @returns {Array<{id: string, title: string, successRate: number, niveau: string}>} The weakest tasks first, capped at the text block's item limit.
 */
function identifyNotableTasks(itemArray, threshold = 20) {
    // An item without result counts has no success rate: it neither moves the mean nor
    // shows up as notable.
    const tasks = (itemArray ?? [])
        .filter((item) => Number.isFinite(item.percentageCorrect))
        .map((item) => ({
            id: item.name,
            title: item.exerciseName || `Aufgabe ${item.name || '?'}`,
            successRate: item.percentageCorrect,
            niveau: item.competenceLevel,
        }));
    if (tasks.length === 0) return [];

    // Calculate mean success rate
    const meanSuccessRate = tasks.reduce((sum, t) => sum + t.successRate, 0) / tasks.length;

    // Find outliers (significantly below mean)
    return tasks
        .filter((task) => meanSuccessRate - task.successRate > threshold)
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, TASK_RING_FOCUS_CONFIG.TEXT_BLOCKS.MAX_ITEMS);
}

/**
 * Extracts competency information from item data
 * @param {Array<object>} itemArray - The Leitidee's items.
 * @returns {Array<object>} One entry per Aufgabenniveau present, summarising the items on it.
 */
function extractCompetencies(itemArray) {
    if (!itemArray?.length) return [];

    // Group items by niveau level
    const niveauGroups = itemArray.reduce((acc, item) => {
        const niveau = item.competenceLevel; // Already in Roman numeral format
        if (!acc[niveau]) {
            acc[niveau] = [];
        }
        acc[niveau].push(item);
        return acc;
    }, {});

    // Create competency entries, in the order of the registered item scale
    return Object.entries(niveauGroups)
        .sort((a, b) => compareLevelLabels(a[0], b[0]))
        .slice(0, TASK_RING_FOCUS_CONFIG.TEXT_BLOCKS.MAX_ITEMS)
        .map(([niveau, items]) => ({
            niveau,
            description: `${TERM_CONSTANTS.ITEM_LEVEL} ${niveau} Aufgaben`,
            count: items.length,
        }));
}

// =============================================================================
// TASK RING FOCUS CHART CLASS
// =============================================================================

/**
 * Task ring focus chart with text blocks
 * @augments ChartRenderer
 */
class TaskRingFocusChart extends ChartRenderer {
    #domainLabel;

    constructor(containerId, itemArray, studentArray, domainData, options = {}) {
        super(containerId, {
            defaultWidth: 800,
            defaultHeight: 400,
            autoResize: true,
            layout: chartLayoutPreset('compactNoAxis', {
                padding: { top: 20, right: 20, bottom: 20, left: 20 },
            }),
            ...options,
        });

        // Construction options, not data: neither changes over the chart's life.
        this.#domainLabel = options.domainLabel || MA_TERM_CONSTANTS.DOMAIN;

        // Seed reactive state from the arguments — getInitialState() runs inside super()
        // before they are readable here, so _state holds bare defaults. Assigned directly
        // (not via setState) so construction does not trigger a render. _state is the
        // single source of truth; everything else this chart draws is derived per render.
        this._state.items = itemArray;
        this._state.students = studentArray;
        this._state.domain = domainData;
        this._state.selectedStudents = options.selectedStudents || null;
    }

    // ============================================================================
    // REACTIVE STATE
    // ============================================================================

    /**
     * Reactive state shape. Static defaults only — the real values are seeded in the
     * constructor, after super() returns.
     * @override
     */
    getInitialState() {
        return { items: null, students: null, domain: null, selectedStudents: null };
    }

    /**
     * Every state key this chart holds feeds the render, and a domain change re-renders a
     * different set of items — so there is no partial update to be made here.
     * @override
     */
    _onStateChanged() {
        this.refresh();
    }

    // ============================================================================
    // LIFECYCLE METHODS
    // ============================================================================

    validateData() {
        // Defensive guard: destroy() may have been called during async operations
        if (this.destroyed) {
            console.warn('TaskRingFocusChart: chart has been destroyed');
            return false;
        }
        if (!this._state.items || this._state.items.length === 0) {
            console.warn('No item data available for task ring focus chart');
            return false;
        }
        if (!this._state.students || this._state.students.length === 0) {
            console.warn('No student data available for task ring focus chart');
            return false;
        }
        return true;
    }

    async renderChart() {
        const domainFilter = this._state.domain?.domain || null;
        const filteredItems = domainFilter
            ? this._state.items.filter((item) => item.domain === domainFilter)
            : this._state.items;

        if (filteredItems.length === 0) {
            this.showNoDataMessage(`Keine Aufgaben in dieser ${this.#domainLabel} verfügbar.`);
            return;
        }

        // The outer ring is always the whole class; the inner ring and the tick follow the
        // selection. Without one the ring draws the class figures — the same object, not a
        // second identical computation.
        const classTaskData = classStats(filteredItems);
        const normalizedSelected = normalizeSelectedStudents(this._state.selectedStudents);
        const taskData = normalizedSelected
            ? selectionStats(filteredItems, normalizedSelected)
            : classTaskData;

        // Clear existing content
        this.clearContainer();

        const container = d3.select(`#${this.containerId}`).classed('task-ring-focus-body', true);

        // Create ring container (top)
        const ringContainer = container
            .append('div')
            .attr('class', 'task-ring-focus-ring-container');

        // Create text blocks container (bottom)
        const textBlocksContainer = container
            .append('div')
            .attr('class', 'task-ring-focus-text-blocks');

        // Render components
        this.renderTaskRing(ringContainer, {
            ringStats: taskData,
            classStats: classTaskData,
            items: filteredItems,
            normalizedSelected,
        });
        this.renderNotableTasksBlock(textBlocksContainer, identifyNotableTasks(filteredItems));
        this.renderCompetenciesBlock(textBlocksContainer, extractCompetencies(filteredItems));
        this.renderUnderConstructionNotice(textBlocksContainer);
    }

    /**
     * Draw the ring into a square box sized by the card.
     *
     * This is the detail card, so the ring should be the largest one on the page: it
     * takes the card's width (within MIN_SIZE…MAX_SIZE) rather than the grid ring's
     * cell size. The figure takes its radius from here.
     * @param {any} container - The div the ring's SVG is appended to.
     * @param {{ringStats: object, classStats: object, items: Array, normalizedSelected: Array<string>|null}} figures - What the ring stands for, already derived.
     */
    renderTaskRing(container, figures) {
        const { MIN_SIZE, MAX_SIZE, MARGIN } = TASK_RING_FOCUS_CONFIG.RING;
        const available =
            this.dimensions?.containerWidth ?? this.calculateDimensions().containerWidth;
        const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, available));
        const svg = container
            .append('svg')
            .attr('width', size)
            .attr('height', size)
            .attr('class', 'task-ring-focus-svg');

        // Store SVG reference for this chart instance
        this.svg = svg;

        const radius = size / 2 - MARGIN;

        const g = svg.append('g').attr('transform', `translate(${size / 2}, ${size / 2})`);

        // Store main group reference
        this.mainGroup = g;

        drawTaskRing(g, radius, {
            ...figures,
            students: this._state.students,
            // The detail card has the room for it, so the niveau ring is never hidden here.
            innerRingVisible: true,
            chartInstance: this,
            tooltips: {
                niveau: (d) =>
                    this.buildTooltipHTML({
                        title: `${TERM_CONSTANTS.ITEM_LEVEL} ${d.data.niveau}`,
                        rows: [
                            { label: 'Anzahl Aufgaben', value: d.data.count },
                            {
                                label: 'Anteil',
                                value: `${((d.data.count / figures.ringStats.totalTasks) * 100).toFixed(1)}%`,
                            },
                            { label: 'Lösungsrate', value: `${d.data.successRate.toFixed(1)}%` },
                        ],
                    }),
                classAverage: () =>
                    this.buildTooltipHTML({
                        title: 'Klassen-Durchschnitt',
                        rows: [
                            {
                                label: 'Lösungsrate',
                                value: `${figures.classStats.successRate.toFixed(1)}%`,
                            },
                            {
                                label: 'Gelöst',
                                value: `${figures.classStats.totalCorrect} von ${figures.classStats.totalOpportunities}`,
                            },
                        ],
                    }),
            },
        });
    }

    /**
     * @param {any} container - The div the block is appended to.
     * @param {Array<{id: string, title: string, successRate: number}>} notableTasks - From `identifyNotableTasks`.
     */
    renderNotableTasksBlock(container, notableTasks) {
        const block = container.append('div').attr('class', 'task-ring-focus-text-block');

        // Title
        block
            .append('div')
            .attr('class', 'task-ring-focus-text-block-title')
            .text(focusText('notable-items.title'));

        // List of notable tasks
        if (notableTasks.length === 0) {
            block
                .append('div')
                .attr('class', 'task-ring-focus-text-block-empty')
                .text(focusText('messages.no-notable-items'));
        } else {
            const list = block.append('ul').attr('class', 'task-ring-focus-text-block-list');

            notableTasks.forEach((task) => {
                const listItem = list
                    .append('li')
                    .attr('class', 'task-ring-focus-text-block-list-item');

                listItem.append('span').text(`${task.id} - ${task.title}: `);

                listItem.append('span').text(`${task.successRate.toFixed(1)}% Erfolg`);
            });
        }

        // Footnote clarifying the list criterion
        block
            .append('p')
            .attr('class', 'task-ring-focus-text-block-note')
            .html(`${iconSvg('info')} Aufgaben mit unterdurchschnittlicher Lösungsquote`);
    }

    /**
     * @param {any} container - The div the block is appended to.
     * @param {Array<{description: string, count: number}>} competencies - From `extractCompetencies`.
     */
    renderCompetenciesBlock(container, competencies) {
        const block = container.append('div').attr('class', 'task-ring-focus-text-block');

        // Title
        block
            .append('div')
            .attr('class', 'task-ring-focus-text-block-title')
            .text(focusText('competencies.title'));

        // List of competencies
        if (competencies.length === 0) {
            block
                .append('div')
                .attr('class', 'task-ring-focus-text-block-empty')
                .text(focusText('messages.no-competency-data'));
        } else {
            const list = block.append('ul').attr('class', 'task-ring-focus-text-block-list');

            competencies.forEach((comp) => {
                const listItem = list
                    .append('li')
                    .attr('class', 'task-ring-focus-text-block-list-item');

                listItem.append('span').text(`${comp.description}: `);

                listItem.append('span').text(`${comp.count} Aufgaben`);
            });
        }
    }

    /**
     * @param {any} container - The div the notice is appended to.
     */
    renderUnderConstructionNotice(container) {
        const notice = container
            .append('div')
            .attr('class', 'help-notice notice-callout')
            .attr('role', 'note')
            .attr(
                'aria-label',
                glossaryAnnotator.getRequiredEntryText(
                    'general.buttons.element_texts.region-hint.label',
                ),
            );

        notice
            .append('span')
            .attr('class', 'help-notice-icon notice-callout-icon')
            .attr('aria-hidden', 'true')
            .html(iconSvg('warning'));

        notice
            .append('p')
            .attr('class', 'help-notice-message notice-callout-message')
            .text(focusText('placeholder-notice.body'));
    }
}

// Export the class for direct use
export { TaskRingFocusChart };

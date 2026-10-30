/**
 * ItemRingFocusChart — one item ring in detail (a Leitidee or a competence value) above its Leistung rows, the Auffällige Teilaufgaben list, the inner ring's table (the items and
 * Lösungsquoten per Aufgabenniveau) and the students below or at and above the group's
 * Lösungsquote. The Leistung rows and the student list are the shared resultRows.js
 * and studentGroupList.js, pooled over the ring's items.
 *
 * The ring is `itemRingFigure.js`'s; this chart owns the ring box and the text blocks.
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { percentOf, pooledResultCounts } from '../../../../common/domain/itemResultCounts.js';
import { ringFigures, studentRates } from './ringStatistics.js';
import { drawItemRing, meanPilotSolutionFrequency } from './itemRingFigure.js';
import { ringSelection } from './selection.js';
import { RING_REACH, RING_SIZE_MIN_PX } from './itemRingGeometry.js';
import { getItemRingFontSizeForRing } from './itemRingTitleMetrics.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { createIcon, createState } from '@tba3/module-base';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import * as d3 from 'd3';
import { html, nothing, render } from 'lit';
import { formatCount, formatPercent } from '../../../../common/utils/numberFormat.js';
import { resultSectionTemplate } from '../../../../common/utils/resultRows.js';
import { studentGroupListTemplate } from '../../../../common/utils/studentGroupList.js';
import { sortStudentsByName } from '../../../../common/domain/studentIdentity.js';
import './itemRingFocus.css';

/**
 * The ring's figures with the selection they were counted for.
 * @typedef {import('./ringStatistics.js').RingFigures & {selection: import('./selection.js').RingSelection}} RingFigures
 */
/** @typedef {import('../../../../common/domain/studentIdentity.js').StudentName} StudentName */

/**
 * The item fields the focus chart reads: the ring's inputs, what the list names and the
 * result counts the Leistung rows pool.
 * @typedef {import('./itemRingFigure.js').ItemRingFigureEntry & import('../../../../common/domain/itemResultCounts.js').ItemResultCounts & {name: string, exerciseName: string}} ItemRingFocusEntry
 */

/** The student groups of the list's toggle. */
const STUDENT_GROUP = Object.freeze({ BELOW: 'below', AT_OR_ABOVE: 'at-or-above' });

/** @typedef {import('../../../utils/maItemRings.js').ItemRingChartDefinition} ItemRingChartDefinition */

const ITEM_RING_FOCUS_CONFIG = {
    /** The ring box's share of the card's height; the text blocks scroll below it. */
    RING_BOX_HEIGHT_RATIO: 1 / 3,
    TEXT_BLOCKS: {
        MAX_ITEMS: 5,
        /** How far below the group's rate an item must fall to count as notable. */
        NOTABLE_GAP_PP: 20,
    },
};

/**
 * One entry of the focus chart's glossary fragment.
 * @param {import('../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {string} path - Dot-path below `ma.item.item-ring-focus`.
 * @returns {string}
 */
function focusText(glossary, path) {
    return glossary.getRequiredEntryText(`ma.item.item-ring-focus.${path}`);
}

/**
 * The notable items, one line each: the items far enough below the group's success rate
 * that the ring prints, weakest first. An item without responses has no success rate and
 * is never notable.
 * @param {ItemRingFocusEntry[]} items
 * @param {number} groupRate - The group's pooled success rate, 0–100, as the ring shows it.
 * @param {import('../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {string[]} At most the text block's item limit.
 */
function notableItemLines(items, groupRate, glossary) {
    const rated = items.flatMap((item) => {
        const successRate = percentOf(item.solvedCount, item.responseCount);
        return successRate === null ? [] : [{ item, successRate }];
    });
    return rated
        .filter(
            ({ successRate }) =>
                groupRate - successRate > ITEM_RING_FOCUS_CONFIG.TEXT_BLOCKS.NOTABLE_GAP_PP,
        )
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, ITEM_RING_FOCUS_CONFIG.TEXT_BLOCKS.MAX_ITEMS)
        .map(
            ({ item, successRate }) =>
                `${item.name} – ${item.exerciseName}: ${formatPercent(successRate)} ${focusText(glossary, 'labels.success')}`,
        );
}

/**
 * What the focus chart draws from, as signals: the config writes them per update.
 * @typedef {object} ItemRingFocusState
 * @property {ItemRingChartDefinition|null} ring - `null` for none.
 * @property {ItemRingFocusEntry[]} items
 * @property {Array<string>|null} selectedStudents
 * @property {string|null} studentGroup - The student list's group (`STUDENT_GROUP`) the viewer picked; `null` shows the smaller.
 */

/** @augments ChartRenderer */
class ItemRingFocusChart extends ChartRenderer {
    /**
     * @param {HTMLElement} container
     * @param {object} data
     * @param {import('../../../../common/context/moduleContext.js').ModuleContext} data.context
     * @param {ItemRingFocusEntry[] | import('@preact/signals-core').Signal<ItemRingFocusEntry[]>} data.items - The host's signal, shared.
     * @param {StudentName[]} data.students - The full student array, against which a selection is judged.
     * @param {ItemRingChartDefinition | null | import('@preact/signals-core').Signal<ItemRingChartDefinition|null>} data.ring - `null` for none; the host's signal, shared.
     * @param {Array<string> | null | import('@preact/signals-core').Signal<Array<string>|null>} data.selectedStudents - The host's signal, shared.
     * @param {string | null | import('@preact/signals-core').Signal<string|null>} [data.studentGroup] - The student list's picked group; the host's signal, shared.
     * @param {(studentId: string) => void} [data.onStudentSelected] - A click on a listed student.
     */
    constructor(
        container,
        {
            context,
            items,
            students,
            ring,
            selectedStudents,
            studentGroup = null,
            onStudentSelected,
        },
    ) {
        super(container, { context });

        this.students = students;
        this.onStudentSelected = onStudentSelected;
        /** @type {import('@tba3/module-base').State<ItemRingFocusState>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<ItemRingFocusState>} */ ({
                ring,
                items,
                selectedStudents,
                studentGroup,
            }),
        );
    }

    // ============================================================================
    // LIFECYCLE
    // ============================================================================

    /** @override */
    validateData() {
        return this.#emptyReason() === null;
    }

    /**
     * The grouping has no ring at all, the ring has no items, or a selection
     * has no student records to judge it against: the card stays and says which.
     * @override
     * @protected
     */
    noDataMessage() {
        const reason = this.#emptyReason();
        return reason ? focusText(this.context.glossary, reason) : super.noDataMessage();
    }

    /**
     * The ring box and the text blocks go with the SVG inside them.
     * @override
     * @protected
     */
    removeDrawing() {
        super.removeDrawing();
        d3.select(this.container)
            .classed('item-ring-focus-body', false)
            .selectChildren('div.item-ring-focus-ring-container, div.item-ring-focus-text-blocks')
            .remove();
    }

    /**
     * Draw the card into the one on screen: the ring's marks are joined, so a new
     * selection or ring moves the inner ring, the centre and the ticks (the student
     * tick turns to its new angle), and lit-html patches the list and the table.
     * @override
     */
    renderChart() {
        const { glossary } = this.context;
        const items = this.state.items.value;
        const selection = ringSelection(glossary, this.state.selectedStudents.value, this.students);
        const figures = { ...ringFigures(this.context.palette, items, selection), selection };

        const container = d3.select(this.container).classed('item-ring-focus-body', true);
        /** @type {d3.Selection<HTMLDivElement, unknown, any, any>} */
        let ringBox = container.selectChild('div.item-ring-focus-ring-container');
        /** @type {d3.Selection<HTMLDivElement, unknown, any, any>} */
        let textBlocks = container.selectChild('div.item-ring-focus-text-blocks');
        if (ringBox.empty() || textBlocks.empty()) {
            // A first draw, or the card held a message: start from an empty container.
            this.clearContainer();
            ringBox = container.append('div').attr('class', 'item-ring-focus-ring-container');
            textBlocks = container.append('div').attr('class', 'item-ring-focus-text-blocks');
        }
        const pilotRate = meanPilotSolutionFrequency(items);
        this.#renderRingBox(ringBox, figures, pilotRate);

        const groupRate = percentOf(
            figures.groupStats.totalCorrect,
            figures.groupStats.totalOpportunities,
        );
        const results = this.#resultsBlock(figures, groupRate, pilotRate);
        const notable = textBlockTemplate({
            title: focusText(glossary, 'notable-items.title'),
            emptyText: focusText(glossary, 'messages.no-notable-items'),
            lines: notableItemLines(items, figures.groupStats.successRate, glossary),
            note: focusText(glossary, 'notable-items.body'),
        });
        const levels = this.#levelTable(figures);
        const students = this.#studentsBlock(groupRate);
        render(
            html`${results}${notable}${levels}${students}`,
            /** @type {HTMLDivElement} */ (textBlocks.node()),
        );
    }

    /**
     * The Leistung rows, pooled over the ring's items: the group's Lösungsquote (the
     * outer arc's), and while a selection is active the selection's beside it (the
     * centre's), the summed response counts and the mean Pilotierung.
     * @param {RingFigures} figures
     * @param {number|null} groupRate - The group's Lösungsquote; `null` when nobody answered.
     * @param {number|null} pilotRate - The items' mean Pilotierung, 0–100.
     * @returns {import('lit').TemplateResult}
     */
    #resultsBlock({ ringStats, selection }, groupRate, pilotRate) {
        const { glossary } = this.context;
        const counts = pooledResultCounts(this.state.items.value);
        const selectionRate = selection.isSubset
            ? {
                  label: applyTemplateTokens(focusText(glossary, 'results.selection-rate'), {
                      name: selection.name,
                  }),
                  rate: percentOf(ringStats.totalCorrect, ringStats.totalOpportunities),
              }
            : undefined;
        const section = resultSectionTemplate(glossary, {
            rate: groupRate,
            selection: selectionRate,
            correct: counts.correctCount,
            incorrect: counts.incorrectCount,
            notAttempted: counts.notAttemptedCount,
            total: counts.total,
            totalUnit: 'responses',
            pilotRate,
            // Whole points, as the item table's Pilotierung (Δ) rounds them.
            pilotDiffPP:
                groupRate === null || pilotRate === null ? null : Math.round(groupRate - pilotRate),
        });
        return html`<div class="item-ring-focus-text-block">${section}</div>`;
    }

    /**
     * The students below the group's Lösungsquote and those at or above it, each with
     * their own rate over the ring's items, counted as the ring counts them once
     * that student is selected. Each side lists its students by that rate, lowest first.
     * @param {number|null} groupRate - The group's Lösungsquote; `null` lists nobody.
     * @returns {import('lit').TemplateResult}
     */
    #studentsBlock(groupRate) {
        const { glossary } = this.context;
        const text = (/** @type {string} */ key) => focusText(glossary, `students.${key}`);
        // Lowest rate first, by the whole percent the list shows; the stable sort keeps
        // equal shown rates in name order.
        const rated =
            groupRate === null
                ? []
                : studentRates(
                      this.state.items.value,
                      sortStudentsByName(this.students ?? []),
                  ).sort((a, b) => Math.round(a.rate) - Math.round(b.rate));
        /**
         * @param {boolean} below - Which side of the group's rate.
         * @returns {import('../../../../common/utils/studentGroupList.js').StudentGroupMember[]}
         */
        const members = (below) =>
            rated
                .filter(({ rate }) => below === rate < /** @type {number} */ (groupRate))
                .map(({ student, rate }) => ({ student, detail: formatPercent(rate, 0) }));
        const list = studentGroupListTemplate(glossary, {
            groups: [
                {
                    id: STUDENT_GROUP.BELOW,
                    label: text('below.label'),
                    heading: text('below.heading'),
                    emptyText: text('below.empty'),
                    members: members(true),
                },
                {
                    id: STUDENT_GROUP.AT_OR_ABOVE,
                    label: text('at-or-above.label'),
                    heading: text('at-or-above.heading'),
                    emptyText: text('at-or-above.empty'),
                    members: members(false),
                },
            ],
            noDataText: focusText(glossary, 'messages.no-student-results'),
            activeId: this.state.studentGroup.value,
            onGroup: (group) => {
                this.state.studentGroup.value = group;
            },
            onStudent: (studentId) => this.onStudentSelected?.(studentId),
        });
        return html`<div class="item-ring-focus-text-block">${list}</div>`;
    }

    /**
     * The inner ring as a table, its twin: per Aufgabenniveau, in scale order, the items
     * and the group's Lösungsquote, and the selection's beside it while one is active.
     * Every Niveau is listed.
     * @param {RingFigures} figures
     * @returns {import('lit').TemplateResult}
     */
    #levelTable({
        groupStats: group,
        ringStats: selection,
        selection: { isSubset: selected, name },
    }) {
        const { glossary } = this.context;
        const text = (/** @type {string} */ key) => focusText(glossary, `levels.${key}`);
        const title = html`<h4>${text('title')}</h4>`;
        if (group.itemCompetenceLevelDistribution.length === 0) {
            return html`<div class="item-ring-focus-text-block">
                ${title}
                <div class="empty-message">
                    ${focusText(glossary, 'messages.no-competence-data')}
                </div>
            </div>`;
        }
        const selectionRate = new Map(
            selection.itemCompetenceLevelDistribution.map(({ level, successRate }) => [
                level,
                successRate,
            ]),
        );
        const selectionHead = selected ? html`<th scope="col">${name}</th>` : nothing;
        const rows = group.itemCompetenceLevelDistribution.map(
            ({ level, count, successRate }) =>
                html`<tr>
                    <th scope="row">${level}</th>
                    <td>${formatCount(count)}</td>
                    <td>${formatPercent(successRate)}</td>
                    ${selected ? html`<td>${formatPercent(selectionRate.get(level))}</td>` : nothing}
                </tr>`,
        );
        return html`<div class="item-ring-focus-text-block">
            ${title}
            <table class="item-ring-focus-table">
                <thead>
                    <tr>
                        <th scope="col">${text('columns.level')}</th>
                        <th scope="col">${text('columns.items')}</th>
                        <th scope="col">${text('columns.group-rate')}</th>
                        ${selectionHead}
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>`;
    }

    /**
     * The square ring box: the ring's diameter plus the reach of its tick icons, a third
     * of the card's height but no smaller than the grid's smallest ring, and never wider
     * than the card (which wins in a card narrower than that minimum), with the ring text
     * at the size a grid ring of that diameter gets.
     * @param {d3.Selection<HTMLDivElement, unknown, any, any>} container
     * @param {RingFigures} figures
     * @param {number|null} pilotRate - The items' mean Pilotierung, 0–100.
     */
    #renderRingBox(container, figures, pilotRate) {
        const { containerWidth, containerHeight } = this.measuredDimensions();
        const size = Math.min(
            Math.max(
                RING_SIZE_MIN_PX * RING_REACH,
                containerHeight * ITEM_RING_FOCUS_CONFIG.RING_BOX_HEIGHT_RATIO,
            ),
            containerWidth,
        );
        const diameter = size / RING_REACH;
        const box = /** @type {HTMLDivElement} */ (container.node());
        box.style.setProperty('--ring-fs', `${getItemRingFontSizeForRing(diameter)}px`);
        const svg = this.createSVGElement(size, size, { parent: box }).attr(
            'class',
            'item-ring-focus-svg',
        );
        const ringGroup = selectOrAppend(svg, 'g', 'item-ring-figure').attr(
            'transform',
            `translate(${size / 2}, ${size / 2})`,
        );
        drawItemRing(ringGroup, diameter / 2, {
            ...figures,
            pilotFrequency: pilotRate,
            // The detail card has the room for it, so the level ring is never hidden here.
            innerRingVisible: true,
            durationMs: this.drawDurationMs,
            chartInstance: this,
        });
    }

    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================

    /**
     * Why the card draws no ring, as a glossary key below `ma.item.item-ring-focus`, or
     * `null` when it draws one. Students are read only for a selection (its tick and
     * tooltip); the group ring draws from the items alone.
     * @returns {string|null}
     */
    #emptyReason() {
        if (!this.state.ring.value) return 'messages.no-rings';
        if (this.state.items.value.length === 0) return 'messages.no-items';
        if (this.state.selectedStudents.value?.length && !this.students?.length) {
            return 'messages.no-selection-results';
        }
        return null;
    }
}

/**
 * One text block: a title, then a list of lines or the empty text, then a note behind an
 * info icon.
 * @param {{title: string, emptyText: string, lines: string[], note: string}} block
 * @returns {import('lit').TemplateResult}
 */
function textBlockTemplate({ title, emptyText, lines, note }) {
    const heading = html`<h4>${title}</h4>`;
    const items = lines.map(
        (line) => html`<li class="item-ring-focus-text-block-list-item">${line}</li>`,
    );
    const body =
        lines.length === 0
            ? html`<div class="empty-message">${emptyText}</div>`
            : html`<ul class="item-ring-focus-text-block-list">
                  ${items}
              </ul>`;
    const noteLine = html`<p class="item-ring-focus-text-block-note">
        ${createIcon('info')} ${note}
    </p>`;
    return html`<div class="item-ring-focus-text-block">${heading}${body}${noteLine}</div>`;
}

export { ItemRingFocusChart };

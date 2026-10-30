/**
 * The results and solver lists of the items it is handed, one tab per item. The ids
 * arrive through `onItemSelected`; the records are resolved from
 * `en.itemRecordsById` at render time.
 */

import { ContentModule, handleTabKeydown, sameItems, trusted } from '@tba3/module-base';
import { html, nothing, render } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { EN_DATASETS } from '../../enDatasets.js';
import { getRecordsByIds } from '../../../common/data/datasetIndex.js';
import { withDomainPrefix } from '../../utils/enDomainPrefix.js';
import { resolveActiveId } from './enItemDetailSelection.js';
import { sortStudentsByName } from '../../../common/domain/studentIdentity.js';
import { toPercent } from '../../../common/domain/itemResultCounts.js';
import { resultSectionTemplate } from '../../../common/utils/resultRows.js';
import { studentGroupListTemplate } from '../../../common/utils/studentGroupList.js';
import './enItemDetailModule.css';

/** The student groups of the gelöst / nicht gelöst toggle. */
const SOLVER_SET = Object.freeze({ SOLVED: 'solved', UNSOLVED: 'unsolved' });

/** @typedef {import('../../utils/enItemDataAdapter.js').EnItemRecord} EnItemRecord */
/** @typedef {import('../../utils/enItemDataAdapter.js').ItemStudent} ItemStudent */
/** @typedef {import('../../utils/enItemDataAdapter.js').ItemNonSolver} ItemNonSolver */

/**
 * The items to show, by id.
 * @typedef {object} ItemSelection
 * @property {string[]} [itemIds] - Selected item ids, in selection order (empty to clear)
 */

/**
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *     context: import('../../../common/context/moduleContext.js').ModuleContext,
 *     onStudentSelected?: (studentId: string) => void,
 * }} EnItemDetailOptions
 */

/** @augments {ContentModule<EnItemDetailOptions>} */
export class EnItemDetailModule extends ContentModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [EN_DATASETS.ITEM_RECORDS_BY_ID];

    /** @type {EnItemRecord|null} The active item's record, resolved on render. */
    #selectedItem = null;
    /** @type {EnItemRecord[]} The selected set's records, resolved on render. */
    #items = [];
    /** @type {string[]} The selected set, in selection order. */
    #itemIds = [];
    /** @type {string|null} iqbId of the active item. */
    #activeId = null;
    /** @type {string|null} The student group shown (`SOLVER_SET`); `null` follows the per-item default. */
    #solverSet = null;

    /** @override */
    _setup() {
        super._setup();
        this.classList.add('item-detail-panel');
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Show the selected item(s).
     * @param {ItemSelection} payload
     */
    async onItemSelected(payload) {
        const itemIds = payload?.itemIds ?? [];
        // A table sort reports the selection it already showed.
        if (itemIds.length > 0 && sameItems(itemIds, this.#itemIds)) return;

        // The table reports [] on every sort and filter change; empty stays empty.
        if (itemIds.length === 0 && this.#itemIds.length === 0) {
            this.#activeId = null;
            return;
        }

        this.#applySelection(itemIds, resolveActiveId(this.#itemIds, itemIds, this.#activeId));

        await this.refreshContent();
    }

    /**
     * @override
     * @returns {'visual'|null} `'visual'` while an item shows.
     */
    _getExportType() {
        // The empty message is not exported. #selectedItem is the rendered item, so
        // it also guarantees #activeId.
        return this.#selectedItem ? 'visual' : null;
    }

    /**
     * Per item, not per module: one instance shows every selected item in turn,
     * so a module-wide id would make a tick on item A carry over to item B and
     * let B's capture overwrite A's.
     * @override
     */
    getExportIdentity() {
        return this.#activeId;
    }

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        // Resolved here, after the base ensured the dataset, so the ids can arrive before
        // the documents have landed.
        this.#items = getRecordsByIds(
            this.options.context.documents,
            EN_DATASETS.ITEM_RECORDS_BY_ID,
            this.#itemIds,
        );
        this.#selectedItem = this.#items.find((item) => item.iqbId === this.#activeId) ?? null;

        // The empty-state sentence is the entry's body (en.item.item-details,
        // en.student.item-details) — glossary copy, not an option.
        const { glossary } = this.options.context;
        const details = this.#selectedItem
            ? this.#detailsTemplate(this.#selectedItem)
            : trusted(
                  glossary.annotateHTML(`<p class="empty-message">${this.glossaryBody ?? ''}</p>`),
              );

        // The content is the tab strip's one panel, but only while the strip exists —
        // a lone item has no tab to name it, and `aria-labelledby` must resolve.
        const hasTabs = this.#hasTabs();
        render(
            html`<div
                class="item-detail-content"
                id=${this.#panelId}
                role=${hasTabs ? 'tabpanel' : nothing}
                aria-labelledby=${hasTabs ? this.#tabId(this.#activeId) : nothing}
            >
                ${details}
            </div>`,
            this.contentContainer,
        );

        this.setSubtitle(this.#tabsTemplate());
    }

    /**
     * The tab strip — one tab per selected item, labelled by its domain-prefixed item
     * number (`H-01`, whatever the table's mode), with the full exercise name as a tooltip.
     * None below 2 items, so the subtitle slot stays hidden.
     * @returns {import('lit').TemplateResult|null}
     */
    #tabsTemplate() {
        if (!this.#hasTabs()) return null;

        const tabs = repeat(
            this.#items,
            (item) => item.iqbId,
            (item) => {
                const label = withDomainPrefix(item.name, item.domainLabel);
                const selected = item.iqbId === this.#activeId;
                return html`<button
                    type="button"
                    class="tab-strip-tab item-detail-tab"
                    role="tab"
                    id=${this.#tabId(item.iqbId)}
                    aria-controls=${this.#panelId}
                    aria-selected=${String(selected)}
                    tabindex=${selected ? '0' : '-1'}
                    data-item-id=${item.iqbId}
                    data-tooltip-text=${item.exerciseName}
                    @click=${this.#onTabClick}
                >
                    ${label}
                </button>`;
            },
        );
        const label = this.options.context.glossary.getRequiredEntryText(
            'en.item-detail.detail-tabs.label',
        );
        return html`<div
            class="tab-strip"
            role="tablist"
            aria-label=${label}
            @keydown=${this.#onTabKeydown}
        >
            ${tabs}
        </div>`;
    }

    /** @param {MouseEvent} event - A click on an item's tab. */
    #onTabClick = (event) => {
        this.#activateItem(
            /** @type {HTMLElement} */ (event.currentTarget).getAttribute('data-item-id'),
        );
    };

    /** @param {KeyboardEvent} event - A key on the tab strip. */
    #onTabKeydown = (event) => {
        handleTabKeydown(event, (tab) => this.#activateItem(tab.getAttribute('data-item-id')));
    };

    /** @returns {boolean} Whether the strip renders — one item needs no tabs. */
    #hasTabs() {
        return this.#items.length >= 2;
    }

    /** @returns {string} Element id of the panel the tabs control. */
    get #panelId() {
        return `${this.id}-item-detail-panel`;
    }

    /**
     * @param {string | null} itemId
     * @returns {string} That tab's element id.
     */
    #tabId(itemId) {
        return `${this.id}-item-detail-tab-${itemId ?? ''}`;
    }

    /**
     * Show another of the selected items.
     * @param {string|null} id - The item's iqbId.
     */
    #activateItem(id) {
        if (!id || id === this.#activeId) return;
        this.#applySelection(this.#itemIds, id);
        this.refreshContent().catch((error) => {
            console.error(`EnItemDetailModule[${this.id}]: switching the item failed`, error);
        });
    }

    /**
     * Switch the visible student group and re-render.
     * @param {string} group - A `SOLVER_SET` value.
     */
    #selectStudentGroup(group) {
        if (group === this.#solverSet) return;
        this.#solverSet = group;
        this.refreshContent().catch((error) => {
            console.error(`EnItemDetailModule[${this.id}]: switching the group failed`, error);
        });
    }

    /**
     * Apply a resolved selection: item ids and active id; the records follow on render.
     * A change of the active item resets the student-group toggle, because the default
     * group is per item; the same active item again (a repeated row click) keeps the
     * user's choice.
     * @param {string[]} itemIds
     * @param {string|null} nextActiveId
     */
    #applySelection(itemIds, nextActiveId) {
        if (nextActiveId !== this.#activeId) {
            this.#solverSet = null;
        }
        this.#activeId = nextActiveId;
        this.#itemIds = itemIds;
    }

    /**
     * The details of one item: the line that names it, its results and its students.
     * @param {EnItemRecord} item
     * @returns {import('lit').TemplateResult}
     */
    #detailsTemplate(item) {
        const { glossary } = this.options.context;
        const number = withDomainPrefix(item.name, item.domainLabel);
        // The task's title is English: read in English (WCAG 3.1.2).
        const heading = html`${number} – <span lang="en">${item.exerciseName}</span>`;
        const results = resultSectionTemplate(glossary, {
            rate: item.percentageCorrect,
            correct: item.correctCount,
            incorrect: item.incorrectCount,
            notAttempted: item.notAttemptedCount,
            total: item.total,
            totalUnit: 'students',
            pilotRate:
                item.pilotSolutionFrequency === null
                    ? null
                    : toPercent(item.pilotSolutionFrequency),
            pilotDiffPP: item.pilotSolutionFrequencyDiff,
        });
        return html`<h3 class="detail-heading">${heading}</h3>
            ${results} ${this.#studentsTemplate(item)}`;
    }

    /**
     * The gelöst / nicht gelöst toggle and the active group's names. The active group
     * defaults to the smaller one until the user picks one for this item.
     * @param {EnItemRecord} item
     * @returns {import('lit').TemplateResult}
     */
    #studentsTemplate({ solvers, nonSolvers }) {
        const text = this.#text;
        /**
         * @param {Array<ItemStudent & {attempted?: boolean}>} students
         * @returns {import('../../../common/utils/studentGroupList.js').StudentGroupMember[]}
         */
        const members = (students) =>
            sortStudentsByName(students).map((student) => ({
                student,
                flagged: student.attempted === false,
            }));
        return studentGroupListTemplate(this.options.context.glossary, {
            groups: [
                {
                    id: SOLVER_SET.SOLVED,
                    label: text('interface.solved-group.label'),
                    heading: text('messages.solved-heading'),
                    emptyText: text('messages.none-solved'),
                    members: members(solvers),
                },
                {
                    id: SOLVER_SET.UNSOLVED,
                    label: text('interface.unsolved-group.label'),
                    heading: text('messages.unsolved-heading'),
                    emptyText: text('messages.all-solved'),
                    members: members(nonSolvers),
                },
            ],
            // No student aggregation for this item.
            noDataText: text('messages.no-student-data'),
            flag: text('messages.not-attempted-flag'),
            activeId: this.#solverSet,
            onGroup: (group) => this.#selectStudentGroup(group),
            onStudent: (studentId) => this.options.onStudentSelected?.(studentId),
        });
    }

    /**
     * One of the panel's own texts (enItemDetail.glossary.json).
     * @param {string} path - The text's path below `en.item-detail`.
     * @returns {string} The text, or the missing-entry marker.
     */
    #text = (path) => this.options.context.glossary.getRequiredEntryText(`en.item-detail.${path}`);
}

customElements.define('tba-en-item-detail', EnItemDetailModule);

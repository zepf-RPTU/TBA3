/**
 * EnItemDetailModule - Display detailed information about selected item
 * Shows item metadata and performance details
 *
 * The owning view calls `onItemSelected(payload)` from its table's callback.
 */

import { ContentModule } from '@tba3/module-base/modules/contentModule.js';
import { EN_TERMS } from '../../enTerms.js';
import { escapeHtml } from '@tba3/module-base/utils/escapeHtml.js';
import { createGerLevelHtml } from '../../../common/domain/levels.js';
import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary/glossaryText.js';
import { targetEl } from '@tba3/module-base/utils/domBuilder.js';
import { withDomainPrefix } from '../../utils/enDomainPrefix.js';
import { tabAttributes, handleTabKeydown } from '@tba3/module-base/utils/tabStrip.js';
import {
    resolveActiveId,
    resolveDefaultStudentGroup,
    sortStudentsByName,
    STUDENT_GROUP,
} from './enItemDetailSelection.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import './enItemDetailModule.css';

/**
 * EnItemDetailModule - Reusable item detail display component for EN
 * Displays detailed information about a selected item/task
 * @augments ContentModule
 */
export class EnItemDetailModule extends ContentModule {
    /** @type {{[key: string]: any}|null} */
    #selectedItem = null; // The currently active item (resolved from #items + #activeId)
    /** @type {Array<{[key: string]: any}>} */
    #items = []; // The full selected set (one tab per item when >= 2)
    /** @type {string|null} */
    #activeId = null; // iqbId of the active item
    /** @type {string} */
    #mode = 'all'; // Table mode — drives the domain prefix on tab labels
    /** @type {'solved'|'unsolved'|null} */
    #studentGroup = null; // null = follow the adaptive default for the active item
    #tabsListenerAttached = false; // Guard so the delegated tab click listener attaches once
    #contentListenerAttached = false; // Guard so the delegated body click listener attaches once

    // ========================================================================
    // PUBLIC API (called by the owning view)
    // ========================================================================

    /**
     * Show the selected item(s).
     * Accepts either the multi-select shape `{ items, mode }` (Item View) or the
     * single-item shape `{ item }` (Student View / task-mode clicks).
     * @param {object} payload - Event payload
     * @param {Array<object>} [payload.items] - Selected item set (Item View)
     * @param {object} [payload.item] - Single selected item (single-select contexts)
     * @param {string} [payload.mode] - Current table mode (for the domain-prefixed tab label)
     */
    async onItemSelected(payload) {
        const items = Array.isArray(payload?.items)
            ? payload.items
            : payload?.item
              ? [payload.item]
              : [];

        if (payload?.mode !== undefined) {
            this.#mode = payload.mode;
        }

        // Skip the redundant empty re-render when nothing is (or was) selected —
        // dataFiltered publishes [] on every header-filter keystroke. With no
        // items there are no tabs, so mode can't affect the already-empty output.
        if (items.length === 0 && this.#items.length === 0) {
            this.#activeId = null;
            return;
        }

        this.#applySelection(items, resolveActiveId(this.#items, items, this.#activeId));

        await this.render();
    }

    /**
     * Initialize the module
     * @override
     * @param {object} data - Initialization data
     * @returns {Promise<void>}
     */
    async init(data = {}) {
        if (this.initialized) {
            console.debug(`EnItemDetailModule[${this.id}]: Already initialized`);
            return;
        }

        await super.init(data);
    }

    /**
     * Default assignId to true (extends ContentModule directly).
     * @override
     */
    validateContainer({ assignId = true } = {}) {
        return super.validateContainer({ assignId });
    }

    /**
     * Re-render on a KS color-theme switch. The Niveaustufe badge is HTML with the
     * band color stamped inline as `--ks-band-color` (`createGerLevelHtml`), so —
     * unlike a chart or a table cell — it would keep the old palette until the next
     * item selection.
     * @override
     */
    onThemeChanged() {
        if (this.initialized && this.#selectedItem) {
            void this.render().catch((error) =>
                console.error(`EnItemDetailModule[${this.id}]: theme refresh failed:`, error),
            );
        }
        super.onThemeChanged();
    }

    /** @override */
    getExportControlDefinition() {
        // Nothing selected — the panel only shows the empty message, which is
        // not worth exporting (same rule as InfoBoxModule / ChartHostModule).
        // #selectedItem is the rendered item, so it also guarantees #activeId.
        if (!this.#selectedItem) {
            return null;
        }

        return this._buildExportControlDefinition('item-detail');
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
     * Render the item detail module
     * @override
     * @returns {Promise<void>}
     */
    async _doRenderContent() {
        // The empty-state sentence is the entry's body (en.item.item-details,
        // en.student.item-details) — glossary copy, not an option.
        const emptyMessage = this.glossaryBody ?? '';

        const container = this.container;
        if (!container) return;
        container.classList.add('item-detail-panel', 'layout-stack');

        const constructionNoticeHtml = `
            <div class="help-notice notice-callout layout-row" role="note" aria-label="${glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.region-hint.label')}">
                <span class="help-notice-icon notice-callout-icon" aria-hidden="true">
                    ${iconSvg('warning')}
                </span>
                <p class="help-notice-message notice-callout-message">Dieser Teil der Rückmeldung ist vorerst nur ein Platzhalter und befindet sich in Bearbeitung.</p>
            </div>
        `;
        const detailHtml = this.#selectedItem
            ? this.renderItemDetails()
            : `<p class="empty-message">${emptyMessage}</p>`;

        // Render content into contentContainer (title is handled by ContentModule wrapper)
        // The content is the tab strip's one panel, but only while the strip exists —
        // a lone item has no tab to name it, and `aria-labelledby` must resolve.
        const panelAria = this.#hasTabs()
            ? `role="tabpanel" aria-labelledby="${this.#tabId(this.#activeId)}"`
            : '';
        this.contentContainer.innerHTML = `
            <div class="item-detail-content" id="${this.#panelId}" ${panelAria}>
                ${constructionNoticeHtml}
                ${glossaryAnnotator.annotateHTML(detailHtml)}
            </div>
        `;

        // Render the per-item tab strip into the subtitle slot (only when >= 2 selected).
        this.setSubtitle(this.#renderTabsHtml());
        this.#ensureTabsListener();
        this.#ensureContentListener();
    }

    /**
     * Build the tab strip HTML — one tab per selected item, labelled by item
     * number (domain-prefixed in 'all' mode), with the full exercise name as a
     * tooltip. Returns '' below 2 items so the subtitle slot stays hidden.
     * @returns {string} HTML string
     */
    #renderTabsHtml() {
        if (!this.#hasTabs()) return '';

        const tabs = this.#items
            .map((item) => {
                const nr = String(item.name ?? '');
                const label = this.#mode === 'all' ? withDomainPrefix(nr, item.domainLabel) : nr;
                const fullName = item.exercise?.name ?? '';
                const aria = tabAttributes({
                    id: this.#tabId(item.iqbId),
                    panelId: this.#panelId,
                    selected: item.iqbId === this.#activeId,
                });
                return `<button type="button" class="tab-strip-tab item-detail-tab" ${aria} data-item-id="${escapeHtml(item.iqbId)}" title="${escapeHtml(fullName)}">${escapeHtml(label)}</button>`;
            })
            .join('');

        return `<div class="tab-strip item-detail-tabs" role="tablist" aria-label="${glossaryAnnotator.getRequiredEntryText('en.item-detail.detail-tabs.label')}">${tabs}</div>`;
    }

    /** @returns {boolean} Whether the strip renders — one item needs no tabs. */
    #hasTabs() {
        return this.#items.length >= 2;
    }

    /** @returns {string} Element id of the panel the tabs control. */
    get #panelId() {
        return `${this.id}-item-detail-panel`;
    }

    /**
     * The id is interpolated into markup, and `iqbId` is payload text — escaped here
     * rather than at each of the three interpolations, so the id in the `id=`
     * attribute and the one `aria-labelledby` points at stay the same string.
     * @param {string | null} itemId - The item the tab stands for.
     * @returns {string} That tab's element id.
     */
    #tabId(itemId) {
        return `${this.id}-item-detail-tab-${escapeHtml(String(itemId ?? ''))}`;
    }

    /**
     * Attach a single delegated click listener to the subtitle so tab clicks
     * switch the active item. Idempotent — survives subtitle innerHTML updates.
     */
    #ensureTabsListener() {
        if (this.#tabsListenerAttached) return;
        const subtitleEl = this.subtitleElement;
        if (!subtitleEl) return;
        this.resources.trackDomListener(subtitleEl, 'click', (e) => this.#onTabClick(e));
        this.resources.trackDomListener(subtitleEl, 'keydown', (e) =>
            handleTabKeydown(/** @type {KeyboardEvent} */ (e), (tab) => {
                const id = tab.getAttribute('data-item-id');
                if (id && id !== this.#activeId) {
                    this.#applySelection(this.#items, id);
                    this.render();
                }
            }),
        );
        this.#tabsListenerAttached = true;
    }

    /**
     * Switch the active item when a tab is clicked.
     * @param {Event} e - Click event
     */
    #onTabClick(e) {
        const btn = targetEl(e)?.closest('.item-detail-tab');
        const id = btn?.getAttribute('data-item-id');
        if (!id || id === this.#activeId) return;

        this.#applySelection(this.#items, id);
        this.render();
    }

    /**
     * Attach a single delegated click listener to the content body so the
     * student-group toggle and the student names survive the wholesale innerHTML
     * re-render. Idempotent — ContentModule builds the body element once.
     */
    #ensureContentListener() {
        if (this.#contentListenerAttached) return;
        const contentEl = this.contentContainer;
        if (!contentEl) return;
        this.resources.trackDomListener(contentEl, 'click', (e) => this.#onContentClick(e));
        this.#contentListenerAttached = true;
    }

    /**
     * Route clicks inside the detail body: student-group toggle, or navigation to
     * a student.
     * @param {Event} e - Click event
     */
    #onContentClick(e) {
        const target = targetEl(e);

        const groupBtn = target?.closest('.item-detail-group-button');
        if (groupBtn) {
            void this.#selectStudentGroup(groupBtn.getAttribute('data-group'));
            return;
        }

        const studentId = target?.closest('.detail-student-name')?.getAttribute('data-student-id');
        if (studentId) {
            // The item view's callback selects the student and navigates to the
            // Student view; the Student view's own switches the student in place.
            this.getOption('onStudentSelected')?.(studentId);
        }
    }

    /**
     * Switch the visible student group and re-render. Focus is restored to the
     * clicked toggle because the render replaces the whole body.
     * @param {string|null} group - Group id from the button's data-group attribute
     * @returns {Promise<void>}
     */
    async #selectStudentGroup(group) {
        if (group !== STUDENT_GROUP.SOLVED && group !== STUDENT_GROUP.UNSOLVED) return;
        if (group === this.#studentGroup) return;

        this.#studentGroup = group;
        await this.render();

        const restored = /** @type {HTMLElement|null} */ (
            this.contentContainer?.querySelector(`.item-detail-group-button[data-group="${group}"]`)
        );
        restored?.focus();
    }

    /**
     * Apply a resolved selection: item set, active id, and the matching record.
     * Resets the student-group toggle whenever the active item changes, because
     * the default group is per-item (the smaller of that item's two lists) — a
     * sticky override would silently contradict the item just switched to. A
     * re-publish of the same active item (the Item view republishes on every
     * header-filter keystroke) keeps the user's choice.
     * @param {Array<{[key: string]: any}>} items - Selected item set
     * @param {string|null} nextActiveId - Resolved active iqbId
     */
    #applySelection(items, nextActiveId) {
        if (nextActiveId !== this.#activeId) {
            this.#studentGroup = null;
        }
        this.#activeId = nextActiveId;
        this.#items = items;
        this.#selectedItem = items.find((i) => i.iqbId === nextActiveId) ?? null;
    }

    /**
     * Render the details of the selected item
     * @private
     * @returns {string} HTML string
     */
    renderItemDetails() {
        if (!this.#selectedItem) {
            return '';
        }

        const {
            name: itemName = 'N/A',
            domainLabel = 'N/A',
            competenceLevel = 'N/A',
            correctCount = 0,
            incorrectCount = 0,
            notAttemptedCount = 0,
            solvers = [],
            nonSolvers = [],
        } = this.#selectedItem;
        const exerciseName = this.#selectedItem.exercise?.name ?? 'N/A';

        // Calculate statistics
        const totalStudents = correctCount + incorrectCount + notAttemptedCount;
        const successRate =
            totalStudents > 0 ? ((correctCount / totalStudents) * 100).toFixed(1) : 0;

        return `
            <div class="detail-section">
                <h4>Aufgabe</h4>
                <div class="detail-row">
                    <span class="detail-label">Nummer:</span>
                    <span class="detail-value">${escapeHtml(itemName)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Bezeichnung:</span>
                    <span class="detail-value">${escapeHtml(exerciseName)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Domäne:</span>
                    <span class="detail-value">${escapeHtml(domainLabel)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">${EN_TERMS.ITEM_LEVEL}:</span>
                    <span class="detail-value">${competenceLevel ? createGerLevelHtml(competenceLevel, 'span', 'ger-text') : 'N/A'}</span>
                </div>
            </div>

            <div class="detail-section">
                <h4>Leistung</h4>
                <div class="detail-row">
                    <span class="detail-label">Erfolgsquote:</span>
                    <span class="detail-value highlight">${successRate}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Richtig gelöst:</span>
                    <span class="detail-value success">${correctCount}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Nicht gelöst:</span>
                    <span class="detail-value error">${incorrectCount}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Nicht bearbeitet:</span>
                    <span class="detail-value">${notAttemptedCount}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Gesamt ${EN_TERMS.STUDENTS}:</span>
                    <span class="detail-value">${totalStudents}</span>
                </div>
            </div>

            ${this.#renderStudentsHtml(solvers, nonSolvers)}
        `;
    }

    /**
     * Render the student-group section: the gelöst / nicht gelöst toggle plus the
     * grid of names for the active group. The active group defaults to the
     * smaller of the two lists until the user picks one for this item.
     * @param {Array<{[key: string]: any}>} solvers - Students coded "Richtig"
     * @param {Array<{[key: string]: any}>} nonSolvers - Students coded "Falsch"/"Unbearbeitet"
     * @returns {string} HTML string
     */
    #renderStudentsHtml(solvers, nonSolvers) {
        const activeGroup =
            this.#studentGroup ?? resolveDefaultStudentGroup(solvers.length, nonSolvers.length);
        const isSolved = activeGroup === STUDENT_GROUP.SOLVED;
        const students = sortStudentsByName(isSolved ? solvers : nonSolvers);
        const heading = isSolved
            ? `${EN_TERMS.STUDENTS}, die diese Aufgabe gelöst haben`
            : `${EN_TERMS.STUDENTS}, die diese Aufgabe nicht gelöst haben`;
        // "Alle … gelöst" is only true when there actually are solvers — with both
        // groups empty (no student aggregation for this item) it would contradict
        // the "gelöst (0)" toggle label right above it.
        const emptyMessageKey = isSolved
            ? 'none-solved'
            : solvers.length > 0
              ? 'all-solved'
              : 'no-student-data';
        // The entries name the group as `{{Lernende}}`; getRequiredEntryText does not
        // substitute tokens, so the term is filled in here from the one spelling in
        // TERM_CONSTANTS.
        const emptyMessage = applyTemplateTokens(
            glossaryAnnotator.getRequiredEntryText(`en.item-detail.messages.${emptyMessageKey}`),
            { Lernende: EN_TERMS.STUDENTS },
        );
        const hasNotAttempted = !isSolved && students.some((s) => s.attempted === false);

        return `
            <div class="detail-section">
                <h4>${heading}</h4>
                <div class="btn-group btn-group--segmented item-detail-group-toggle" role="group" aria-label="${glossaryAnnotator.getRequiredEntryText('en.item-detail.group-toggle.label')}">
                    ${this.#renderGroupButtonHtml(STUDENT_GROUP.SOLVED, 'gelöst', solvers.length, isSolved)}
                    ${this.#renderGroupButtonHtml(STUDENT_GROUP.UNSOLVED, 'nicht gelöst', nonSolvers.length, !isSolved)}
                </div>
                ${
                    students.length > 0
                        ? `
                    <ul class="detail-student-grid">
                        ${students.map((s) => this.#renderStudentHtml(s)).join('')}
                    </ul>
                    ${hasNotAttempted ? '<p class="detail-student-legend">* nicht bearbeitet</p>' : ''}
                `
                        : `<p class="empty-message">${emptyMessage}</p>`
                }
            </div>
        `;
    }

    /**
     * Render one button of the student-group toggle.
     * @param {string} group - Group id ('solved' | 'unsolved')
     * @param {string} label - Button label
     * @param {number} count - Number of students in that group
     * @param {boolean} isActive - Whether this group is the one on display
     * @returns {string} HTML string
     */
    #renderGroupButtonHtml(group, label, count, isActive) {
        return `<button type="button" class="btn btn--text item-detail-group-button${isActive ? ' is-active' : ''}" data-group="${group}" aria-pressed="${isActive}">${label} (${count})</button>`;
    }

    /**
     * Render one clickable student name. Clicking it fires `onStudentSelected`,
     * which takes the user to the Student view with that student selected.
     * @param {{[key: string]: any}} student - {studentId, firstName, lastName, attempted?}
     * @returns {string} HTML string
     */
    #renderStudentHtml(student) {
        // Empty id rather than the literal "undefined": #onContentClick then skips
        // the navigation instead of publishing a student id that matches nobody.
        const studentId = student.studentId ?? '';
        const name = [student.lastName, student.firstName].filter(Boolean).join(', ') || studentId;
        const notAttempted = student.attempted === false;
        const ariaLabel = `${name}${notAttempted ? ' (nicht bearbeitet)' : ''} – zur Ansicht dieser Person`;

        return `<li><button type="button" class="detail-student-name interactive-subtle${notAttempted ? ' is-not-attempted' : ''}" data-student-id="${escapeHtml(studentId)}" aria-label="${escapeHtml(ariaLabel)}"><span>${escapeHtml(name)}</span>${notAttempted ? '<span class="detail-student-name-flag" aria-hidden="true">*</span>' : ''}</button></li>`;
    }
}

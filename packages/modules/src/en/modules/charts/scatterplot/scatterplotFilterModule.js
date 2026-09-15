/**
 * ScatterplotFilterModule - Modal module with scatterplot for selecting students
 * Allows users to click on student points to select/deselect them
 */

import { ContentModule } from '@tba3/module-base/modules/contentModule.js';
import { ChartHostModule } from '../../../../common/charts/host/chartHostModule.js';
import { scatterplotConfig } from './scatterplotConfig.js';
import { toScatterPoints } from './scatterPointAdapter.js';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';
import { openModalDialog } from '@tba3/module-base/utils/modalFocus.js';
import './scatterplotFilterModule.css';

/** Where this modal's own `interface` entries live (see enGlossary.js). */
const INTERFACE_PATH = 'en.class.scatterplot.interface';

/**
 * ScatterplotFilterModule - Modal for student selection via scatterplot
 * @augments ContentModule
 */
export class ScatterplotFilterModule extends ContentModule {
    /** @type {HTMLElement} */
    #overlay;
    /** @type {import('./scatterplotConfig.js').ScatterplotHost|null} */
    #scatterplotModule = null;
    #initialSelectedStudentIds = new Set();
    /** @type {(e: KeyboardEvent) => void} */
    #boundHandleEscapeKey;
    #escapeKeyListenerAttached = false;
    /** @type {(() => void) | null} Lifts the modal state opened by show(); null while closed. */
    #closeModal = null;
    #showInProgress = false;
    #showRequestId = 0;
    /** @type {HTMLButtonElement|null} */
    #armSelectionBtn = null;
    #touchSelectionArmed = false;

    /**
     * Creates a new ScatterplotFilterModule
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element (can be document.body)
     * @param {{[key: string]: any}} [options={}] - Configuration options (studentArray, selectedStudentIds, onConfirm, …)
     */
    constructor(id, container = document.body, options = {}) {
        // Merge module defaults with caller options BEFORE super so that
        // BaseModule constructor picks up glossaryKey/glossaryData into
        // its private fields (required for loadInfoFromGlossary).
        const mergedOptions = {
            showModuleTitle: true,
            showSubtitle: true,
            glossaryKey: 'en.class.scatterplot',
            // The instructions are the entry's glossary subtitle; only the live counter is
            // dynamic markup and stays here, appended after the copy.
            subtitle: '<span class="scatterplot-selection-count">0 ausgewählt</span>',
            studentArray: [],
            selectedStudentIds: new Set(),
            ...options,
        };

        // Build overlay + modal scaffold before super() — no `this` access needed here.
        // The overlay is appended to the target container (document.body by default),
        // while the modal div becomes ContentModule's managed container, giving it
        // the title bar + content body structure.
        const overlay = document.createElement('div');
        overlay.className = 'modal-backdrop scatterplot-filter-overlay';
        overlay.id = `${id}-overlay`;

        const modal = document.createElement('div');
        modal.className = 'scatterplot-filter-modal';
        overlay.appendChild(modal);

        (container || document.body).appendChild(overlay);

        // ContentModule receives the modal div as its container
        super(id, modal, mergedOptions);

        // Store overlay reference; this.container === modal from here on
        this.#overlay = overlay;

        // Overlay background click dismisses the modal
        this.resources.trackDomListener(this.#overlay, 'click', (e) => {
            if (e.target === this.#overlay) this.#cancel();
        });

        // Escape key handler reference — created once, reused across show/hide cycles
        this.#boundHandleEscapeKey = (e) => this.#handleEscapeKey(e);

        this.#initialSelectedStudentIds = new Set(options.selectedStudentIds || []);

        if (options.onConfirm) this.registerCallback('confirm', options.onConfirm);
    }

    /**
     * Render the modal body content: chart area + sidebar action buttons.
     * The title bar and subtitle (instructions) are built by ContentModule before
     * this method is called.
     * @override
     * @param {object} data - Data payload
     * @returns {Promise<void>}
     */
    async _doRenderContent(data = {}) {
        this.setData(data);
        this.contentContainer.classList.add('scatterplot-filter-modal-body');

        // Body: chart area (left) + sidebar buttons (right)
        const body = document.createElement('div');
        body.className = 'scatterplot-filter-body';

        // Chart area — centers the square chart container
        const chartArea = document.createElement('div');
        chartArea.className = 'scatterplot-filter-chart-area';

        const chartContainer = document.createElement('div');
        chartContainer.className = 'scatterplot-filter-chart';
        chartContainer.id = `${this.id}-chart-container`;
        chartArea.appendChild(chartContainer);

        // Sidebar buttons
        const sidebar = document.createElement('div');
        sidebar.className = 'btn-stack scatterplot-filter-sidebar';

        const selectAllBtn = this.#createSidebarButton('select-all', () => this.#selectAll());

        const clearBtn = this.#createSidebarButton('clear-selection', () => this.#clearSelection());

        this.#armSelectionBtn = this.#createSidebarButton('arm-selection', () =>
            this.#toggleTouchSelection(),
        );
        this.#armSelectionBtn.setAttribute('aria-pressed', 'false');

        const cancelBtn = this.#createSidebarButton('cancel', () => this.#cancel());

        const confirmBtn = this.#createSidebarButton('confirm', () => this.#confirm());
        confirmBtn.classList.add('btn--primary', 'confirm-btn');

        sidebar.appendChild(selectAllBtn);
        sidebar.appendChild(clearBtn);
        sidebar.appendChild(this.#armSelectionBtn);
        sidebar.appendChild(confirmBtn);
        sidebar.appendChild(cancelBtn);

        body.appendChild(chartArea);
        body.appendChild(sidebar);

        this.contentContainer.appendChild(body);

        this.element = this.#overlay;
    }

    /**
     * Handle escape key press
     * @param {KeyboardEvent} event - The keydown that may close the modal.
     */
    #handleEscapeKey(event) {
        if (event.key === 'Escape') {
            this.#cancel();
        }
    }

    /**
     * Show the modal
     * @public
     * @returns {Promise<void>}
     */
    async show() {
        // Initialize on first open — loads glossary and renders ContentModule title bar
        if (!this.initialized) {
            await this.init();
        }

        const alreadyVisible = this.#overlay.classList.contains('visible');
        if (alreadyVisible && (this.#scatterplotModule || this.#showInProgress)) {
            this.#updateSelectionCount();
            return;
        }

        const showRequestId = ++this.#showRequestId;
        this.#showInProgress = true;

        // Show overlay
        this.#overlay.classList.add('visible');
        if (!this.#escapeKeyListenerAttached) {
            document.addEventListener('keydown', this.#boundHandleEscapeKey);
            this.#escapeKeyListenerAttached = true;
        }
        document.body.style.overflow = 'hidden';
        this.#closeModal ??= openModalDialog(this.#overlay, { label: 'Schüler:innen auswählen' });

        try {
            // Wait for the browser to complete layout so the chart container has
            // concrete dimensions before the Scatterplot renderer measures it.
            await this.waitForLayout();

            if (
                showRequestId !== this.#showRequestId ||
                this.destroyed ||
                !this.#overlay ||
                !this.#overlay.classList.contains('visible')
            ) {
                return;
            }

            // Initialize scatterplot after modal is visible and laid out
            await this.#initializeScatterplot(showRequestId);

            if (showRequestId !== this.#showRequestId || !this.#scatterplotModule) {
                return;
            }

            this.#updateSelectionCount();
        } finally {
            if (showRequestId === this.#showRequestId) {
                this.#showInProgress = false;
            }
        }
    }

    /**
     * Hide the modal
     * @public
     */
    hide() {
        if (!this.#overlay) return;

        this.#showRequestId += 1;
        this.#showInProgress = false;

        this.#overlay.classList.remove('visible');
        if (this.#escapeKeyListenerAttached) {
            document.removeEventListener('keydown', this.#boundHandleEscapeKey);
            this.#escapeKeyListenerAttached = false;
        }
        this.#closeModal?.();
        this.#closeModal = null;
        document.body.style.overflow = '';

        this.#destroyScatterplotModule();
    }

    #destroyScatterplotModule() {
        if (!this.#scatterplotModule) return;

        // Null out element before destroy so BaseModule.destroy() does not remove
        // the chart container div — that div is owned by this modal, not by the
        // scatterplot module.
        this.unregisterChildModule(this.#scatterplotModule);
        this.#scatterplotModule.element = null;
        this.#scatterplotModule.destroy();
        this.#scatterplotModule = null;
    }

    /**
     * A read-only view of the comparison state: the modal shows the same averages the
     * page does, but offers no ⌀ menu of its own — the control builds nothing without
     * `setActive`, so leaving it off is how the modal stays a view rather than a second
     * place to change what everything else shows.
     * @returns {object | null} The read-only state, or null when the host supplied none.
     */
    #readOnlyComparisonState() {
        const state = this.options.comparisonState;
        if (!state) return null;

        return {
            getActiveModes: () => state.getActiveModes(),
            isActive: (id) => state.isActive(id),
        };
    }

    /**
     * Initialize the scatterplot chart module
     * @param {number} [showRequestId] - The show request this initialization belongs to; a newer one supersedes it, so a late async step must not render into a modal that has since been reopened.
     */
    async #initializeScatterplot(showRequestId = this.#showRequestId) {
        const containerId = `${this.id}-chart-container`;
        const container = document.getElementById(containerId);
        if (!container) return;

        this.#destroyScatterplotModule();

        // Clear any stale chart DOM from the previous show/hide cycle
        container.innerHTML = '';

        const opts = this.options;
        const studentArray = opts.studentArray || [];

        // Use a mode-agnostic wrapper so the chart always operates in 'all' mode
        const filterComparisonState = this.#readOnlyComparisonState();
        const enConfig = this.getOption('enConfig');
        const styleAverages = this.getOption('styleAverages');

        // Create scatterplot module with selection enabled.
        // showModuleTitle: false — no heading needed for this nested chart-only module.
        // The constructor returns the bare host; `scatterplotConfig` binds its verbs onto
        // it at init. Naming the config's host type once here is what lets `tsc` check every
        // verb call below, instead of a cast per call.
        const scatterplotModule = /** @type {import('./scatterplotConfig.js').ScatterplotHost} */ (
            new ChartHostModule(containerId, container, scatterplotConfig, {
                ...this._childOptions(),
                showModuleTitle: false,
                enConfig,
                domainTitles: (() => {
                    const [d0, d1] = enConfig.domainIds;
                    return { [d0]: enConfig.domainLabels[0], [d1]: enConfig.domainLabels[1] };
                })(),
                startZoomed: true,
                comparisonState: filterComparisonState,
                enableSelection: true,
                selectedStudentIds: this.#initialSelectedStudentIds,
                onSelectionChanged: () => {
                    this.#updateSelectionCount();
                },
            })
        );
        this.#scatterplotModule = scatterplotModule;

        // Render the scatterplot with mode forced to 'all'
        await scatterplotModule.init({ studentArray, styleAverages });

        // The toggle is part of the modal and outlives the chart, which is built
        // fresh on every open — hand the flag back to the new renderer.
        scatterplotModule.setTouchSelectionArmed(this.#touchSelectionArmed);

        if (
            showRequestId !== this.#showRequestId ||
            this.destroyed ||
            !this.#overlay ||
            !this.#overlay.classList.contains('visible') ||
            this.#scatterplotModule !== scatterplotModule
        ) {
            if (this.#scatterplotModule === scatterplotModule) {
                this.#destroyScatterplotModule();
            }
            return;
        }

        this.registerChildModule(scatterplotModule);
    }

    /**
     * Get current selection from scatterplot module
     * @returns {Set} Selected student IDs
     */
    #getSelectedIds() {
        return this.#scatterplotModule?.getSelectedIds() || new Set();
    }

    /**
     * Build one sidebar button, labelled from the glossary like every other UI
     * string.
     * @param {string} controlId - Key under this modal's `interface` entry.
     * @param {() => void} onClick - What the button does.
     * @returns {HTMLButtonElement} The button, already wired.
     */
    #createSidebarButton(controlId, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn--text btn--size-control';
        button.dataset.scatterplotFilterAction = controlId;
        button.textContent = glossaryAnnotator.getRequiredEntryText(
            `${INTERFACE_PATH}.${controlId}.label`,
        );
        button.dataset.tooltipText = glossaryAnnotator.getRequiredEntryText(
            `${INTERFACE_PATH}.${controlId}.tooltip`,
        );
        this.resources.trackDomListener(button, 'click', onClick);
        return button;
    }

    /**
     * Flip touch marquee selection on or off. Only reachable on a touch device
     * (the button is hidden under `(hover: hover)`): a mouse can drag a marquee
     * without arming anything, but a finger's drag would otherwise scroll.
     */
    #toggleTouchSelection() {
        this.#touchSelectionArmed = !this.#touchSelectionArmed;
        this.#armSelectionBtn?.classList.toggle('is-active', this.#touchSelectionArmed);
        this.#armSelectionBtn?.setAttribute('aria-pressed', String(this.#touchSelectionArmed));
        this.#scatterplotModule?.setTouchSelectionArmed(this.#touchSelectionArmed);
    }

    /**
     * Update the selection count display
     */
    #updateSelectionCount() {
        const countElement = this.container?.querySelector('.scatterplot-selection-count');
        if (countElement) {
            const count = this.#getSelectedIds().size;
            countElement.textContent = `${count} ausgewählt`;
            countElement.classList.toggle('has-selection', count > 0);
        }
    }

    /**
     * Select every student the chart plots. A student without a usable percentage in a
     * domain draws no point, and selecting one anyway would filter the table to a row
     * no point on the chart stands for.
     */
    #selectAll() {
        const points = toScatterPoints(this.options.studentArray, this.getOption('enConfig'));
        this.#scatterplotModule?.setSelectedIds(new Set(points.map((p) => p.studentId)));
        this.#updateSelectionCount();
    }

    /**
     * Clear all selections
     */
    #clearSelection() {
        this.#scatterplotModule?.clearSelection();
        this.#updateSelectionCount();
    }

    /**
     * Confirm selection and close modal
     */
    #confirm() {
        // Get selected IDs BEFORE hiding (which clears the scatterplot module)
        const selectedIds = this.#getSelectedIds();
        this.hide();
        this.triggerCallback('confirm', selectedIds);
    }

    /**
     * Cancel and close the modal, leaving the selection as it was.
     */
    #cancel() {
        this.hide();
    }

    /**
     * Update module with new data
     * @override
     * @param {object} data - New data
     */
    async update(data) {
        if (data.studentArray) {
            this.setOptions({ studentArray: data.studentArray });
        }
        if (data.selectedStudentIds !== undefined) {
            this.#initialSelectedStudentIds = new Set(data.selectedStudentIds);
        }
    }

    /**
     * Destroy the modal
     * @override
     */
    async destroy() {
        this.hide();
        if (this.#overlay && this.#overlay.parentNode) {
            this.#overlay.parentNode.removeChild(this.#overlay);
        }
        await super.destroy();
    }
}

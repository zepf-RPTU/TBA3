/**
 * A modal that picks students by clicking or marquee-selecting their points on the
 * scatterplot; `onConfirm` receives the selected ids. The `<dialog>` shell is a composed
 * ModalDialog; this module is the panel inside it.
 */

import { ContentModule } from '@tba3/module-base';
import { signal } from '@preact/signals-core';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { html, nothing, render } from 'lit';
import { ChartHostModule } from '../../../../common/charts/host/chartHostModule.js';
import { ModalDialog } from '../../../../common/overlays/modalDialog.js';
import { formatCount } from '../../../../common/utils/numberFormat.js';
import { EN_DATASETS } from '../../../enDatasets.js';
import { enDomainListRuns } from '../../../utils/enDomainListRuns.js';
import { scatterplotConfig } from './scatterplotConfig.js';
import './scatterplotFilterModule.css';

/** Where this modal's own `interface` entries live (scatterplotFilter.glossary.json). */
const INTERFACE_PATH = 'en.group.scatterplot.interface';

const SIDEBAR_BUTTON_CLASS = 'btn btn--text btn--size-control';

/**
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *     context: import('../../../../common/context/moduleContext.js').ModuleContext,
 *     comparisonState?: import('../../../../common/charts/comparisonState.js').ComparisonStateReader | null,
 *     onConfirm?: (selectedIds: Set<string>) => void,
 * }} ScatterplotFilterOptions
 */

/** @augments {ContentModule<ScatterplotFilterOptions>} */
export class ScatterplotFilterModule extends ContentModule {
    /** @override */
    static defaultOptions = {
        showModuleTitle: true,
        showSubtitle: true,
        glossaryKey: 'en.group.scatterplot',
    };

    /**
     * The Domänen of the chart's `{{Domänen}}` title token.
     * @override
     * @type {import('../../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [EN_DATASETS.CONFIG];

    /** @type {ModalDialog|null} */
    #dialog = null;
    /** @type {import('./scatterplotConfig.js').ScatterplotHost|null} */
    #scatterplotModule = null;
    /** The students picked: the chart's selection, which it shares. */
    #selectedIds = signal(/** @type {ReadonlySet<string>} */ (new Set()));
    /** Whether a touch drag draws a marquee; it outlives the chart, built fresh on every open. */
    #touchSelectionArmed = signal(false);
    #showInProgress = false;
    #showRequestId = 0;

    /** @override */
    _setup() {
        super._setup();
        // A click, a marquee or a sidebar button: the count and the armed toggle follow.
        this.onChange(
            () => [this.#selectedIds.value, this.#touchSelectionArmed.value],
            () => this.#render(),
        );
    }

    /**
     * The `<dialog>`, built on the first open with this module as its panel; closing it
     * tears the chart down.
     * @returns {ModalDialog}
     */
    get #modal() {
        if (!this.#dialog) {
            this.#dialog = new ModalDialog({
                className: 'scatterplot-filter-overlay modal-dialog--centered',
                glossary: this.options.context.glossary,
                onClose: () => {
                    // A show still initializing is superseded; its chart goes with the modal.
                    this.#showRequestId += 1;
                    this.#showInProgress = false;
                    this.#scatterplotModule = null;
                    if (this.isConnected) this.#render();
                },
            });
            this.classList.add('modal-panel', 'scatterplot-filter-modal');
            this.#dialog.element.append(this);
        }
        return this.#dialog;
    }

    /**
     * The dialog's close button, in the title bar beside the title it closes. The
     * panel only connects inside the dialog, so the dialog exists by the first render.
     * @override
     * @returns {unknown}
     */
    _headerActions() {
        return this.#dialog?.closeButton ?? nothing;
    }

    /**
     * The title bar and subtitle (instructions) are the card shell's.
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        this.contentContainer.classList.add('scatterplot-filter-modal-body');
        this.#render();
    }

    /**
     * The body: the chart area (left), and a sidebar of two groups — the selection
     * helpers, then the live count with the commit pair it answers to. lit-html owns the
     * body, so the count and the armed state are re-rendered in place, and the chart host
     * is a node it keeps where it is.
     */
    #render() {
        const count = this.#selectedIds.value.size;
        const countText = applyTemplateTokens(this.#interfaceText('selection-count.label'), {
            count: formatCount(count),
        });
        const armed = this.#touchSelectionArmed.value;
        // The one mode whose effect is not in its label keeps its explanation.
        const arm = html`<button
            type="button"
            class=${armed ? `${SIDEBAR_BUTTON_CLASS} is-active` : SIDEBAR_BUTTON_CLASS}
            data-scatterplot-filter-action="arm-selection"
            aria-pressed=${String(armed)}
            data-tooltip-text=${this.#interfaceText('arm-selection.tooltip')}
            @click=${this.#toggleTouchSelection}
        >
            ${this.#interfaceText('arm-selection.label')}
        </button>`;
        const helpers = html`<div class="btn-stack">
            ${this.#sidebarButton('select-all', this.#selectAll)}
            ${this.#sidebarButton('clear-selection', this.#clearSelection)} ${arm}
        </div>`;
        const commit = html`<div class="btn-stack">
            <p
                class=${
                    count > 0
                        ? 'scatterplot-selection-count has-selection'
                        : 'scatterplot-selection-count'
                }
                role="status"
            >
                ${countText}
            </p>
            ${this.#sidebarButton('confirm', this.#confirm, ' btn--primary')}
            ${this.#sidebarButton('cancel', () => this.#close())}
        </div>`;
        render(
            html`<div class="scatterplot-filter-body">
                <div class="scatterplot-filter-chart-area">
                    ${this.#scatterplotModule ?? nothing}
                </div>
                <div class="scatterplot-filter-sidebar">${helpers}${commit}</div>
            </div>`,
            this.contentContainer,
        );
    }

    /**
     * Open the modal on the selection it starts from. A modal already open keeps the
     * selection it holds.
     * @param {Iterable<string>|null} [selectedStudentIds] - The students ticked on opening.
     * @returns {Promise<void>}
     */
    async open(selectedStudentIds) {
        const modal = this.#modal;
        if (modal.isOpen && (this.#scatterplotModule || this.#showInProgress)) return;
        this.#selectedIds.value = new Set(selectedStudentIds ?? []);

        const showRequestId = ++this.#showRequestId;
        this.#showInProgress = true;

        // The first open connects the panel, which renders its shell and body.
        // Named by its visible title.
        modal.show(
            this.options.context.glossary.getRequiredEntryText('en.group.scatterplot.title'),
        );

        try {
            await this.updateComplete;
            if (showRequestId !== this.#showRequestId) return;
            // The chart host waits for its box itself before the renderer measures it.
            await this.#initializeScatterplot();

            if (showRequestId !== this.#showRequestId) return;

            this.#render();
        } finally {
            if (showRequestId === this.#showRequestId) {
                this.#showInProgress = false;
            }
        }
    }

    /** Close the modal; closing tears its chart down. */
    #close() {
        this.#dialog?.close();
    }

    /**
     * A read-only view of the comparison state: the modal shows the averages the page
     * does, but offers no ⌀ menu of its own — the control builds nothing without
     * `setActive`.
     * @returns {import('../../../../common/charts/comparisonState.js').ComparisonStateReader | null} Null when the host supplied none.
     */
    #readOnlyComparisonState() {
        const state = this.options.comparisonState;
        if (!state) return null;

        return {
            activeModes: state.activeModes,
            isActive: (id) => state.isActive(id),
        };
    }

    /**
     * Build the chart for this open, in the chart area; resolves once it has drawn.
     */
    async #initializeScatterplot() {
        const scatterplotModule = ChartHostModule.createChart(
            `${this.id}-chart-container`,
            scatterplotConfig,
            {
                ...this._childOptions(),
                showModuleTitle: false,
                glossaryReplacements: {
                    Domänen: enDomainListRuns(
                        this.options.context.glossary,
                        this.options.context.documents.getDataset(EN_DATASETS.CONFIG),
                    ),
                },
                comparisonState: this.#readOnlyComparisonState(),
                enableSelection: true,
                selectedIds: this.#selectedIds,
                touchSelectionArmed: this.#touchSelectionArmed,
            },
        );
        scatterplotModule.className = 'scatterplot-filter-chart';
        this.#scatterplotModule = scatterplotModule;
        this.#render();
        await scatterplotModule.updateComplete;
    }

    /**
     * @param {string} path - Path under this modal's `interface` entry.
     * @returns {string}
     */
    #interfaceText(path) {
        return this.options.context.glossary.getRequiredEntryText(`${INTERFACE_PATH}.${path}`);
    }

    /**
     * One sidebar button, labelled from the glossary.
     * @param {string} controlId - Key under this modal's `interface` entry.
     * @param {() => void} onClick
     * @param {string} [modifier] - Classes beside the shared ones, space-led.
     * @returns {import('lit').TemplateResult}
     */
    #sidebarButton(controlId, onClick, modifier = '') {
        return html`<button
            type="button"
            class=${SIDEBAR_BUTTON_CLASS + modifier}
            data-scatterplot-filter-action=${controlId}
            @click=${onClick}
        >
            ${this.#interfaceText(`${controlId}.label`)}
        </button>`;
    }

    /**
     * Flip touch marquee selection on or off. Only reachable with a touchscreen
     * (the button is hidden without a coarse pointer): a mouse can drag a marquee
     * without arming anything, but a finger's drag would otherwise scroll.
     */
    #toggleTouchSelection = () => {
        this.#touchSelectionArmed.value = !this.#touchSelectionArmed.value;
    };

    #selectAll = () => {
        this.#scatterplotModule?.selectAll();
    };

    #clearSelection = () => {
        this.#selectedIds.value = new Set();
    };

    #confirm = () => {
        const selectedIds = new Set(this.#selectedIds.value);
        this.#close();
        this.options.onConfirm?.(selectedIds);
    };

    /** @override */
    _teardown() {
        this.#dialog?.destroy();
        super._teardown();
    }
}

customElements.define('tba-scatterplot-filter', ScatterplotFilterModule);

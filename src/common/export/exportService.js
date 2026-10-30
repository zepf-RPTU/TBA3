/**
 * ExportService — the export button a content module's header carries, and the
 * checkbox beside it that ticks the module for the batch export. One per app, built over
 * its context (`createAppContext`) and handed to the modules in the app's `runtime`. It
 * names each target (`buildExportTargetId`): the module, what it shows, the dataset.
 */

import {
    headerActionButton,
    headerActionDropdown,
    queryEl,
    renderCheckboxIcon,
    renderHeaderActionMenuItems,
    renderIcon,
} from '@tba3/module-base';
import { computed, signal } from '@preact/signals-core';
import { createDefaultExportActions } from './exportActions.js';
import { captureExportRoot } from './exportCapture.js';
import { canvasToBlob } from './exportFiles.js';
import { buildExportTargetId } from './exportTargetId.js';
import { REPORT_BAND_WIDTH_PX } from './pdfPagePlan.js';
import { notifyFailure } from '../services/notificationService.js';

/** @typedef {import('@tba3/module-base').ExportControlDefinition} ExportControlDefinition */
/** @typedef {import('../app/appContext.js').ExportContext} ExportContext */
/**
 * A module's definition with the id the cart, the stored capture and the report card
 * know it by.
 * @typedef {ExportControlDefinition & {id: string}} ExportTarget
 */

/**
 * One module's export controls: the download button with its format menu, and the batch
 * checkbox. The module renders `template()` in its header and keeps the control for its
 * life; the menu and the checkbox read the module's current definition, so a changed
 * definition (a new id when the module shows another item) re-renders them in place.
 * The module disposes the control.
 */
class ModuleExportControl {
    /** @type {ExportTarget} The module's current target. */
    #target;
    /**
     * The current target's id, the one part of the definition the controls show: a
     * re-sync under the same id renders nothing again.
     * @type {import('@preact/signals-core').Signal<string>}
     */
    #targetId;
    /** @type {ExportContext} The app the control exports from. */
    #context;
    /** Whether an export runs: generation takes up to a few seconds. */
    #exporting = signal(false);
    /** Whether the batch checkbox's capture runs. */
    #capturing = signal(false);
    /** Whether the module has let the control go. */
    #disposed = false;
    /**
     * Whether the current target is in the cart. A tick elsewhere in the cart leaves it
     * unchanged, so only the card whose state flips renders its toolbar again.
     */
    #selected;

    /**
     * @param {ExportControlDefinition} definition - Export definition from the owning module.
     * @param {ExportContext} context
     */
    constructor(definition, context) {
        this.#context = context;
        this.#target = this.#targetOf(definition);
        this.#targetId = signal(this.#target.id);
        this.#selected = computed(() => context.exportCart.isSelected(this.#targetId.value));
    }

    /**
     * The download button with its format menu, then the batch checkbox.
     * @returns {import('lit').TemplateResult}
     */
    template() {
        const context = this.#context;
        const tooltip = context.glossary.getRequiredEntryText(
            'general.buttons.element_texts.single-download.tooltip',
        );
        return headerActionDropdown({
            wrapperClass: 'btn-group btn-group--segmented module-export-button-wrapper',
            after: batchSelectButton({
                isSelected: this.#selected.value,
                // Read on click, as the menu is: a re-sync under the same id renders nothing.
                currentTarget: () => (this.#disposed ? null : this.#target),
                context,
                busy: this.#capturing,
            }),
            name: 'export-trigger',
            ariaLabel: tooltip,
            menuLabel: tooltip,
            buttonContent: renderIcon('download'),
            busy: this.#exporting.value,
            // The menu is built on every open, from the target of that moment.
            buildMenu: (dropdown) => {
                const current = this.#target;
                renderHeaderActionMenuItems(
                    dropdown,
                    createDefaultExportActions(current, context),
                    async (action) => {
                        dropdown.hidePopover();
                        await this.#runExportAction(action);
                    },
                );
            },
        });
    }

    /**
     * Follow the module's current definition. A module whose content changes (one
     * instance, one id per shown item) updates under a new id; a capture still running
     * for the previous id is then not ticked.
     * @param {ExportControlDefinition} definition
     */
    update(definition) {
        this.#target = this.#targetOf(definition);
        this.#targetId.value = this.#target.id;
    }

    /** Let the module go: a capture still running is then not ticked. */
    dispose() {
        this.#disposed = true;
    }

    /**
     * @param {ExportControlDefinition} definition
     * @returns {ExportTarget} The definition, named within the app's dataset.
     */
    #targetOf(definition) {
        const { moduleId, identity } = definition;
        return {
            ...definition,
            id: buildExportTargetId(moduleId, identity, this.#context.exportDataset.id),
        };
    }

    /**
     * Run one export action with the trigger busy and loud failure reporting
     * (`notifyFailure`: console + persistent toast).
     * @param {import('./exportActions.js').ExportAction} action
     */
    async #runExportAction(action) {
        this.#exporting.value = true;
        try {
            await action.onSelect();
        } catch (error) {
            notifyFailure(
                this.#context.glossary,
                'general.messages.export-failed',
                '[ExportService] Export failed',
                error,
            );
        } finally {
            this.#exporting.value = false;
        }
    }
}

/**
 * The checkbox's tooltip for its state, read from the app's glossary.
 * @param {ExportContext['glossary']} glossary
 * @param {boolean} isSelected - Whether the module is in the cart.
 * @returns {string}
 */
function batchTooltip(glossary, isSelected) {
    return glossary.getRequiredEntryText(
        isSelected
            ? 'general.buttons.element_texts.cart-toggle-remove.tooltip'
            : 'general.buttons.element_texts.cart-toggle.tooltip',
    );
}

/**
 * The batch-selection checkbox beside an export button; `busy` holds it for the ~1s
 * capture. Its name stays the same, `aria-checked` says whether the card is ticked;
 * the tooltip names what a click does.
 * @param {object} options
 * @param {boolean} options.isSelected - Whether the module's current target is in the cart.
 * @param {() => ExportTarget|null} options.currentTarget - The module's target at this moment; null once the module let its control go.
 * @param {ExportContext} options.context - The app whose cart the checkbox ticks.
 * @param {import('@preact/signals-core').Signal<boolean>} options.busy - Whether a capture runs.
 * @returns {import('lit').TemplateResult}
 */
function batchSelectButton({ isSelected, currentTarget, context, busy }) {
    return headerActionButton({
        name: 'batch-select',
        ariaLabel: batchTooltip(context.glossary, false),
        tooltipText: batchTooltip(context.glossary, isSelected),
        checked: isSelected,
        busy: busy.value,
        // Both glyphs stay in the DOM and cross-fade (`renderCheckboxIcon`, module-base).
        buttonContent: renderCheckboxIcon(isSelected),
        onClick: (event) => {
            const wrapper = /** @type {HTMLElement} */ (event.currentTarget).closest(
                '.module-export-button-wrapper',
            );
            queryEl(wrapper, '.header-action-dropdown')?.hidePopover();
            void toggleBatchSelection(currentTarget, context, busy);
        },
    });
}

/**
 * Untick: drop the selection. Tick: capture the module card, then store the image and
 * select it. The checkbox is busy for the ~1s capture; the cart's change flips the icon
 * once the image is safely stored.
 * @param {() => ExportTarget|null} currentTarget - The module's target at this moment.
 * @param {ExportContext} context - The app whose cart and image store the tick goes to.
 * @param {import('@preact/signals-core').Signal<boolean>} busy - Held true during the capture.
 */
async function toggleBatchSelection(currentTarget, { exportCart, exportDataset, glossary }, busy) {
    const item = currentTarget();
    if (busy.value || !item) return;

    if (exportCart.isSelected(item.id)) {
        exportCart.remove(item.id);
        return;
    }

    busy.value = true;
    try {
        // Report cards go onto paper: light, whatever the screen shows, and no wider
        // than the report draws them.
        const canvas = await captureExportRoot(item, {
            paper: true,
            maxWidthPx: REPORT_BAND_WIDTH_PX,
        });
        const { width, height } = canvas;
        const blob = await canvasToBlob(canvas);
        // Release the backing store now, not at GC.
        canvas.width = 0;
        // The module may have moved on during the capture (view switch, re-render
        // under another id): the image shows what is no longer its target.
        if (currentTarget()?.id !== item.id) {
            throw new Error(`[ExportUI] Export target "${item.id}" changed during the capture.`);
        }
        await exportCart.add(item.id, {
            title: item.title,
            view: item.view ?? '',
            datasetLabel: exportDataset.label,
            blob,
            width,
            height,
            capturedAt: Date.now(),
            docOrder: computeDocOrder(item.module),
        });
    } catch (error) {
        notifyFailure(
            glossary,
            'general.messages.capture-failed',
            '[ExportUI] Capture for batch export failed',
            error,
        );
    } finally {
        busy.value = false;
    }
}

/**
 * Position of the card among the cards of its view, so a fresh report lists
 * a view's modules in the order they appear on screen.
 * @param {HTMLElement} card
 * @returns {number} Its index among the module cards of its view; 0 when the card sits outside a view.
 */
function computeDocOrder(card) {
    const viewRoot = card.closest('.view-base');
    if (!viewRoot) return 0;
    return Math.max(0, Array.from(viewRoot.querySelectorAll('.module-container')).indexOf(card));
}

/**
 * The export service of one app, as its `runtime` hands it to the modules.
 * @param {ExportContext} context
 * @returns {import('@tba3/module-base').ModuleRuntime['exportService']}
 */
export function createExportService(context) {
    return Object.freeze({
        createModuleExportControl: (/** @type {ExportControlDefinition} */ definition) =>
            new ModuleExportControl(definition, context),
    });
}

/**
 * Export Selection UI Components
 * Functions to enhance export buttons and add batch selection options.
 *
 * Ticking a module captures it on the spot (it is on screen right then) and
 * stores the image for the report view, so the report can show modules from
 * views that are no longer mounted. The selection is only recorded once the
 * capture succeeded — a card without an image is of no use to the report.
 */

import { exportSelectionManager } from './exportSelectionManager.js';
import { exportImageStore } from './exportImageStore.js';
import { captureExportRoot, resolveCaptureRoot } from './exportCapture.js';
import { canvasToBlob } from './exportFiles.js';
import { getCurrentViewKey } from '../app/viewRouter.js';
import { getExportDataset } from './exportDataset.js';
import { closeDropdown, iconSvg, queryEl } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { notifyFailure } from '../services/notificationService.js';

const EXPORT_TRIGGER_SELECTOR = '[data-header-action-button="export-trigger"]';
const BATCH_SELECT_BUTTON_SELECTOR = '[data-header-action-button="batch-select"]';

const ICON_UNCHECKED = 'check_box_outline_blank';
const ICON_CHECKED = 'check_box';

/**
 * Tooltip for the batch-add checkbox, read from the shared glossary.
 * @returns {string} The tooltip text.
 */
function getBatchAddTooltip() {
    return glossaryAnnotator.getRequiredEntryText(
        'general.buttons.element_texts.group-download.tooltip',
    );
}

/**
 * Tooltip for the same checkbox once ticked, read from the shared glossary.
 * @returns {string} The tooltip text.
 */
function getBatchRemoveTooltip() {
    return glossaryAnnotator.getRequiredEntryText(
        'general.buttons.element_texts.group-download-remove.tooltip',
    );
}

/**
 * Tear down what enhanceExportButton() attached to a wrapper (listener abort
 * controller, selection subscription). Idempotent.
 * @param {any} buttonWrapper - Wrapper element (fields are expando properties)
 */
export function cleanupBatchSelectionEnhancement(buttonWrapper) {
    if (!buttonWrapper) return;

    if (buttonWrapper._exportAbortController) {
        buttonWrapper._exportAbortController.abort();
        buttonWrapper._exportAbortController = null;
    }

    if (buttonWrapper._exportSelectionUnsub) {
        buttonWrapper._exportSelectionUnsub();
        buttonWrapper._exportSelectionUnsub = null;
    }
}

/**
 * Adds a batch-selection button next to the existing export button.
 * The export button itself is left untouched — it already owns the dropdown.
 * @param {HTMLElement} buttonWrapper - The export button wrapper element
 * @param {string} itemId - Unique item identifier
 */
export function enhanceExportButton(buttonWrapper, itemId) {
    const exportButton = buttonWrapper.querySelector(EXPORT_TRIGGER_SELECTOR);
    if (!exportButton) {
        console.error('[ExportUI] Export button not found in wrapper:', buttonWrapper);
        return;
    }

    cleanupBatchSelectionEnhancement(buttonWrapper);

    // Remove any previously added batch button (idempotent re-enhancement)
    const existingBatch = buttonWrapper.querySelector(BATCH_SELECT_BUTTON_SELECTOR);
    if (existingBatch) existingBatch.remove();

    const ac = new AbortController();
    /** @type {any} */ (buttonWrapper)._exportAbortController = ac;
    const listenerOpts = { signal: ac.signal };

    // Create separate batch-selection button
    const batchBtn = document.createElement('button');
    const batchAddTooltip = getBatchAddTooltip();
    batchBtn.className = 'btn btn--icon';
    batchBtn.type = 'button';
    batchBtn.setAttribute('role', 'checkbox');
    batchBtn.setAttribute('data-header-action-button', 'batch-select');
    batchBtn.setAttribute('aria-label', batchAddTooltip);
    batchBtn.setAttribute('aria-checked', 'false');
    batchBtn.setAttribute('data-tooltip-text', batchAddTooltip);
    // Both glyphs stay in the DOM and cross-fade (`.icon-swap`, module-base's icons.css).
    batchBtn.innerHTML = `<span class="icon-swap" data-state="off">${iconSvg(ICON_UNCHECKED)}${iconSvg(ICON_CHECKED)}</span>`;
    batchBtn.querySelector(`[data-icon="${ICON_UNCHECKED}"]`)?.setAttribute('data-swap', 'off');
    batchBtn.querySelector(`[data-icon="${ICON_CHECKED}"]`)?.setAttribute('data-swap', 'on');

    // Toggle batch selection on click
    batchBtn.addEventListener(
        'click',
        () => {
            // Close any open dropdown (e.g. export format menu)
            const dropdown = buttonWrapper.querySelector('.header-action-dropdown');
            if (dropdown) {
                closeDropdown(dropdown);
            }
            void toggleBatchSelection(batchBtn, itemId);
        },
        listenerOpts,
    );

    buttonWrapper.appendChild(batchBtn);

    // Initialize batch button state
    const isSelected = exportSelectionManager.isSelected(itemId);
    updateBatchSectionUI(batchBtn, isSelected);

    // Listen for external selection changes
    const onSelectionChanged = () => {
        const currentBatchBtn = queryEl(buttonWrapper, BATCH_SELECT_BUTTON_SELECTOR);
        if (currentBatchBtn) {
            const selected = exportSelectionManager.isSelected(itemId);
            updateBatchSectionUI(currentBatchBtn, selected);
        }
    };
    /** @type {any} */ (buttonWrapper)._exportSelectionUnsub = exportSelectionManager.on(
        'selectionChanged',
        onSelectionChanged,
    );
}

/**
 * Untick: drop the selection (the manager drops its image). Tick: capture the
 * module card, store the image, then select. The button is busy for the ~1s capture; the
 * icon flips only once the image is safely stored.
 * @param {HTMLButtonElement} batchBtn - The checkbox, held busy for the duration of the capture.
 * @param {string} itemId - Export target being added to or dropped from the cart.
 */
async function toggleBatchSelection(batchBtn, itemId) {
    if (batchBtn.disabled) return;

    if (exportSelectionManager.isSelected(itemId)) {
        exportSelectionManager.deselect(itemId);
        updateBatchSectionUI(batchBtn, false);
        return;
    }

    batchBtn.disabled = true;
    batchBtn.setAttribute('aria-busy', 'true');
    try {
        const item = exportSelectionManager.getItem(itemId);
        const root = resolveCaptureRoot(item?.container);
        if (!item || !root) throw new Error(`[ExportUI] Export target "${itemId}" is not mounted.`);

        const canvas = await captureExportRoot(root);
        const blob = await canvasToBlob(canvas);
        await exportImageStore.put(itemId, {
            title: item.title,
            view: item.view || getCurrentViewKey(),
            datasetLabel: getExportDataset().label,
            blob,
            width: canvas.width,
            height: canvas.height,
            capturedAt: Date.now(),
            docOrder: computeDocOrder(root),
        });
        // The target may have been unregistered during the capture (view
        // switch, re-render); then the selection is refused and the image
        // must not stay behind.
        if (!exportSelectionManager.toggleSelection(itemId)) {
            exportImageStore.delete(itemId).catch(() => {});
            throw new Error(
                `[ExportUI] Export target "${itemId}" was unmounted during the capture.`,
            );
        }
        updateBatchSectionUI(batchBtn, true);
    } catch (error) {
        notifyFailure(
            'general.messages.capture-failed',
            '[ExportUI] Capture for batch export failed',
            error,
        );
    } finally {
        batchBtn.disabled = false;
        batchBtn.removeAttribute('aria-busy');
    }
}

/**
 * Position of the card among the cards of its view, so a fresh report lists
 * a view's modules in the order they appear on screen.
 * @param {HTMLElement} root - Module card
 * @returns {number} Its index among the module cards of its view; 0 when the card sits outside a view.
 */
function computeDocOrder(root) {
    const viewRoot = root.closest('.view-base');
    if (!viewRoot) return 0;
    return Math.max(0, Array.from(viewRoot.querySelectorAll('.module-container')).indexOf(root));
}

/**
 * Updates the visual state of the batch selection button
 * @param {HTMLElement} batchBtn - The batch selection button element
 * @param {boolean} isSelected - Whether the item is selected
 */
function updateBatchSectionUI(batchBtn, isSelected) {
    if (!batchBtn) {
        console.warn('[ExportUI] updateBatchSectionUI called with null batchBtn');
        return;
    }

    const icon = /** @type {HTMLElement | null} */ (batchBtn.querySelector('.icon-swap'));

    if (!icon) {
        console.warn('[ExportUI] No .icon-swap found in batchBtn:', batchBtn);
        return;
    }

    batchBtn.classList.toggle('is-selected', isSelected);

    if (isSelected) {
        icon.dataset.state = 'on';
        const batchRemoveTooltip = getBatchRemoveTooltip();
        batchBtn.setAttribute('aria-label', batchRemoveTooltip);
        batchBtn.setAttribute('data-tooltip-text', batchRemoveTooltip);
        batchBtn.setAttribute('aria-checked', 'true');
    } else {
        icon.dataset.state = 'off';
        const batchAddTooltip = getBatchAddTooltip();
        batchBtn.setAttribute('aria-label', batchAddTooltip);
        batchBtn.setAttribute('data-tooltip-text', batchAddTooltip);
        batchBtn.setAttribute('aria-checked', 'false');
    }
}

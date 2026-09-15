/**
 * ExportService - Centralized export UI functionality
 *
 * Provides shared export button creation and batch-selection registration.
 * Batch export UI enhances buttons with selection checkboxes.
 */

// ============================================================================
// EXPORT SERVICE SINGLETON
// ============================================================================

import {
    closeDropdown,
    ensureHeaderActionDropdownControl,
    iconSvg,
    renderHeaderActionMenuItems,
} from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { createDefaultExportActions } from './exportActions.js';
import { getCurrentViewKey } from '../app/viewRouter.js';
import { exportSelectionManager } from './exportSelectionManager.js';
import { cleanupBatchSelectionEnhancement, enhanceExportButton } from './exportSelectionUI.js';
import { notifyFailure } from '../services/notificationService.js';

/**
 * Tooltip for the single-download button, read from the shared glossary.
 * @returns {string} The tooltip text.
 */
function getSingleDownloadTooltip() {
    return glossaryAnnotator.getRequiredEntryText(
        'general.buttons.element_texts.single-download.tooltip',
    );
}

class ExportService {
    /** @type {ExportService|null} */
    static #instance = null;

    /**
     * Private constructor - use getInstance() instead
     */
    constructor() {
        if (ExportService.#instance) {
            throw new Error('ExportService is a singleton. Use exportService export instead.');
        }
    }

    /**
     * Get the singleton instance
     * @returns {ExportService} The shared instance, created on first call.
     */
    static getInstance() {
        if (!ExportService.#instance) {
            ExportService.#instance = new ExportService();
        }
        return ExportService.#instance;
    }

    // ============================================================================
    // EXPORT BUTTON CREATION
    // ============================================================================

    /**
     * Creates an HTML export button for a generic exportable content module.
     * Placement is provided by the caller; this service only creates the shared UI.
     * @param {object} definition - Export definition from the owning module
     * @param {object} [options] - Rendering options
     * @param {HTMLElement} [options.targetContainer] - Element to append the controls into
     * @returns {HTMLElement|null} The created button wrapper element
     */
    createModuleExportButton(definition, options = {}) {
        const { targetContainer = null } = options;
        if (!targetContainer || !definition) return null;

        const exportTarget = {
            id: definition.id,
            title: definition.title || definition.id || 'export',
            type: definition.type || 'module',
            container: definition.container || null,
        };

        // The type decides the formats: tables → CSV/JSON/PDF, everything else → PDF/PNG/JPG.
        const actions = createDefaultExportActions(exportTarget);

        return this.#createExportButtonControl(targetContainer, actions, exportTarget);
    }

    /**
     * Removes the module-owned export button (if any) from a container.
     * Tears down batch-selection and registration subscriptions before
     * detaching the wrapper so singleton listeners do not leak.
     * @param {HTMLElement} container - Container element
     */
    removeModuleExportButton(container) {
        if (!container) return;

        const button = /** @type {any} */ (
            container.querySelector('.module-export-button-wrapper')
        );
        if (!button) return;

        // Installed by #createExportButtonControl on every wrapper it returns.
        button._cleanupListeners?.();
        button.remove();
    }

    /**
     * Creates the shared export button UI in the target container.
     * @param {HTMLElement} appendTarget - Container the control is appended to; a nullish target is a no-op.
     * @param {Array<object>} actions - The formats offered in the menu.
     * @param {{id?: string, title: string, type?: string, container?: HTMLElement|null}} exportTarget - What is being exported: its id, title, type and capture container.
     * @returns {HTMLElement|null} The control wrapper, or null when there was no target to append to.
     */
    #createExportButtonControl(appendTarget, actions, exportTarget) {
        if (!appendTarget) return null;

        const title = exportTarget.title;
        const singleDownloadTooltip = getSingleDownloadTooltip();
        const buttonHTML = iconSvg('download');

        const menuItems = actions.map((action) => ({
            id: action.id || action.label,
            label: action.label,
            disabled: typeof action.onSelect !== 'function',
            action,
        }));

        const renderMenu = (dropdown) => {
            renderHeaderActionMenuItems(dropdown, menuItems, {
                onSelect: async (item) => {
                    closeDropdown(dropdown);
                    // The button may have been built before the route settled;
                    // resolve the view when the user actually exports.
                    const liveTarget = { ...exportTarget, view: getCurrentViewKey() };
                    await this.#runExportAction(
                        item.action,
                        { title, exportTarget: liveTarget },
                        dropdown,
                    );
                },
            });
        };

        // Reuse an existing wrapper across resyncs instead of removing and rebuilding
        // it. The helper rebinds attributes and the (fresh) lazy menu builder, so the
        // button stays current without the DOM teardown that caused header-action flicker.
        const control = ensureHeaderActionDropdownControl(appendTarget, {
            wrapperSelector: '.module-export-button-wrapper',
            wrapperClass: 'btn-group btn-group--segmented module-export-button-wrapper',
            buttonClass: '',
            buttonAttributes: { 'data-header-action-button': 'export-trigger' },
            ariaLabel: singleDownloadTooltip,
            tooltipText: singleDownloadTooltip,
            buttonHTML,
            buildMenu: renderMenu,
        });

        if (!control) return null;
        const { wrapper } = control;
        const cleanupDropdownControl = wrapper._cleanupListeners;

        wrapper._cleanupListeners = () => {
            cleanupDropdownControl?.();

            if (wrapper._exportRegistrationCleanup) {
                wrapper._exportRegistrationCleanup();
                wrapper._exportRegistrationCleanup = null;
                wrapper._exportTargetId = null;
            }

            cleanupBatchSelectionEnhancement(wrapper);
        };

        if (exportTarget.id) {
            this.#setupBatchExportTarget(wrapper, exportTarget);
        }

        return wrapper;
    }

    /**
     * Run one export action with busy state on the trigger button and loud
     * failure reporting (`notifyFailure`: console + persistent toast) — generation
     * takes up to a few seconds.
     * @param {{onSelect: Function}} action - The chosen format’s handler.
     * @param {{title: string, exportTarget: object}} context - Passed to the handler: the visible title and the registered target.
     * @param {HTMLElement} dropdown - Menu element; its wrapper holds the trigger
     */
    async #runExportAction(action, context, dropdown) {
        const wrapper = dropdown?.closest?.('.module-export-button-wrapper');
        const trigger = /** @type {HTMLButtonElement|null} */ (
            wrapper?.querySelector('[data-header-action-button="export-trigger"]') ?? null
        );

        if (trigger) {
            trigger.disabled = true;
            trigger.setAttribute('aria-busy', 'true');
        }

        try {
            await action.onSelect(context);
        } catch (error) {
            notifyFailure('general.messages.export-failed', '[ExportService] Export failed', error);
        } finally {
            if (trigger) {
                trigger.disabled = false;
                trigger.removeAttribute('aria-busy');
            }
        }
    }

    /**
     * Register the target for the batch export and add the batch checkbox.
     * Synchronous on purpose: the registration cleanup must be in place before
     * the wrapper can be torn down again.
     * @param {any} wrapper - The control wrapper the checkbox is added to.
     * @param {any} exportTarget - The target being registered for batch selection.
     */
    #setupBatchExportTarget(wrapper, exportTarget) {
        // A module whose content changes (EN item detail: one instance, one id
        // per selected item) resyncs this wrapper under a new id. Retire the
        // previous registration first, or it lingers in the cart pointing at a
        // container that now shows something else.
        const previousId = wrapper._exportTargetId ?? null;
        const idChanged = previousId !== null && previousId !== exportTarget.id;
        if (idChanged) {
            exportSelectionManager.unregister(previousId);
        }

        // registerTarget is idempotent; refresh it each sync to keep target metadata current.
        exportSelectionManager.registerTarget(exportTarget.id, exportTarget);
        wrapper._exportTargetId = exportTarget.id;
        wrapper._exportRegistrationCleanup = () => {
            exportSelectionManager.unregister(exportTarget.id);
        };

        // enhanceExportButton tears down and rebuilds the batch-select button. On a
        // reused wrapper that button already exists, so re-enhancing would reintroduce
        // the flicker this reuse path avoids — only build it on first setup, or when
        // the id changed and the existing button still closes over the old one.
        if (idChanged || !wrapper.querySelector('[data-header-action-button="batch-select"]')) {
            enhanceExportButton(wrapper, exportTarget.id);
        }
    }
}

/**
 * Singleton ExportService instance
 * @type {ExportService}
 */
export const exportService = ExportService.getInstance();

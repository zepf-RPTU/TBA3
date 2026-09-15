/**
 * Batch Export Toolbar
 * Manages the bottom toolbar for batch export operations. The selection is
 * arranged and exported in the report view (see reportViewModule.js); the
 * toolbar only opens it and clears the cart.
 */

import { exportSelectionManager } from './exportSelectionManager.js';
import { REPORT_VIEW_KEY } from '../views/report/reportViewConfig.js';
import { iconSvg } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import './batchExportToolbar.css';

let toolbarElement = null;
let isInitialized = false;

/**
 * How many items the batch cart currently holds.
 * @returns {number} The persisted selection count, across all views.
 */
function getSelectionCount() {
    return exportSelectionManager.getPersistedSelectedCount();
}

/**
 * Initializes the batch export toolbar.
 * Should be called once on page load; a repeat call only resyncs visibility.
 * @returns {HTMLElement|null} The toolbar element.
 */
export function initializeBatchExportToolbar() {
    if (isInitialized) {
        updateToolbarVisibility();
        return toolbarElement;
    }

    createToolbarElement();
    attachEventListeners();
    updateToolbarVisibility();

    isInitialized = true;
    return toolbarElement;
}

/**
 * Creates the toolbar DOM element
 */
function createToolbarElement() {
    toolbarElement = document.createElement('div');
    toolbarElement.className = 'batch-export-toolbar';
    // Note: visibility controlled entirely by .visible CSS class; .hidden is not needed.
    toolbarElement.setAttribute('role', 'region');
    toolbarElement.setAttribute(
        'aria-label',
        glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.batch-export.label'),
    );

    toolbarElement.innerHTML = `
        <div class="toolbar-content">
            <div class="selection-info">
                ${iconSvg('library_add_check')}
                <span class="selection-count">0 Elemente ausgewählt</span>
            </div>
            
            <div class="btn-group btn-group--wrap toolbar-actions">
                <button class="btn btn--text btn--primary btn--size-control" data-batch-export-action="export" data-tooltip-text="Bericht mit den ausgewählten Elementen öffnen">
                    ${iconSvg('article')}
                    Bericht öffnen
                </button>
                <button class="btn btn--text btn--size-control" data-batch-export-action="clear" data-tooltip-text="Alle Elemente aus dem Bericht entfernen">
                    ${iconSvg('clear_all')}
                    Auswahl leeren
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(toolbarElement);
}

/**
 * Attaches event listeners to toolbar elements
 */
function attachEventListeners() {
    const exportBtn = toolbarElement.querySelector('[data-batch-export-action="export"]');
    const clearBtn = toolbarElement.querySelector('[data-batch-export-action="clear"]');

    // The router listens for hash changes, so this is a plain view navigation.
    exportBtn.addEventListener('click', () => {
        window.location.hash = `#${REPORT_VIEW_KEY}`;
    });

    // Clear the cart (the manager drops the stored images with it).
    clearBtn.addEventListener('click', () => {
        if (
            confirm(glossaryAnnotator.getRequiredEntryText('general.messages.confirm-clear-report'))
        ) {
            exportSelectionManager.clearSelection();
        }
    });

    // Permanent listener — toolbar is a page-lifetime singleton, no teardown needed.
    exportSelectionManager.on('selectionChanged', updateToolbarVisibility);
}

/**
 * Updates toolbar visibility based on selection count
 */
function updateToolbarVisibility() {
    const count = getSelectionCount();

    if (count > 0) {
        showToolbar();
    } else {
        hideToolbar();
    }

    updateSelectionCount();
}

/**
 * Updates the selection count display
 */
function updateSelectionCount() {
    const countElement = toolbarElement.querySelector('.selection-count');
    const count = getSelectionCount();

    countElement.textContent = `${count} ${count === 1 ? 'Element' : 'Elemente'} ausgewählt`;
}

/**
 * Shows the toolbar (slides up via CSS animation)
 */
function showToolbar() {
    toolbarElement.classList.add('visible');
}

/**
 * Hides the toolbar
 */
function hideToolbar() {
    toolbarElement.classList.remove('visible');
}

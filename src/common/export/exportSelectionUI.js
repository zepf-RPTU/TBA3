/** The confirmed emptying of the export cart. */

import { confirmDialog } from '@tba3/modules/overlays';

/**
 * Empty the export cart (the report): a cart with anything in it asks first.
 * @param {import('./exportCart.js').ExportCart} exportCart
 * @param {import('@tba3/modules/context').GlossaryAnnotator} glossary
 * @returns {Promise<void>}
 */
export async function confirmClearSelection(exportCart, glossary) {
    if (exportCart.selection.value.length === 0) return;
    const confirmed = await confirmDialog({
        glossary,
        labelKey: 'general.buttons.element_texts.report-clear.label',
        messageKey: 'general.messages.confirm-clear-report',
        confirmKey: 'general.buttons.element_texts.report-clear-confirm.label',
    });
    if (confirmed) exportCart.clear();
}

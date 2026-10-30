/**
 * The confirmation before a destructive action: a ModalDialog titled with the action,
 * the question, Cancel and the action in the danger fill. Cancel comes first, so
 * `showModal()` focuses the safe choice; Escape and a backdrop click cancel too.
 */

import { html, render } from 'lit';
import { ModalDialog } from './modalDialog.js';

/**
 * Ask before a destructive action.
 * @param {object} options - The texts, as glossary paths.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} options.glossary
 * @param {string} options.labelKey - The entry that titles and names the dialog (the action's button label).
 * @param {string} options.messageKey - The entry that asks the question.
 * @param {string} options.confirmKey - The entry that labels the confirming button.
 * @returns {Promise<boolean>} True once the action was confirmed; false however else the dialog closed.
 */
export function confirmDialog({ glossary, labelKey, messageKey, confirmKey }) {
    return new Promise((resolve) => {
        let confirmed = false;
        const dialog = new ModalDialog({
            className: 'confirm-dialog modal-dialog--centered',
            glossary,
            onClose: () => {
                resolve(confirmed);
                // After the close has run its course: `destroy()` closes it again.
                queueMicrotask(() => dialog.destroy());
            },
        });
        const confirm = () => {
            confirmed = true;
            dialog.close();
        };
        render(
            html`<div class="modal-panel confirm-panel">
                <h2 class="confirm-title">${glossary.getRequiredEntryText(labelKey)}</h2>
                <p>${glossary.getRequiredEntryText(messageKey)}</p>
                <div class="confirm-actions">
                    <button type="button" class="btn" @click=${() => dialog.close()}>
                        ${glossary.getRequiredEntryText('general.buttons.element_texts.cancel.label')}
                    </button>
                    <button type="button" class="btn btn--primary btn--danger" @click=${confirm}>
                        ${glossary.getRequiredEntryText(confirmKey)}
                    </button>
                </div>
            </div>`,
            dialog.element,
        );
        dialog.show(glossary.getRequiredEntryText(labelKey));
    });
}

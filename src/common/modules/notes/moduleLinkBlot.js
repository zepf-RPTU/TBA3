/**
 * ModuleLinkBlot — Quill inline format for the "linked module" chips inserted
 * from the notes panel. Renders as an <a data-view-type="..." data-module-id="...">
 * whose click is intercepted by NotesController, which switches the dashboard to
 * the chip's view (notes are app-wide, so a chip can point at a module in any
 * view) and then scrolls/highlights the referenced module.
 *
 * The format value stays a plain string ("<viewType>::<moduleId>") rather than an
 * object: Quill compares format values by equality when merging adjacent text
 * runs and when diffing Deltas, and object values would split every character
 * into its own blot.
 */

import Quill from 'quill';

export const MODULE_LINK_CLASS = 'notes-module-link';
export const MODULE_LINK_FORMAT = 'moduleLink';

const VALUE_SEPARATOR = '::';

let registered = false;

/**
 * Encode a link target into the blot's scalar format value.
 * @param {string} viewType - View the link navigates to.
 * @param {string} moduleId - Module within that view.
 * @returns {string} The scalar value Quill stores on the blot.
 */
export function encodeModuleLinkValue(viewType, moduleId) {
    return `${viewType}${VALUE_SEPARATOR}${moduleId}`;
}

/**
 * Decode a blot format value back into its parts. Module ids may themselves
 * contain the separator, so only the first one splits.
 * @param {string|null|undefined} value - A stored blot value.
 * @returns {{viewType: string, moduleId: string}|null} null when malformed
 */
export function decodeModuleLinkValue(value) {
    if (typeof value !== 'string') return null;

    const separatorIndex = value.indexOf(VALUE_SEPARATOR);
    if (separatorIndex <= 0) return null;

    const viewType = value.slice(0, separatorIndex);
    const moduleId = value.slice(separatorIndex + VALUE_SEPARATOR.length);
    if (!moduleId) return null;

    return { viewType, moduleId };
}

/**
 * Register the moduleLink inline format with Quill. Safe to call more than once.
 */
export function registerModuleLinkBlot() {
    if (registered) return;

    // Quill types `import()` by literal path and knows no blot paths; the blot API is untyped anyway.
    const InlineBlot = /** @type {any} */ (Quill.import('blots/inline'));

    class ModuleLinkBlot extends InlineBlot {
        static blotName = MODULE_LINK_FORMAT;
        static tagName = 'a';

        static create(value) {
            const node = super.create();
            const target = decodeModuleLinkValue(value);
            node.setAttribute('href', '#');
            node.setAttribute('data-view-type', target?.viewType ?? '');
            node.setAttribute('data-module-id', target?.moduleId ?? '');
            node.setAttribute('contenteditable', 'false');
            node.classList.add(MODULE_LINK_CLASS);
            return node;
        }

        static formats(node) {
            return encodeModuleLinkValue(
                node.getAttribute('data-view-type') ?? '',
                node.getAttribute('data-module-id') ?? '',
            );
        }
    }

    Quill.register(/** @type {any} */ (ModuleLinkBlot), true);
    registered = true;
}

/**
 * ModuleLinkBlot — Quill inline format for the "linked module" chips inserted
 * from the notes panel. Renders as an <a data-view-type="..." data-module-id="...">;
 * notes are app-wide, so a chip names its view as well as its module. The click is
 * notesLinkMenu.js's.
 *
 * The format value stays a plain string ("<viewType>::<moduleId>") rather than an
 * object: Quill compares format values by equality when merging adjacent text
 * runs and when diffing Deltas, and object values would split every character
 * into its own blot.
 */

export const MODULE_LINK_CLASS = 'notes-module-link';
export const MODULE_LINK_FORMAT = 'moduleLink';

const VALUE_SEPARATOR = '::';

/**
 * Encode a link target into the blot's scalar format value.
 * @param {string} viewType - View the link navigates to.
 * @param {string} moduleId - Module within that view.
 * @returns {string}
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
function decodeModuleLinkValue(value) {
    if (typeof value !== 'string') return null;

    const separatorIndex = value.indexOf(VALUE_SEPARATOR);
    if (separatorIndex <= 0) return null;

    const viewType = value.slice(0, separatorIndex);
    const moduleId = value.slice(separatorIndex + VALUE_SEPARATOR.length);
    if (!moduleId) return null;

    return { viewType, moduleId };
}

/**
 * Register the moduleLink inline format with Quill.
 * @param {typeof import('quill').default} Quill
 */
export function registerModuleLinkBlot(Quill) {
    // Quill types `import()` by literal path and knows no blot paths.
    const InlineBlot = /** @type {typeof import('quill/blots/inline.js').default} */ (
        Quill.import('blots/inline')
    );

    class ModuleLinkBlot extends InlineBlot {
        /** @override */
        static blotName = MODULE_LINK_FORMAT;
        /** @override */
        static tagName = 'a';

        /**
         * @override
         * @param {string} value - The blot's stored format value.
         * @returns {HTMLElement}
         */
        static create(value) {
            const node = /** @type {HTMLElement} */ (super.create());
            const target = decodeModuleLinkValue(value);
            node.setAttribute('href', '#');
            node.setAttribute('data-view-type', target?.viewType ?? '');
            node.setAttribute('data-module-id', target?.moduleId ?? '');
            node.setAttribute('contenteditable', 'false');
            node.classList.add(MODULE_LINK_CLASS);
            return node;
        }

        /**
         * @override
         * @param {HTMLElement} node
         * @returns {string} The format value encoded from its data attributes.
         */
        static formats(node) {
            return encodeModuleLinkValue(
                node.getAttribute('data-view-type') ?? '',
                node.getAttribute('data-module-id') ?? '',
            );
        }
    }

    Quill.register(ModuleLinkBlot, true);
}

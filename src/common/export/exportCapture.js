/**
 * Module capture for exports: clone a module card into an off-screen stage,
 * strip interactive controls, expand collapsed content, replace virtual-DOM
 * Tabulator tables with their full HTML output, then rasterize the clone.
 *
 * The live DOM is never mutated (no header flicker, no ResizeObserver
 * re-render); the stage is removed in `finally`.
 */

import { loadHtmlToImage } from './exportLibs.js';
import { waitForLayout } from '@tba3/module-base';
import { Tabulator } from '@tba3/modules/tables';
import { getThemeColors } from '@tba3/modules/theme';

/** Controls that must not appear in an export (buttons, presets, menus, chevron). */
export const EXPORT_EXCLUDE_SELECTOR = [
    '.content-module-header-actions',
    '.module-export-button-wrapper',
    '.table-preset-container',
    '.content-module-chevron',
    '.header-action-dropdown',
    '[data-header-action-button]',
    '.item-preview-trigger',
].join(', ');

const STAGE_CLASS = 'export-capture-stage';
const MAX_CANVAS_EDGE_PX = 16000;

/**
 * Presentation properties CSS may set on chart content. html-to-image inlines
 * computed styles for HTML nodes but deep-clones an `<svg>` subtree untouched,
 * so anything a stylesheet paints inside a chart (competence-band fills via
 * `--ks-band-color`, axis text, dashed reference lines) would otherwise fall
 * back to SVG defaults — black fills — in the rasterized document.
 */
const SVG_INLINE_PROPERTIES = [
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'opacity',
    'visibility',
    'display',
    'paint-order',
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'letter-spacing',
    'text-anchor',
    'dominant-baseline',
    'text-decoration',
];

/**
 * Resolve the element to capture from an export target's `container`
 * (element id or element). The module card is the closest `.module-container`;
 * a bare element without a card shell is captured as-is.
 * @param {string|HTMLElement|null|undefined} container - An element id, or the element itself, from the export target's `container`.
 * @returns {HTMLElement|null} The module card to capture, the element itself when it has no card shell, or null when nothing resolves.
 */
export function resolveCaptureRoot(container) {
    const element =
        typeof container === 'string'
            ? document.getElementById(container)
            : container instanceof HTMLElement
              ? container
              : null;
    if (!element) return null;
    return /** @type {HTMLElement} */ (element.closest('.module-container')) ?? element;
}

/**
 * Tabulator instances rendered inside a root, in DOM order.
 * @param {HTMLElement} root - Subtree to search.
 * @returns {Tabulator[]} The Tabulator instances found, in DOM order.
 */
export function findTablesInRoot(root) {
    const tables = [];
    root.querySelectorAll('.tabulator').forEach((element) => {
        const found = Tabulator.findTable(/** @type {HTMLElement} */ (element));
        if (Array.isArray(found) && found[0]) tables.push(found[0]);
    });
    return tables;
}

/**
 * Build the off-screen capture stage next to `root` and return it with the
 * prepared clone. Pure DOM work (no rasterization) — unit-testable.
 * @param {HTMLElement} root - The live module root to clone.
 * @returns {{stage: HTMLElement, clone: HTMLElement}} The off-screen stage and the prepared clone inside it; the caller owns removing the stage.
 */
export function buildCaptureStage(root) {
    // Tables inside collapsed cards were laid out at zero width; reveal them for
    // the (synchronous, never painted) duration of the clone build.
    const restoreCollapsed = revealCollapsedTables(root);
    try {
        return buildStageFromRevealedRoot(root);
    } finally {
        restoreCollapsed();
    }
}

/**
 * @param {HTMLElement} root - The live module root, with any collapsed tables already revealed.
 * @returns {{stage: HTMLElement, clone: HTMLElement}} The off-screen stage and the prepared clone inside it.
 */
function buildStageFromRevealedRoot(root) {
    const clone = /** @type {HTMLElement} */ (root.cloneNode(true));

    // cloneNode() copies attributes, not runtime form state. Sync while both
    // trees are still structurally identical (before any node is removed).
    syncFormControlState(root, clone);

    // Expand collapsed cards (root and nested sections) so hidden content is exported.
    clone.classList.remove('collapsed');
    clone.querySelectorAll('.collapsed').forEach((el) => el.classList.remove('collapsed'));

    // Drop interactive controls.
    clone.querySelectorAll(EXPORT_EXCLUDE_SELECTOR).forEach((el) => el.remove());

    // Virtual-DOM tables only carry the visible rows — swap in the full HTML output.
    const liveTables = root.querySelectorAll('.tabulator');
    const cloneTables = clone.querySelectorAll('.tabulator');
    liveTables.forEach((liveTable, index) => {
        const cloneTable = cloneTables[index];
        if (!cloneTable) return;
        const found = Tabulator.findTable(/** @type {HTMLElement} */ (liveTable));
        const table = Array.isArray(found) ? found[0] : null;
        if (!table) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'export-print-table';
        wrapper.innerHTML = table.getHtml('active', true);
        cloneTable.replaceWith(wrapper);
    });

    // Chart SVGs size to their body via height:100% and need a definite height;
    // scrolling content and print tables must expand instead.
    const liveBodies = root.querySelectorAll('.content-module-body');
    const cloneBodies = clone.querySelectorAll('.content-module-body');
    liveBodies.forEach((liveBody, index) => {
        const cloneBody = /** @type {HTMLElement|undefined} */ (cloneBodies[index]);
        if (!cloneBody) return;
        const scrolls = liveBody.scrollHeight > liveBody.clientHeight + 1;
        const hasPrintTable = Boolean(cloneBody.querySelector('.export-print-table'));
        cloneBody.style.height =
            scrolls || hasPrintTable || liveBody.clientHeight === 0
                ? 'auto'
                : `${liveBody.clientHeight}px`;
    });

    const stage = document.createElement('div');
    stage.className = STAGE_CLASS;
    stage.setAttribute('data-exporting', '');
    stage.setAttribute('aria-hidden', 'true');
    const width = root.getBoundingClientRect().width;
    if (width > 0) stage.style.width = `${width}px`;
    stage.appendChild(clone);

    // Sibling *after* the root: view-scoped CSS still applies, and the live
    // node keeps winning getElementById() for the ~1s both exist.
    root.parentElement?.insertBefore(stage, root.nextSibling);

    // Needs the clone in the document, where the stylesheets resolve.
    inlineSvgStyles(clone);

    return { stage, clone };
}

/**
 * Write the computed value of every SVG presentation property onto each
 * element inside the clone's `<svg>` subtrees, so the paint survives
 * html-to-image's untouched SVG deep clone (see SVG_INLINE_PROPERTIES).
 * @param {HTMLElement} clone - connected to the document
 */
function inlineSvgStyles(clone) {
    const view = clone.ownerDocument.defaultView;
    if (!view) return;
    // Read everything first, then write: an inline write dirties the element's
    // descendants, and reading them next would force a style recalc per node.
    /** @type {Array<{element: SVGElement, values: Array<[string, string]>}>} */
    const pending = [];
    clone.querySelectorAll('svg *').forEach((element) => {
        if (!(element instanceof view.SVGElement)) return;
        const computed = view.getComputedStyle(element);
        /** @type {Array<[string, string]>} */
        const values = [];
        for (const property of SVG_INLINE_PROPERTIES) {
            const value = computed.getPropertyValue(property);
            if (value && value !== element.style.getPropertyValue(property)) {
                values.push([property, value]);
            }
        }
        if (values.length > 0) pending.push({ element, values });
    });
    pending.forEach(({ element, values }) => {
        values.forEach(([property, value]) => element.style.setProperty(property, value));
    });
}

/**
 * Rasterize a module root into a canvas (device pixel ratio up to 2).
 * @param {HTMLElement} root - The module root to rasterize.
 * @returns {Promise<HTMLCanvasElement>} The rendered canvas, at up to twice device resolution.
 */
export async function captureExportRoot(root) {
    if (!(root instanceof HTMLElement)) {
        throw new Error('[exportCapture] No capture root available.');
    }
    if (!isRendered(root)) {
        throw new Error('[exportCapture] Export target is not visible.');
    }

    const htmlToImage = await loadHtmlToImage();
    const { stage, clone } = buildCaptureStage(root);

    try {
        await waitForLayout();
        const rect = clone.getBoundingClientRect();
        const longestEdge = Math.max(rect.width, rect.height, 1);
        const pixelRatio = Math.min(2, MAX_CANVAS_EDGE_PX / longestEdge);
        // The dashboards use system fonts and inline-SVG icons, so there is no
        // web font to embed. Passing empty font CSS also makes html-to-image skip
        // its own stylesheet scan, which resolves @import hrefs against the
        // document instead of the sheet (404 noise) and would inject fetched
        // rules into live sheets.
        return await htmlToImage.toCanvas(clone, {
            pixelRatio,
            // The page surface, so an export from the dark scheme is a coherent dark
            // image rather than dark ink bleeding onto a white edge.
            backgroundColor: getThemeColors().chrome.surface,
            fontEmbedCSS: '',
        });
    } finally {
        stage.remove();
    }
}

/**
 * Tabulator tables inside collapsed cards have never had room to lay out
 * (`responsiveLayout: 'hide'` then hides every column, and `getHtml()` comes
 * back empty). Temporarily drop `.collapsed` on their ancestors, redraw those
 * tables, and return a restore function. Everything happens synchronously, so
 * the browser never paints the expanded state.
 * @param {HTMLElement} root - Subtree whose collapsed ancestors are temporarily reopened.
 * @returns {() => void} Restores every ancestor and table to the state it was found in.
 */
function revealCollapsedTables(root) {
    /** @type {HTMLElement[]} */
    const reopened = [];
    /** @type {HTMLElement[]} */
    const hiddenTables = [];

    root.querySelectorAll('.tabulator').forEach((element) => {
        if (element.getClientRects().length > 0) return;
        hiddenTables.push(/** @type {HTMLElement} */ (element));
        let node = element.parentElement;
        while (node && node !== root.parentElement) {
            if (node.classList.contains('collapsed')) {
                node.classList.remove('collapsed');
                reopened.push(node);
            }
            node = node.parentElement;
        }
    });

    if (reopened.length === 0) return () => {};

    hiddenTables.forEach((element) => {
        const found = Tabulator.findTable(element);
        const table = Array.isArray(found) ? found[0] : null;
        if (table && !table.destroyed) table.redraw(true);
    });

    return () => reopened.forEach((node) => node.classList.add('collapsed'));
}

/**
 * A hidden (display:none / detached) root would rasterize to a blank tile.
 * @param {HTMLElement} root - The candidate capture root.
 * @returns {boolean} True when the element is connected and has a non-zero box, so it will rasterize to something.
 */
function isRendered(root) {
    if (!root.isConnected) return false;
    const rect = root.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/**
 * @param {HTMLElement} liveRoot - The on-screen tree, read for current control values.
 * @param {HTMLElement} cloneRoot - The structurally identical clone those values are written onto.
 */
function syncFormControlState(liveRoot, cloneRoot) {
    const liveControls = liveRoot.querySelectorAll('select, input, textarea');
    const cloneControls = cloneRoot.querySelectorAll('select, input, textarea');
    liveControls.forEach((live, index) => {
        const target = cloneControls[index];
        if (!target || live.tagName !== target.tagName) return;
        if (live instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
            target.selectedIndex = live.selectedIndex;
        } else if (live instanceof HTMLInputElement && target instanceof HTMLInputElement) {
            if (live.type === 'checkbox' || live.type === 'radio') {
                target.checked = live.checked;
            } else {
                target.value = live.value;
            }
        } else if (live instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
            target.value = live.value;
        }
    });
}

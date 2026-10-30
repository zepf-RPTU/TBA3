/**
 * Module capture for exports: clone a module card into an off-screen stage,
 * strip interactive controls, expand collapsed content, let the captured module
 * put in what a clone cannot carry, then rasterize the clone.
 *
 * Nothing here knows a card's content: the target's module makes its live subtree
 * capturable (and undoes it afterwards) and repairs the clone.
 *
 * A capture for paper (the report, a PDF) is light whatever the screen shows: its stage
 * carries `data-color-scheme="light"`, and every token resolves light inside it. A
 * capture for the screen (PNG, JPG) keeps the screen's scheme.
 */

import { loadHtmlToImage } from './exportLibs.js';
import { CAPTURE_STAGE_ATTRIBUTE, waitForLayout } from '@tba3/module-base';

/**
 * Controls that must not appear in an export (buttons, presets, menus, the collapse
 * toggle: an emptied toggle would still take the header's gap before the title).
 */
const EXPORT_EXCLUDE_SELECTOR = [
    '.content-module-header-actions',
    '.content-module-toggle',
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
 * `--competence-level-band-color`, axis text, dashed reference lines) would otherwise fall
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
 * Build the off-screen capture stage next to `root` and return it with the
 * prepared clone. Pure DOM work; rasterizing is the caller's.
 * @param {import('@tba3/module-base').ExportControlDefinition['module']} root - The live module to clone, already prepared for the capture.
 * @param {boolean} paper - Whether the capture is for paper, and so light.
 * @returns {{stage: HTMLElement, clone: HTMLElement}} The off-screen stage and the prepared clone inside it; the caller owns removing the stage.
 */
function buildCaptureStage(root, paper) {
    const clone = /** @type {HTMLElement} */ (root.cloneNode(true));

    // Node for node while the two trees are still identical — before anything is
    // removed from the clone. Everything below finds a live node's copy through
    // this, rather than by matching selector results position by position.
    const copies = mapClonedNodes(root, clone);
    const cloneOf = (/** @type {Element} */ live) => copies.get(live) ?? null;

    // cloneNode() copies attributes, not runtime form state.
    syncFormControlState(root, cloneOf);

    clone.querySelectorAll(EXPORT_EXCLUDE_SELECTOR).forEach((el) => el.remove());

    // What the DOM alone does not carry — a virtual-DOM table's off-screen rows, a
    // chart's definite height — is the module's to put in.
    root.prepareExportClone(cloneOf);

    const stage = document.createElement('div');
    stage.className = STAGE_CLASS;
    stage.setAttribute('aria-hidden', 'true');
    // Before the clone enters the document: a module element copied into the stage
    // stays an inert picture instead of setting itself up a second time.
    stage.setAttribute(CAPTURE_STAGE_ATTRIBUTE, '');
    // Every token is a light-dark() pair: the attribute alone makes the clone paint light.
    if (paper) stage.dataset.colorScheme = 'light';
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
 * Pair every element of a freshly cloned tree with its original. Both walks visit
 * the same nodes in the same order for as long as the trees are identical, which
 * they are until the first edit.
 * @param {HTMLElement} live
 * @param {HTMLElement} clone - Its untouched copy.
 * @returns {Map<Element, Element>} Live element to its copy, root included.
 */
function mapClonedNodes(live, clone) {
    /** @type {Map<Element, Element>} */
    const copies = new Map([[live, clone]]);
    const liveWalker = document.createTreeWalker(live, NodeFilter.SHOW_ELEMENT);
    const cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    for (
        let a = liveWalker.nextNode(), b = cloneWalker.nextNode();
        a && b;
        a = liveWalker.nextNode(), b = cloneWalker.nextNode()
    ) {
        copies.set(/** @type {Element} */ (a), /** @type {Element} */ (b));
    }
    return copies;
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
 * Rasterize an export target's card into a canvas.
 * @param {Pick<import('@tba3/module-base').ExportControlDefinition, 'module'>} target - The module whose card is captured.
 * @param {{paper?: boolean, maxWidthPx?: number}} [options] - `paper`: the capture goes
 *   onto paper (the report, a PDF) and is light whatever the screen shows; otherwise it
 *   follows the screen. `maxWidthPx`: the widest canvas the capture's use can show.
 * @returns {Promise<HTMLCanvasElement>} The rendered canvas, at up to twice device resolution.
 * @throws {Error} when the card is not mounted, has no box to rasterize, or leaves the page
 *   during the capture.
 */
export async function captureExportRoot(
    { module: root },
    { paper = false, maxWidthPx = Infinity } = {},
) {
    assertMounted(root);
    if (!isRendered(root)) {
        throw new Error('[exportCapture] Export target is not visible.');
    }

    // Fetched while the card settles; a capture that fails first never reads it.
    const loadingLibrary = loadHtmlToImage();
    loadingLibrary.catch(() => {});
    // Opens collapsed cards, lays out tables that never had room and draws charts
    // that never drew — all on the live tree, all undone before it is painted again.
    const restore = root.prepareExportCapture();
    /** @type {{stage: HTMLElement, clone: HTMLElement}} */
    let staged;
    try {
        // A build still in flight would be cloned half done.
        await root.whenSettled();
        // The card may have left the page while it settled (a view switch).
        assertMounted(root);
        staged = buildCaptureStage(root, paper);
    } finally {
        restore();
    }
    const { stage, clone } = staged;

    try {
        const [htmlToImage] = await Promise.all([loadingLibrary, waitForLayout()]);
        // The stage sits beside the card and leaves the page with it.
        assertMounted(stage);
        const rect = clone.getBoundingClientRect();
        const longestEdge = Math.max(rect.width, rect.height, 1);
        const pixelRatio = Math.min(
            2,
            MAX_CANVAS_EDGE_PX / longestEdge,
            maxWidthPx / Math.max(rect.width, 1),
        );
        // The dashboards use system fonts and inline-SVG icons, so there is no
        // web font to embed. Passing empty font CSS also makes html-to-image skip
        // its own stylesheet scan, which resolves @import hrefs against the
        // document instead of the sheet (404 noise) and would inject fetched
        // rules into live sheets.
        return await htmlToImage.toCanvas(clone, {
            pixelRatio,
            // The card surface the stage paints in its scheme: white on paper, the
            // screen's card otherwise, so a dark PNG has no white edge.
            backgroundColor: getComputedStyle(stage).backgroundColor,
            fontEmbedCSS: '',
        });
    } finally {
        stage.remove();
    }
}

/**
 * A detached card would rasterize to a blank tile, or not lay out at all.
 * @param {HTMLElement} element - The card, or its stage.
 * @throws {Error} when it is not in the document.
 */
function assertMounted(element) {
    if (!element.isConnected) throw new Error('[exportCapture] Export target is not mounted.');
}

/**
 * A hidden (display:none) root would rasterize to a blank tile.
 * @param {HTMLElement} root
 * @returns {boolean} Whether it has a non-zero box.
 */
function isRendered(root) {
    const rect = root.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/**
 * @param {HTMLElement} liveRoot - The on-screen tree, read for current control values.
 * @param {(live: Element) => Element|null} cloneOf - Maps a live element to its copy in the clone.
 */
function syncFormControlState(liveRoot, cloneOf) {
    liveRoot.querySelectorAll('select, input, textarea').forEach((live) => {
        const target = cloneOf(live);
        if (!target) return;
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

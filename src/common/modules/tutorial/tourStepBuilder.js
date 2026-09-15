/**
 * Tour step derivation — turns a rendered view's module tree into an ordered
 * list of TutorialController steps.
 *
 * A tour step needs an anchor, a title and body copy. The module tree already
 * declares all three (`module.element`, `module.glossaryKey` → the glossary
 * entry's `title` / `tutorial`), so the default tour for any view is
 * derived rather than hand-written:
 *
 *     header step  →  view's modules that have tutorial copy  →  shared tail cards
 *
 * A step therefore appears the moment a glossary entry gains `tutorial` copy,
 * and a conditionally-registered module (e.g. the student-view spider chart)
 * simply contributes no step when it is absent — a hand-written list would
 * leave a broken anchor there instead.
 *
 * Anchors stay lazy (`getAnchor` closes over the module, not its element) so
 * that Tabulator header re-renders and chart redraws don't strand element refs.
 */

import { resolveGlossaryTutorial } from './glossaryTutorial.js';

/** Header element — the anchor for a view's `header` step. */
const HEADER_SELECTOR = '.header-module';

/**
 * Query one element as an HTMLElement, tolerating a missing root.
 * @param {ParentNode|null} root - Where to search; a nullish root yields null rather than throwing.
 * @param {string} selector - Selector to match.
 * @returns {HTMLElement|null} The first match, already cast, or null.
 */
function query(root, selector) {
    return /** @type {HTMLElement|null} */ (root?.querySelector(selector) ?? null);
}

/**
 * Closing cards appended to every tour, authored once under
 * `general.tour` for all three dashboards. Their anchors are shell-level rather than
 * module-level, so they belong here and not to any single view. A card whose
 * anchor is absent on the current view (e.g. export on the welcome view) is
 * dropped instead of rendering a centered card about a missing button.
 * @type {Array<{key: string, getAnchor: (viewEl: HTMLElement|null) => (HTMLElement|null)}>}
 */
const TAIL_CARDS = [
    {
        key: 'hover-help',
        getAnchor: (viewEl) => query(viewEl, '[data-glossary-key]'),
    },
    {
        key: 'export-help',
        getAnchor: (viewEl) => query(viewEl, '[data-header-action-button="export-trigger"]'),
    },
    {
        key: 'notes-help',
        getAnchor: () => query(document, '[data-header-action-button="notes-toggle"]'),
    },
];

/**
 * Build the ordered steps for a view's guided walkthrough.
 * @param {import('../baseViewModule.js').BaseViewModule} view - The rendered view module
 * @param {object} [options] - Which glossary entries supply the header card and the shared closing cards.
 * @param {object | null} [options.glossaryData] - Glossary JSON root
 * @param {string|null} [options.headerPath] - Glossary path of the view header (`<app>.<view>.header`)
 * @returns {Array<import('./tutorialController.js').TourStep>} The ordered steps: the header card, the module steps in document order, then the shared closing cards.
 */
export function buildTourSteps(view, { glossaryData = null, headerPath = null } = {}) {
    if (!view) return [];

    const steps = [];

    const header = resolveGlossaryTutorial(glossaryData, headerPath);
    if (header) {
        steps.push({
            getAnchor: () => query(document, HEADER_SELECTOR),
            title: header.title,
            html: header.html,
        });
    }

    steps.push(...sortByDomOrder(collectModuleSteps(view, glossaryData)));

    // One optional hook per view, for steps the module tree cannot declare
    // (see EnClassViewModule: a toolbar button and a modal that is closed
    // during the tour). Runs before the tail cards so a view can only
    // rearrange its own steps.
    const customized = view.customizeTourSteps?.(steps) ?? steps;

    return [...customized, ...buildTailSteps(glossaryData, view.element)];
}

/**
 * Depth-first walk of the view's registered module tree, emitting a step for
 * every module whose `glossaryKey` resolves to an entry with tutorial copy.
 * Typed loosely because it walks the tree from outside the class: only
 * `childModules`, `glossaryKey`, `element` and `getOption` are read.
 * @param {any} module - The view or module whose children are walked; only `childModules`, `glossaryKey`, `element` and `getOption` are read.
 * @param {object | null} glossaryData - The assembled glossary tree, or null before it loads.
 * @returns {Array<import('./tutorialController.js').TourStep>} One step per module that has tutorial copy, in the order the tour visits them.
 */
function collectModuleSteps(module, glossaryData) {
    /** @type {Array<import('./tutorialController.js').TourStep>} */
    const steps = [];

    module.childModules.forEach((/** @type {any} */ child) => {
        const tutorial = resolveGlossaryTutorial(
            glossaryData,
            child.glossaryKey ?? null,
            child.getOption('glossaryReplacements') ?? null,
        );
        if (tutorial) {
            steps.push({
                getAnchor: () => child.element ?? null,
                title: tutorial.title,
                html: tutorial.html,
            });
        }
        steps.push(...collectModuleSteps(child, glossaryData));
    });

    return steps;
}

/**
 * Order derived steps by document position rather than by registration order.
 *
 * Registration order is the order a view happens to construct its children in,
 * which is driven by data dependencies (the class view registers its chart
 * before its table so the chart is listening when the table syncs) and does not
 * match reading order in every view — the overview registers its centre chart
 * first, the student view its right-hand column first. Document order is the
 * reading order the tour should follow, and it also keeps a module ahead of its
 * own nested children.
 *
 * Only the steps that actually resolve an anchor take part in the comparison —
 * a step whose module never mounted keeps its slot. Comparing those by "0"
 * instead would make the comparator non-transitive, which lets the sort return
 * an arbitrary order for the whole list, not just for the odd step out.
 * @template {{getAnchor?: () => (HTMLElement|null)}} T
 * @param {T[]} steps - The derived steps, in registration order.
 * @returns {T[]} The same steps in reading order; a step whose module never mounted keeps its original slot.
 */
function sortByDomOrder(steps) {
    /** @type {Array<{index: number, el: HTMLElement, step: T}>} */
    const anchored = [];
    steps.forEach((step, index) => {
        const el = step.getAnchor?.() ?? null;
        if (el) anchored.push({ index, el, step });
    });

    const ordered = anchored.slice().sort((a, b) => {
        const position = a.el.compareDocumentPosition(b.el);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return a.index - b.index;
    });

    const result = steps.slice();
    anchored.forEach(({ index }, position) => {
        result[index] = ordered[position].step;
    });
    return result;
}

/**
 * Resolve the shared closing cards for the current view, dropping any whose
 * anchor does not exist here.
 * @param {object | null} glossaryData - The assembled glossary tree, or null before it loads.
 * @param {HTMLElement|null} viewEl - The rendered view, used to test whether each card’s anchor exists here.
 * @returns {Array<import('./tutorialController.js').TourStep>} The shared closing cards whose anchor exists in this view.
 */
function buildTailSteps(glossaryData, viewEl) {
    return TAIL_CARDS.flatMap(({ key, getAnchor }) => {
        if (!getAnchor(viewEl)) return [];

        const tutorial = resolveGlossaryTutorial(glossaryData, `general.tour.${key}`);
        if (!tutorial) return [];

        return [
            {
                getAnchor: () => getAnchor(viewEl),
                title: tutorial.title,
                html: tutorial.html,
            },
        ];
    });
}

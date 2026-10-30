/**
 * Tour step derivation — turns a rendered view's module tree into an ordered
 * list of TutorialController steps.
 *
 * A tour step needs an anchor, a title and body copy. The module tree already
 * declares all three (the module element, `module.glossaryKey` → the glossary
 * entry's `title` / `tutorial`), so the default tour for any view is
 * derived rather than hand-written:
 *
 *     header step  →  view's modules that have tutorial copy  →  the view's extras
 *     →  shared tail cards
 *
 * A step appears once a glossary entry gains `tutorial` copy, and a module a view
 * renders only sometimes (e.g. the student-view spider chart) contributes no step
 * when it is absent.
 */

import { ContentModule, queryEl } from '@tba3/module-base';
import { tourStep } from './glossaryTutorial.js';

/** Header element — the anchor for a view's `header` step. */
const HEADER_SELECTOR = '.header-module';

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
        getAnchor: (viewEl) => shownTerm(viewEl),
    },
    {
        key: 'export-help',
        getAnchor: (viewEl) => queryEl(viewEl, '[data-header-action-button="export-trigger"]'),
    },
    {
        key: 'notes-help',
        getAnchor: () => queryEl(document, '[data-header-action-button="notes-toggle"]'),
    },
];

/**
 * Build the ordered steps for a view's guided walkthrough.
 * @param {import('../baseViewModule.js').BaseViewModule} view - The rendered view module
 * @param {import('./glossaryTutorial.js').TourCopy} copy - The glossary the cards are read from and annotated with.
 * @param {string} headerPath - Glossary path of the view header (`<app>.<view>.header`)
 * @param {import('@tba3/module-base/glossary').GlossaryReplacements|null} headerTokens - The app's header tokens (`{{Fach}}`), filled into the header step as the header fills them.
 * @returns {Array<import('./tutorialController.js').TourStep>}
 */
export function buildTourSteps(view, copy, headerPath, headerTokens) {
    const header = tourStep(copy, headerPath, () => queryEl(document, HEADER_SELECTOR), {
        replacements: headerTokens,
    });
    // Steps the module tree cannot declare: an anchor that is not a module, or
    // content whose element does not exist while the tour runs.
    const extras = view.tourExtras.map(({ glossaryPath, getAnchor }) =>
        tourStep(copy, glossaryPath, getAnchor),
    );

    return [
        header,
        ...collectModuleSteps(view, copy),
        ...extras,
        ...buildTailSteps(copy, view),
    ].filter((step) => step !== null);
}

/**
 * Depth-first walk of the view's rendered module tree, emitting one step per card
 * content with tutorial copy. Two cards with one entry and the same replacements are the
 * same content in two layout modes, so the tour says it once, at the place of the card
 * the reader sees now, else the first; one entry filled per domain is two cards.
 * @param {import('../baseViewModule.js').BaseViewModule} view
 * @param {import('./glossaryTutorial.js').TourCopy} copy
 * @returns {Array<import('./tutorialController.js').TourStep>} One step per content that has tutorial copy.
 */
function collectModuleSteps(view, copy) {
    const cards = cardsOf(view);
    /** @type {Map<string, Array<ContentModule<any>>>} */
    const cardsByContent = new Map();
    for (const card of cards) {
        const content = contentOf(card);
        const twins = cardsByContent.get(content);
        if (twins) twins.push(card);
        else cardsByContent.set(content, [card]);
    }
    const placed = new Set([...cardsByContent.values()].map(firstShown));
    return cards
        .filter((card) => placed.has(card))
        .map((card) => {
            const content = contentOf(card);
            // Resolved on every placement, not fixed to this card: a layout switch while
            // the tour runs hides it and shows its twin in the other mode.
            return tourStep(
                copy,
                /** @type {string} */ (card.glossaryKey),
                () => shownCard(view, content),
                { replacements: card.options.glossaryReplacements ?? null },
            );
        })
        .filter((step) => step !== null);
}

/**
 * @param {ContentModule<any>} card
 * @returns {string} What the card shows: its entry and the values filled into it.
 */
function contentOf(card) {
    return JSON.stringify([card.glossaryKey, card.options.glossaryReplacements ?? null]);
}

/**
 * @param {import('../baseViewModule.js').BaseViewModule} view
 * @returns {Array<ContentModule<any>>} The view's cards that carry a glossary entry, in document order; only a card carries one.
 */
function cardsOf(view) {
    return view.descendants().filter(
        /**
         * @param {import('@tba3/module-base').BaseModule<any>} module
         * @returns {module is ContentModule<any>} Whether it is a card with an entry.
         */
        (module) => module instanceof ContentModule && Boolean(module.glossaryKey),
    );
}

/**
 * @param {import('../baseViewModule.js').BaseViewModule} view
 * @param {string} content - What the cards show (`contentOf`).
 * @returns {ContentModule<any>|null} The card with that content the reader sees now, else the first; none once the view holds none.
 */
function shownCard(view, content) {
    return firstShown(cardsOf(view).filter((card) => contentOf(card) === content));
}

/**
 * @param {HTMLElement|null} viewEl - The rendered view.
 * @returns {HTMLElement|null} The first glossary term the reader sees now, else the first; none once the view holds none.
 */
function shownTerm(viewEl) {
    return firstShown(
        /** @type {Array<HTMLElement>} */ ([
            ...(viewEl?.querySelectorAll('[data-glossary-key]') ?? []),
        ]),
    );
}

/**
 * @template {Element} T
 * @param {T[]} elements
 * @returns {T|null} The one the reader sees now, else the first; none for none.
 */
function firstShown(elements) {
    return elements.find((element) => element.checkVisibility()) ?? elements[0] ?? null;
}

/**
 * Resolve the shared closing cards for the current view.
 * @param {import('./glossaryTutorial.js').TourCopy} copy
 * @param {HTMLElement|null} viewEl - The rendered view, used to test whether each card’s anchor exists here.
 * @returns {Array<import('./tutorialController.js').TourStep>} Only those whose anchor exists in this view.
 */
function buildTailSteps(copy, viewEl) {
    return TAIL_CARDS.flatMap(({ key, getAnchor }) => {
        if (!getAnchor(viewEl)) return [];
        return tourStep(copy, `general.tour.${key}`, () => getAnchor(viewEl)) ?? [];
    });
}

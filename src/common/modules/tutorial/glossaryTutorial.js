/**
 * Single resolver for glossary tutorial content.
 *
 * Every tour card (derived module steps, header steps, the shared closing cards and
 * a view's extras) is built here, so the `tutorial` field is annotated (interactive
 * glossary popups) and token-replaced once.
 */

import { applyMarkupTokens, applyTemplateTokens, resolveDotPath } from '@tba3/module-base/glossary';

/**
 * Where a tour's copy comes from: the assembled glossary tree its entries are read from,
 * and the app's annotator that turns their terms into glossary popups.
 * @typedef {object} TourCopy
 * @property {import('@tba3/module-base/glossary').GlossaryTree | null} glossaryData
 * @property {import('@tba3/modules/context').GlossaryAnnotator} glossary
 */

/**
 * Build the tour card a glossary entry describes.
 * @param {TourCopy} copy
 * @param {string|null} path - Dot-notation entry path, e.g. 'en.group.lollipop'
 * @param {(() => (HTMLElement|null)) | undefined} getAnchor - The card's anchor; omitted for a card that is centred on purpose.
 * @param {{replacements?: import('@tba3/module-base/glossary').GlossaryReplacements | null}} [options] - `{{ token }}` replacements.
 * @returns {import('./tutorialController.js').TourStep|null} null when the path is missing or the entry carries no tutorial copy.
 */
export function tourStep(copy, path, getAnchor, { replacements = null } = {}) {
    const entry = resolveDotPath(copy.glossaryData, path);
    if (!entry || typeof entry !== 'object') return null;

    const tutorial = entry.tutorial;
    if (typeof tutorial !== 'string' || !tutorial.trim()) return null;

    return {
        ...(getAnchor ? { getAnchor } : {}),
        // The title renders as text; the tutorial copy is markup, so the values (a group
        // name from the payload) go in escaped. The title is trimmed as the header trims
        // it: a token still empty (a header token before the data lands) leaves no space.
        title: applyTemplateTokens(entry.title ?? '', replacements).trim(),
        html: copy.glossary.annotateHTML(applyMarkupTokens(tutorial, replacements)),
    };
}

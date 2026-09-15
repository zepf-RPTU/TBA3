/**
 * Single resolver for glossary tutorial content.
 *
 * Every tour card — derived module steps, header steps, the shared closing
 * cards and per-view overrides — resolves its copy here, so the `tutorial`
 * field is annotated (interactive glossary popups) and template-token replaced
 * exactly once, in one place.
 *
 * Popups inside a card work because the annotator's term index is built only
 * from `<namespace>.shared.element_texts`, popup hover is delegated from the
 * body, and `--z-glossary` paints above the tour overlay's `--z-modal`.
 */

import { applyTemplateTokens, resolveDotPath } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';

/**
 * Resolve a glossary entry into tour-card content.
 * @param {object | null} glossaryData - Glossary JSON root
 * @param {string|null} path - Dot-notation entry path, e.g. 'en.class.lollipop'
 * @param {object | null} [replacements] - Optional `{{ token }}` replacements
 * @returns {{title: string, html: string}|null}
 *          null when the path is missing or the entry carries no tutorial copy.
 */
export function resolveGlossaryTutorial(glossaryData, path, replacements = null) {
    const entry = resolveDotPath(glossaryData, path);
    if (!entry || typeof entry !== 'object') return null;

    const tutorial = entry.tutorial;
    if (typeof tutorial !== 'string' || !tutorial.trim()) return null;

    const resolveText = (text) =>
        typeof text === 'string' ? applyTemplateTokens(text, replacements) : '';

    return {
        title: resolveText(entry.title ?? ''),
        html: glossaryAnnotator.annotateHTML(resolveText(tutorial)),
    };
}

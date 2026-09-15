/**
 * The Materialien templates' author placeholders (`[kaum; moderat; deutlich]`): each is
 * resolved to one phrasing, deterministically from a seed, so a page reads the same on
 * every render and differently from the next page. The placeholder markup stays
 * visible so an unfilled slot is recognisable as one.
 */

import { escapeHtml } from '@tba3/module-base/utils/escapeHtml.js';

const TEMPLATE_CHOICE_PLACEHOLDER_PATTERN =
    /<span class="material-template-placeholder">\[([^\]]*;[^\]]*)\]<\/span>/g;
const LINKED_CLASS_VARIATION_PLACEHOLDER_PATTERN =
    /<span class="material-template-placeholder">\[kaum; moderat; deutlich\]<\/span>([\s\S]*?)<span class="material-template-placeholder">\[eher homogen; eher heterogen; heterogen\]<\/span>/;
const CLASS_VARIATION_OPTIONS = ['kaum', 'moderat', 'deutlich'];
const CLASS_HOMOGENEITY_BY_VARIATION = new Map([
    ['kaum', 'eher homogen'],
    ['moderat', 'eher heterogen'],
    ['deutlich', 'heterogen'],
]);

/**
 * A deterministic index from a seed string, so a template's phrasing stays the same
 * across re-renders instead of shuffling under the reader.
 * @param {string} seed - The seed; the same seed always yields the same index.
 * @param {number} modulo - Number of choices.
 * @returns {number} An index in range, `0` for a non-positive choice count.
 */
function getStableChoiceIndex(seed, modulo) {
    if (!Number.isInteger(modulo) || modulo <= 0) {
        return 0;
    }

    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0) % modulo;
}

/**
 * Pick one phrasing from a list, deterministically for a given seed.
 * @param {Array<*>} [options] - The candidate strings; blanks are ignored.
 * @param {string} [seed] - What the choice is keyed to, e.g. a class name.
 * @returns {string} The chosen string, empty when the list holds none.
 */
function pickStableValue(options = [], seed = '') {
    const values = (Array.isArray(options) ? options : [])
        .map((option) => (typeof option === 'string' ? option.trim() : ''))
        .filter(Boolean);

    if (values.length === 0) {
        return '';
    }

    return values[getStableChoiceIndex(`${seed}|${values.join('|')}`, values.length)];
}

/**
 * Render a value as a visible template placeholder, so an unfilled slot reads as
 * unfilled rather than as a real figure.
 * @param {string} value - The placeholder text.
 * @returns {string} The escaped placeholder markup.
 */
function renderTemplatePlaceholderValue(value) {
    return `<span class="material-template-placeholder">${escapeHtml(value)}</span>`;
}

/**
 * Replace every `[a; b; c]` author placeholder in a template with one deterministic
 * choice, so a page's phrasing is stable across renders and varies between pages.
 * @param {string} markup - The template HTML.
 * @param {string} [seed] - What the choices are keyed to, e.g. subject and page.
 * @returns {string} The markup with every choice made.
 */
export function resolveTemplateChoicePlaceholders(markup, seed = '') {
    if (typeof markup !== 'string' || markup.length === 0) {
        return '';
    }

    const markupWithLinkedChoices = resolveLinkedTemplateChoicePlaceholders(markup, seed);
    let choiceIndex = 0;

    return markupWithLinkedChoices.replace(
        TEMPLATE_CHOICE_PLACEHOLDER_PATTERN,
        (_match, rawOptions) => {
            const options = rawOptions
                .split(';')
                .map((option) => option.trim())
                .filter(Boolean);
            const choiceSeed = `${seed}|choice:${choiceIndex}`;
            choiceIndex += 1;
            return options.length >= 2
                ? renderTemplatePlaceholderValue(pickStableValue(options, choiceSeed))
                : _match;
        },
    );
}

/**
 * The one linked pair: the class-variation choice decides the homogeneity wording that
 * follows it, so the two cannot contradict each other.
 * @param {string} markup - The template HTML.
 * @param {string} [seed] - What the choice is keyed to.
 * @returns {string} The markup with the pair resolved.
 */
function resolveLinkedTemplateChoicePlaceholders(markup, seed = '') {
    return markup.replace(LINKED_CLASS_VARIATION_PLACEHOLDER_PATTERN, (_match, betweenMarkup) => {
        const classVariationChoice = pickStableValue(
            CLASS_VARIATION_OPTIONS,
            `${seed}|linked-class-variation`,
        );
        const homogeneityChoice =
            CLASS_HOMOGENEITY_BY_VARIATION.get(classVariationChoice) ?? 'eher homogen';

        return `${renderTemplatePlaceholderValue(classVariationChoice)}${betweenMarkup}${renderTemplatePlaceholderValue(homogeneityChoice)}`;
    });
}

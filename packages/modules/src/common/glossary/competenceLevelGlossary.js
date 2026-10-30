/**
 * Bridges the competence-level registry (`CompetenceLevelPalette`) to the glossary
 * popups.
 *
 * The texts explaining a Kompetenzstufe travel with the data (per level on
 * `competenceLevels[].description`, per scale on the `competenceScaleDescription`
 * property), so the client needs to know no level vocabulary. This module re-shapes
 * what the payload carries into the entry shape `tooltipService` renders.
 */

import { GLOSSARY_KEYS } from './glossaryKeys.js';

/**
 * Glossary keys whose body describes the competence-scale model, not one band.
 *
 * Their aliases ("Kompetenzstufe", "GER-Stufe") stay in `glossary.json`: they are the
 * dashboard's own wording, and the payload carries no alias metadata. Only the body
 * comes from the payload, since static copy enumerating the bands would be wrong for
 * every scale whose bands differ.
 *
 * `kompetenzstufenverteilung` is not here: it explains how the stacked-bar chart is
 * read, which the payload knows nothing about.
 */
const SCALE_CONCEPT_KEYS = [GLOSSARY_KEYS.COMPETENCE_LEVEL, GLOSSARY_KEYS.GER];

/**
 * Build the payload-supplied glossary entries for the registered competence scales.
 *
 * Call once the scales are registered, and hand the result to the app's
 * `GlossaryAnnotator#registerPayloadEntries`.
 * @param {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @returns {Map<string, {title?: string, body: string}>}
 *          Empty when the payload carried no descriptions at all
 */
export function buildCompetenceLevelGlossaryEntries(palette) {
    /** @type {Map<string, {title?: string, body: string}>} */
    const entries = new Map();

    for (const [key, { name, description }] of palette.getLevelDescriptions()) {
        entries.set(key, { title: name, body: description });
    }

    // One page can show several scales (one per subject, side by side), and the popup describes all of them: `kompetenzstufe`/`ger` are
    // reached by matching a word in running prose, which carries no scale context, and
    // nothing in the payload says which ladder is "the GER one". Both keys share one
    // body.
    const scaleBody = composeScaleBody(palette.getScaleDescriptions());
    if (scaleBody) {
        for (const key of SCALE_CONCEPT_KEYS) entries.set(key, { body: scaleBody });
    }

    return entries;
}

/**
 * Join several scales' prose into one popup body, printing shared prose once.
 *
 * A scale description is prose on how the model works, followed by the scale-specific
 * `<ul>` of bands. The server emits the same prose for every subject, so descriptions
 * are grouped by it: the prose once, the ladders under it, separated by a rule.
 * Descriptions whose prose differs each keep their own block.
 * @param {string[]} descriptions Already deduplicated by `CompetenceLevelPalette#getScaleDescriptions`
 * @returns {string} Empty when `descriptions` is empty
 */
function composeScaleBody(descriptions) {
    /** @type {Map<string, string[]>} prose → the ladders introduced by it */
    const byProse = new Map();

    for (const text of descriptions) {
        // Last, not first: the bands are the trailing list even when the prose holds
        // one. Without a `<ul>` the whole text is prose and its own block.
        const at = text.lastIndexOf('<ul>');
        const prose = at === -1 ? text : text.slice(0, at);
        const ladder = at === -1 ? '' : text.slice(at);

        const ladders = byProse.get(prose);
        if (ladders) ladders.push(ladder);
        else byProse.set(prose, [ladder]);
    }

    return [...byProse].map(([prose, ladders]) => prose + ladders.join('<hr>')).join('<hr>');
}

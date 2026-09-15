/**
 * CompetenceLevelGlossary — bridges the competence-level registry to the glossary popups.
 *
 * The texts explaining a Kompetenzstufe used to live in `src/common/glossary/glossary.json`, keyed by
 * level label. That only worked for the two vocabularies the client happened to enumerate
 * (`a1`…`c1`, `KSI`…`KSV`); the states also ship `k.h.N.`, `KS 1`…`KS 5`, `KS 1a`/`KS 1b`,
 * `MiStd--`…`OptStd`, `A1.1`…`B1.2` and `Ia`/`Ib`, none of which had any text at all.
 *
 * They now travel with the data — per level on `competenceLevels[].description`, per scale
 * on the `competenceScaleDescription` property — so the client no longer needs to know any
 * vocabulary. This module only re-shapes what the payload already carries into the entry
 * shape `tooltipService` renders.
 * @see src/common/services/competenceLevelPalette.js — where the payload is registered
 */

import { getLevelDescriptions, getScaleDescriptions } from '../services/competenceLevelPalette.js';

/**
 * Glossary keys whose body describes the competence-scale *model* rather than one band.
 *
 * These stay in `glossary.json` because their aliases ("Kompetenzstufe", "GER-Stufe") are
 * the dashboard's own wording — the payload carries no alias metadata, and the words
 * appear in column titles the client writes itself. Only the body moves: the static copy
 * enumerated "KS V (Optimalstandard) … KS I (unter Mindeststandard)" inline and was
 * therefore wrong on every state that does not use roman numerals.
 *
 * `KS_distribution` is deliberately **not** here. It explains the stacked-bar chart — how
 * a distribution is read — which is the client's own subject and something the payload
 * knows nothing about. Its copy names no band count for the same reason — the scales run
 * from five to seven bands, and the count is not something the chart explanation needs.
 */
const SCALE_CONCEPT_KEYS = ['KS', 'ger'];

/**
 * Build the payload-supplied glossary entries for the registered competence scales.
 *
 * Call after `registerCompetenceLevelScales`, and hand the result to
 * `glossaryAnnotator.registerPayloadEntries`.
 * @returns {Map<string, {title?: string, body: string}>}
 *          Empty when the payload carried no descriptions at all
 */
export function buildCompetenceLevelGlossaryEntries() {
    /** @type {Map<string, {title?: string, body: string}>} */
    const entries = new Map();

    for (const [key, { name, description }] of getLevelDescriptions()) {
        entries.set(key, { title: name, body: description });
    }

    // One page can show several scales — SL renders Deutsch, Englisch and Französisch
    // side by side — and the popup deliberately describes all of them. It cannot do
    // otherwise: `KS`/`ger` are reached by matching a word in running prose, which carries
    // no scale context, and a scale's only identity is its level sequence — nothing in the
    // payload says which ladder is "the GER one". The reader disambiguates instead, and
    // can: the level names below are the ones shown in the column they hovered. Both keys
    // therefore share one body by design.
    const scaleBody = composeScaleBody(getScaleDescriptions());
    if (scaleBody) {
        for (const key of SCALE_CONCEPT_KEYS) entries.set(key, { body: scaleBody });
    }

    return entries;
}

/**
 * Join several scales' prose into one popup body, printing shared prose once.
 *
 * A scale description is boilerplate — how the model works — wrapped around the one
 * scale-specific part, the `<ul>` of bands. The server emits the same boilerplate for
 * every subject, so on a multi-scale page a plain join repeats two identical paragraphs
 * above each ladder. Grouping by the prose prints them once and lists the ladders under
 * them, separated by a rule.
 *
 * Falls back to one block per description when the prose does differ, which is what the
 * server sent until it stopped varying the intro by subject.
 * @param {string[]} descriptions Already deduplicated by `getScaleDescriptions`
 * @returns {string} Empty when `descriptions` is empty
 */
function composeScaleBody(descriptions) {
    /** @type {Map<string, string[]>} prose → the ladders introduced by it */
    const byProse = new Map();

    for (const text of descriptions) {
        // Last, not first: if a state ever wraps a list into its prose, the bands are
        // still the trailing one. No `<ul>` at all leaves the whole text as prose, which
        // groups it with nothing and emits it as its own block.
        const at = text.lastIndexOf('<ul>');
        const prose = at === -1 ? text : text.slice(0, at);
        const ladder = at === -1 ? '' : text.slice(at);

        const ladders = byProse.get(prose);
        if (ladders) ladders.push(ladder);
        else byProse.set(prose, [ladder]);
    }

    return [...byProse].map(([prose, ladders]) => prose + ladders.join('<hr>')).join('<hr>');
}

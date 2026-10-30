/**
 * The competence-level scales come from the data: they are registered with the app's
 * palette, and their glossary entries with its glossary, as the documents carrying them
 * land in a `DocumentStore` (its `onLand` hook): `competence-levels.json` carries the
 * competence-level scales, `items.json` (where an app has one) the Aufgabenniveau scale.
 */

import { publishPaletteTokens } from './paletteTokens.js';
import { buildCompetenceLevelGlossaryEntries } from '../glossary/competenceLevelGlossary.js';

/**
 * The `onLand` hook for one app's store, run before anything renders.
 * @param {Pick<import('../context/moduleContext.js').ModuleContext, 'palette' | 'glossary'>} context - The app's context; its palette receives the scales, its glossary their texts.
 * @returns {(landed: Partial<import('../data/documentSchemas.js').Documents>) => void}
 */
export function createDatasetRegistration({ palette, glossary }) {
    return (landed) => {
        const levels = landed['competence-levels.json'];
        if (levels) palette.registerCompetenceLevelScales(levels);
        const items = landed['items.json'];
        if (items) palette.registerItemCompetenceScales(items);
        if (levels || items) {
            glossary.registerPayloadEntries(buildCompetenceLevelGlossaryEntries(palette));
            // The registered scales decide every level's colour; a batch without a
            // scale changes no token.
            publishPaletteTokens();
        }
    };
}

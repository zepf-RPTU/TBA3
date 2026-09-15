/**
 * SL glossary barrel — assembles the tree the SL app consumes.
 *
 * Module-owned help text lives in a `<owner>.glossary.json` beside the module
 * that owns it; this file is the index that says where each fragment mounts.
 * It holds imports and dot-paths only — never prose, so the German text stays in
 * the JSON files a content author edits.
 *
 * Views are lazy-loaded but `sidebarModule` and `slHeaderControls.js` read
 * glossary entries at startup, so every fragment is imported eagerly here rather
 * than registered by the module that owns it.
 *
 * Two bases carry what has no single owner: the package's `glossary.json` (the shared term
 * vocabulary and the `general.*` entries package cards read) and tba3's own
 * `src/common/app/shellGlossary.json` (tour, notes, report, export and splash copy). The
 * package's cards bring their fragments through `<app>GlossaryFragments`, which fixes where
 * they mount; this file mounts only tba3's own view fragments.
 */

import { assembleGlossary, sharedGlossary } from '@tba3/modules/glossary';
import { slGlossaryFragments } from '@tba3/modules/glossary/sl';
import shellGlossary from '../common/app/shellGlossary.json' with { type: 'json' };
import comparisonGlossary from './views/comparison.glossary.json' with { type: 'json' };
import longitudinalGlossary from './views/longitudinal.glossary.json' with { type: 'json' };
import materialGlossary from './views/material.glossary.json' with { type: 'json' };
import slNavCardsGlossary from './slNavCards.glossary.json' with { type: 'json' };
import overviewGlossary from './views/overview.glossary.json' with { type: 'json' };
import summaryGlossary from './views/summary.glossary.json' with { type: 'json' };
import welcomeGlossary from './views/welcome.glossary.json' with { type: 'json' };

export const slGlossary = assembleGlossary([sharedGlossary, shellGlossary], {
    ...slGlossaryFragments,
    'sl.comparison': comparisonGlossary,
    'sl.longitudinal': longitudinalGlossary,
    'sl.material': materialGlossary,
    'sl.nav-cards': slNavCardsGlossary,
    'sl.overview': overviewGlossary,
    'sl.summary': summaryGlossary,
    'sl.welcome': welcomeGlossary,
});

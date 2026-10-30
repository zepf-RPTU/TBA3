/**
 * SL glossary barrel — mounts tba3's own view fragments beside the package's
 * `slGlossaryFragments`, over two bases: the package's shared vocabulary and
 * `shellGlossary.json` (tour, notes, report, export and splash copy). Imports and
 * dot-paths only; the German prose stays in the JSON files a content author edits.
 *
 * The shell reads glossary entries at startup, before any lazy-loaded view, so every
 * fragment is imported eagerly here rather than registered by the module that owns it.
 */

import { assembleGlossary, sharedGlossary } from '@tba3/modules/glossary';
import { slGlossaryFragments } from '@tba3/modules/glossary/sl';
import shellGlossary from '../common/app/shellGlossary.json' with { type: 'json' };
import slAppGlossary from './slApp.glossary.json' with { type: 'json' };
import comparisonGlossary from './views/comparison.glossary.json' with { type: 'json' };
import longitudinalGlossary from './views/longitudinal.glossary.json' with { type: 'json' };
import materialGlossary from './views/material.glossary.json' with { type: 'json' };
import slNavCardsGlossary from './slNavCards.glossary.json' with { type: 'json' };
import detailsGlossary from './views/details.glossary.json' with { type: 'json' };
import summaryGlossary from './views/summary.glossary.json' with { type: 'json' };
import matrixGlossary from './views/matrix.glossary.json' with { type: 'json' };

export const slGlossary = assembleGlossary([sharedGlossary, shellGlossary], {
    ...slGlossaryFragments,
    'sl.app': slAppGlossary,
    'sl.comparison': comparisonGlossary,
    'sl.longitudinal': longitudinalGlossary,
    'sl.material': materialGlossary,
    'sl.nav-cards': slNavCardsGlossary,
    'sl.details': detailsGlossary,
    'sl.summary': summaryGlossary,
    'sl.matrix': matrixGlossary,
});

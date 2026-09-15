/**
 * EN glossary barrel — assembles the tree the EN app consumes.
 *
 * Module-owned help text lives in a `<owner>.glossary.json` beside the module
 * that owns it; this file is the index that says where each fragment mounts.
 * It holds imports and dot-paths only — never prose, so the German text stays in
 * the JSON files a content author edits.
 *
 * Views are lazy-loaded but `sidebarModule` and `enHeaderControls.js` read
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
import { enGlossaryFragments } from '@tba3/modules/glossary/en';
import shellGlossary from '../common/app/shellGlossary.json' with { type: 'json' };
import classGlossary from './views/class.glossary.json' with { type: 'json' };
import itemGlossary from './views/item.glossary.json' with { type: 'json' };
import navCardsGlossary from './enNavCards.glossary.json' with { type: 'json' };
import overviewGlossary from './views/overview.glossary.json' with { type: 'json' };
import studentGlossary from './views/student.glossary.json' with { type: 'json' };
import welcomeGlossary from './views/welcome.glossary.json' with { type: 'json' };

export const enGlossary = assembleGlossary([sharedGlossary, shellGlossary], {
    ...enGlossaryFragments,
    'en.class': classGlossary,
    'en.item': itemGlossary,
    'en.nav-cards': navCardsGlossary,
    'en.overview': overviewGlossary,
    'en.student': studentGlossary,
    'en.welcome': welcomeGlossary,
});

/**
 * EN glossary barrel — mounts tba3's own view fragments beside the package's
 * `enGlossaryFragments`, over two bases: the package's shared vocabulary and
 * `shellGlossary.json` (tour, notes, report, export and splash copy). Imports and
 * dot-paths only; the German prose stays in the JSON files a content author edits.
 *
 * The shell reads glossary entries at startup, before any lazy-loaded view, so every
 * fragment is imported eagerly here rather than registered by the module that owns it.
 */

import { assembleGlossary, sharedGlossary } from '@tba3/modules/glossary';
import { EN_GLOSSARY_TERMS, enGlossaryFragments } from '@tba3/modules/glossary/en';
import shellGlossary from '../common/app/shellGlossary.json' with { type: 'json' };
import groupGlossary from './views/group.glossary.json' with { type: 'json' };
import headerGlossary from './enHeader.glossary.json' with { type: 'json' };
import itemGlossary from './views/item.glossary.json' with { type: 'json' };
import navCardsGlossary from './enNavCards.glossary.json' with { type: 'json' };
import overviewGlossary from './views/overview.glossary.json' with { type: 'json' };
import studentGlossary from './views/student.glossary.json' with { type: 'json' };
import welcomeGlossary from './views/welcome.glossary.json' with { type: 'json' };

export const enGlossary = assembleGlossary(
    [sharedGlossary, shellGlossary],
    {
        ...enGlossaryFragments,
        'en.group': groupGlossary,
        'en.header': headerGlossary,
        'en.item': itemGlossary,
        'en.nav-cards': navCardsGlossary,
        'en.overview': overviewGlossary,
        'en.student': studentGlossary,
        'en.welcome': welcomeGlossary,
    },
    // The scale term (`{{Stufe}}` …), one value for every card and the code's labels.
    { terms: EN_GLOSSARY_TERMS },
);

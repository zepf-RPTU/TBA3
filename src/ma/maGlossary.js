/**
 * MA glossary barrel — mounts tba3's own view fragments beside the package's
 * `maGlossaryFragments`, over two bases: the package's shared vocabulary and
 * `shellGlossary.json` (tour, notes, report, export and splash copy). Imports and
 * dot-paths only; the German prose stays in the JSON files a content author edits.
 *
 * The shell reads glossary entries at startup, before any lazy-loaded view, so every
 * fragment is imported eagerly here rather than registered by the module that owns it.
 */

import { assembleGlossary, sharedGlossary } from '@tba3/modules/glossary';
import { maGlossaryFragments } from '@tba3/modules/glossary/ma';
import shellGlossary from '../common/app/shellGlossary.json' with { type: 'json' };
import groupGlossary from './views/group.glossary.json' with { type: 'json' };
import headerGlossary from './maHeader.glossary.json' with { type: 'json' };
import helpGlossary from './views/help.glossary.json' with { type: 'json' };
import itemGlossary from './views/item.glossary.json' with { type: 'json' };
import navCardsGlossary from './maNavCards.glossary.json' with { type: 'json' };
import overviewGlossary from './views/overview.glossary.json' with { type: 'json' };
import studentGlossary from './views/student.glossary.json' with { type: 'json' };
import welcomeGlossary from './views/welcome.glossary.json' with { type: 'json' };

export const maGlossary = assembleGlossary([sharedGlossary, shellGlossary], {
    ...maGlossaryFragments,
    'ma.group': groupGlossary,
    'ma.header': headerGlossary,
    'ma.help': helpGlossary,
    'ma.item': itemGlossary,
    'ma.nav-cards': navCardsGlossary,
    'ma.overview': overviewGlossary,
    'ma.student': studentGlossary,
    'ma.welcome': welcomeGlossary,
});

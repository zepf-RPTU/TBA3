/**
 * Initialise the glossary annotator for tests that exercise glossary-driven text.
 *
 * Button labels and tooltips resolve through `glossaryAnnotator` at render time,
 * so a test that asserts what the user reads has to bring the annotator up first
 * — otherwise every label comes back as `[Missing glossary entry: …]`.
 *
 * Each barrel merges only its own app's fragments, which is right in the browser
 * (one app per page) but not here: one test file can touch EN and MA paths in the
 * same assertion. The tree below carries every app's entries at once.
 */

import { glossaryAnnotator } from '@tba3/modules/common/glossary/glossaryAnnotator.js';
import { configureModuleRuntime } from '@tba3/module-base/modules/moduleRuntime.js';
import { enGlossary } from '../../../src/en/enGlossary.js';
import { maGlossary } from '../../../src/ma/maGlossary.js';
import { slGlossary } from '../../../src/sl/slGlossary.js';

/** Every app's assembled entries in one tree. */
const allAppsGlossary = {
    ...enGlossary,
    ma: maGlossary.ma,
    sl: slGlossary.sl,
};

/**
 * Bring the annotator up against the real glossary. Safe to call per test —
 * `init` replaces whatever tree the annotator held.
 *
 * Also registers the annotator as the module runtime's `decorateText`, the way
 * `bootstrapDashboardApp` does. A `ContentModule` resolves that function once at
 * construction and no longer imports the annotator itself, so without this a card
 * built in a test renders its title, subtitle and body **un-annotated** while the
 * annotator sits initialised beside it — a test asserting `.glossary-term` would
 * fail for a reason that has nothing to do with the code under test.
 * @param {string} [namespace='en'] - Namespace whose `shared.element_texts` seeds the term matcher
 */
export function initGlossaryForTests(namespace = 'en') {
    glossaryAnnotator.init(allAppsGlossary, namespace);
    configureModuleRuntime({ decorateText: (html) => glossaryAnnotator.annotateHTML(html) });
}

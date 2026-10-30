/**
 * The app context and runtime for tests that exercise glossary-driven text.
 *
 * Button labels and tooltips resolve through the app's `GlossaryAnnotator` at render
 * time, so a test that asserts what the user reads hands its module a context built
 * over the real glossary; otherwise every label comes back as
 * `[Missing glossary entry: …]`.
 *
 * Each barrel merges only its own app's fragments (one app per page), but one test
 * file can touch EN and MA paths in the same assertion, so the tree below carries
 * every app's entries.
 */

import { createAppContext } from '../../../src/common/app/appContext.js';
import { createMemoryImageStore } from '../../../src/common/export/memoryImageStore.js';
import { enGlossary } from '../../../src/en/enGlossary.js';
import { maGlossary } from '../../../src/ma/maGlossary.js';
import { slGlossary } from '../../../src/sl/slGlossary.js';
import { createTestRuntime } from '../../../packages/modules/test/support/glossaryFixture.js';

const allAppsGlossary = {
    ...enGlossary,
    ma: maGlossary.ma,
    sl: slGlossary.sl,
};

/**
 * A fresh app context against the real glossary: its own glossary, palette, trait
 * registry and export cart, so no test sees another's state.
 * @param {string} appId - The dashboard; also the namespace whose `shared.element_texts` seeds the term matcher.
 * @param {import('@tba3/modules/context').ContextStoreOptions} [store]
 * @param {import('../../../src/common/export/exportImageStore.js').ImageStore} [images] - The cart's captures: a store of the test's own, fresh by default.
 * @param {{id: string, label: string}} [dataset] - The dataset the page shows; none by default, so export ids stay `module-<id>`, unscoped.
 * @returns {import('../../../src/common/app/appContext.js').AppContext}
 */
export function createTestAppContext(
    appId,
    store = {},
    images = createMemoryImageStore(),
    dataset = { id: '', label: '' },
) {
    return createAppContext({
        appId,
        glossaryData: allAppsGlossary,
        viewLabel: () => '',
        dataset,
        store,
        images,
    });
}

/**
 * The `context` option a view or module takes; spread it into its options. Its
 * runtime is the test one, which decorates through the context's glossary as the app's
 * does: without it a `ContentModule` built in a test renders its title, subtitle and
 * body un-annotated. Export does nothing, so a card built here registers nothing in the
 * cart.
 * @param {string} appId - The dashboard; also the glossary namespace.
 * @param {import('@tba3/modules/context').ContextStoreOptions} [store]
 * @param {import('../../../src/common/export/exportImageStore.js').ImageStore} [images] - The cart's captures: a store of the test's own, fresh by default.
 * @returns {{context: import('../../../src/common/app/appContext.js').AppContext}}
 */
export function createTestAppOptions(appId, store = {}, images = createMemoryImageStore()) {
    const context = createTestAppContext(appId, store, images);
    return { context: { ...context, runtime: createTestRuntime(context) } };
}

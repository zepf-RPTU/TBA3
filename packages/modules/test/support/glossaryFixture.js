/**
 * The per-app context and runtime for tests that exercise glossary-driven text.
 *
 * Labels and tooltips resolve through the `GlossaryAnnotator` at render time; without a
 * real tree every label comes back as `[Missing glossary entry: …]`.
 *
 * The tree is the package's own vocabulary: the shared base plus every subject's
 * fragments, since one test file can touch EN and MA paths. A host's shell copy is not
 * part of it, so a module that reads a host-only entry fails here.
 */

import { assembleGlossary, sharedGlossary } from '../../src/common/glossary/index.js';
import { createModuleContext } from '../../src/common/context/index.js';
import { EN_GLOSSARY_TERMS, enGlossaryFragments } from '../../src/en/enGlossaryFragments.js';
import { maGlossaryFragments } from '../../src/ma/maGlossaryFragments.js';
import { slGlossaryFragments } from '../../src/sl/slGlossaryFragments.js';

// Only EN copy carries the scale-term tokens, so the shared tree takes EN's terms.
const packageGlossary = assembleGlossary(
    [sharedGlossary],
    { ...enGlossaryFragments, ...maGlossaryFragments, ...slGlossaryFragments },
    { terms: EN_GLOSSARY_TERMS },
);

/**
 * A fresh context over the package glossary: its own store, glossary, an empty palette
 * and an empty trait registry, so no test sees another's documents, scales or traits;
 * its runtime is `createTestRuntime`'s.
 * @param {string} [namespace='en'] - Namespace whose `shared.element_texts` seeds the term matcher.
 * @param {import('../../src/common/context/index.js').ContextStoreOptions} [store] - The store's requests and loader; an empty store by default.
 * @returns {import('../../src/common/context/index.js').ModuleContext}
 */
export function createTestContext(namespace = 'en', store = {}) {
    const context = createModuleContext({ glossaryData: packageGlossary, namespace, store });
    return { ...context, runtime: createTestRuntime(context) };
}

/**
 * The runtime a host hands its modules, with the context's glossary as `decorateText`:
 * a `ContentModule` decorates its title, subtitle and body through it, so without it a
 * card built in a test renders them un-annotated beside an initialised glossary. Export
 * does nothing.
 * @param {Pick<import('../../src/common/context/index.js').ModuleContext, 'glossary'>} context
 * @returns {import('@tba3/module-base').ModuleRuntime}
 */
export function createTestRuntime(context) {
    return {
        exportService: {
            createModuleExportControl: () => ({ template: () => null, update() {}, dispose() {} }),
        },
        decorateText: (html) => context.glossary.annotateHTML(html),
    };
}

/**
 * The `context` option a module takes, over a fresh test context — spread it into a
 * module's options.
 * @param {string} [namespace='en'] - Namespace whose `shared.element_texts` seeds the term matcher.
 * @param {import('../../src/common/context/index.js').ContextStoreOptions} [store] - The store's requests and loader.
 * @returns {{context: import('../../src/common/context/index.js').ModuleContext}}
 */
export function createTestModuleOptions(namespace = 'en', store = {}) {
    return { context: createTestContext(namespace, store) };
}

/**
 * `@tba3/modules/glossary` — the glossary as a mechanism, plus the tree tba3 fills it with.
 *
 * A host may bring its own tree (`new GlossaryAnnotator(tree, namespace)` needs only
 * `tree[namespace].shared.element_texts`), use `glossary.json` (the `general.*` entries)
 * and the fragments beside the charts and the subjects (`glossary/en`, …), or skip the
 * glossary entirely: uninitialised, `annotateHTML` returns its input and a term shows no
 * glossary affordance. An app's annotator lives in its context (`@tba3/modules/context`).
 */

export { default as sharedGlossary } from './glossary.json' with { type: 'json' };

export { assembleGlossary } from './glossaryAssembly.js';

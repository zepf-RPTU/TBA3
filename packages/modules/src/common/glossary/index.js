/**
 * `@tba3/modules/glossary` — the glossary as a mechanism, plus the tree tba3 fills it with.
 *
 * A host may bring its own tree (`glossaryAnnotator.init(tree, namespace)` needs only
 * `tree[namespace].shared.element_texts`), use `glossary.json` and the fragments beside
 * the charts, or skip the glossary entirely: uninitialised, `annotateHTML` returns its
 * input and every annotated term degrades to plain text.
 */

export { default as sharedGlossary } from './glossary.json' with { type: 'json' };

export { glossaryAnnotator } from './glossaryAnnotator.js';
export { assembleGlossary } from './glossaryAssembly.js';
export { GLOSSARY_KEYS } from './glossaryKeys.js';
export { buildCompetenceLevelGlossaryEntries } from './competenceLevelGlossary.js';

/**
 * `@tba3/modules/context` — the per-app context the concrete modules read: document store,
 * glossary and competence-level palette, built once per app and handed down.
 */

export { createModuleContext } from './moduleContext.js';
export { GlossaryAnnotator } from '../glossary/glossaryAnnotator.js';
export { CompetenceLevelPalette } from '../services/competenceLevelPalette.js';

/** @typedef {import('./moduleContext.js').ModuleContext} ModuleContext */
/** @typedef {import('./moduleContext.js').DatasetContext} DatasetContext */
/** @typedef {import('./moduleContext.js').ContextStoreOptions} ContextStoreOptions */

/**
 * The one place export target ids are built.
 *
 * An export id keys a tick, its stored capture and its report card, so two things
 * sharing an id share one tick and one image.
 *
 * The id therefore names what the capture depicts, not just which module drew it:
 * a module that shows one of many in turn contributes that identity
 * (`getExportIdentity()`), and the dataset is appended here so ticks made in two
 * datasets coexist.
 */

import { sanitizeFileStem } from './exportFiles.js';

/**
 * @param {string} moduleId
 * @param {string|Array<string|number|null|undefined>|null} [identity] - What the
 *   capture depicts, beyond the module itself (see `getExportIdentity()`)
 * @param {string} [datasetId] - The dataset the page shows (the app context's `exportDataset.id`); empty for none.
 * @returns {string} A stable id for the capture: `module-<id>`, then any identity parts, then the dataset, joined by `--`.
 */
export function buildExportTargetId(moduleId, identity = null, datasetId = '') {
    const parts = (Array.isArray(identity) ? identity : [identity])
        .filter((part) => part != null && part !== '')
        .map((part) => sanitizeFileStem(part));

    const scope = datasetId ? sanitizeFileStem(datasetId) : '';

    return [`module-${moduleId}`, ...parts, ...(scope ? [scope] : [])].join('--');
}

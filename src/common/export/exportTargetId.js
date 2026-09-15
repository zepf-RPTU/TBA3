/**
 * The one place export target ids are built.
 *
 * An export id is three keys at once — the batch-cart entry
 * (`exportSelectionManager`), the stored capture (`exportImageStore`) and the
 * report card (`reportViewModule`). Two things sharing an id therefore share one
 * tick and one image: the second capture overwrites the first and the report
 * shows one card for two ticks.
 *
 * So the id must name *what the capture depicts*, not just which module drew it.
 * `module-<module id>` alone is only right for a module that shows one thing for
 * its whole life; a module that shows one of many in turn (a selected student, a
 * Leitidee, an InfoBox section) contributes that identity through
 * `ContentModule#getExportIdentity()`, and the dataset is appended here so ticks
 * made in two classes coexist instead of colliding.
 */

import { sanitizeFileStem } from './exportFiles.js';
import { getExportDataset } from './exportDataset.js';

/**
 * @param {string} moduleId - The owning module's id
 * @param {string|Array<string|number|null|undefined>|null} [identity] - What the
 *   capture depicts, beyond the module itself (see `getExportIdentity()`)
 * @returns {string} A stable id for the capture — the module alone when it shows one thing, module plus identity otherwise.
 */
export function buildExportTargetId(moduleId, identity = null) {
    const parts = (Array.isArray(identity) ? identity : [identity])
        .filter((part) => part != null && part !== '')
        .map((part) => sanitizeFileStem(part));

    const dataset = getExportDataset().id;
    const scope = dataset ? sanitizeFileStem(dataset) : '';

    return [`module-${moduleId}`, ...parts, ...(scope ? [scope] : [])].join('--');
}

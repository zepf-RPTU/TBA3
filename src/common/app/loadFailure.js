/**
 * Why a load failed, in the causes a reader can tell apart: a data source that does not
 * answer, and data of the wrong shape. The exception, naming document and field, stays
 * in the console.
 */

import { DocumentShapeError } from '@tba3/modules/documents';
import { ApiUnreachableError } from '../services/apiClient.js';

/**
 * @param {unknown} error - Why the load failed.
 * @returns {string} The `general.messages` entry that names the cause.
 */
export function loadCauseKey(error) {
    if (error instanceof DocumentShapeError) return 'load-cause-malformed';
    if (error instanceof ApiUnreachableError) return 'load-cause-unreachable';
    return 'load-cause-error';
}

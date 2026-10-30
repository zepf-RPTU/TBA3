/**
 * Lookups into the per-view header control declarations an app's builder returns.
 */

import { required } from '../../../packages/modules/test/support/required.js';

/** @typedef {import('../../../src/common/modules/header/headerOrchestrator.js').HeaderControlDeclaration} HeaderControlDeclaration */

/**
 * One view's declared control.
 * @param {{[viewKey: string]: HeaderControlDeclaration[]}} controls
 * @param {string} viewType
 * @param {string} controlId
 * @returns {HeaderControlDeclaration}
 */
export function findControl(controls, viewType, controlId) {
    return required(
        controls[viewType]?.find((control) => control.id === controlId),
        `${viewType}/${controlId}`,
    );
}

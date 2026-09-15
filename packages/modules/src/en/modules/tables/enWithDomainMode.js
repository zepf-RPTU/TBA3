/**
 * withDomainMode — the EN Domäne mode (`all` | domain id) as table state.
 *
 * Every EN table follows the header's Domäne switch the same way: the mode is
 * seeded from the `domainMode` option, pushed by the owning view with
 * `setState({ mode })` from its app-state observer, and applied through the
 * table's `_applyModeChange`. One binding for the four tables rather than four
 * copies of the `withTableModeState` config.
 */

import { withTableModeState } from '../../../common/tables/withTableModeState.js';

/**
 * @param {typeof import('../../../common/tables/tableModule.js').TableModule} Base - The table module class to extend.
 * @returns {typeof import('../../../common/tables/tableModule.js').TableModule} The class with `_state.mode` bound to the EN Domäne switch.
 */
export function withDomainMode(Base) {
    return withTableModeState(Base, {
        stateKey: 'mode',
        initialValue: (opts) => opts.domainMode || 'all',
        applyHookName: '_applyModeChange',
    });
}

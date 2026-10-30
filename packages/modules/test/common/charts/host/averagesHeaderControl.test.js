// @vitest-browser

/**
 * The comparison/averages module-header toggle, shared by every app that carries one.
 *
 * The shared adapter (`comparisonModeControl`) binds the dropdown to the host's
 * comparison-state port and leaves out a control with no items: an entry with nothing
 * behind it would promise a comparison and draw none. The entries come from the caller's
 * `getModes` closure; the host passes its descriptor's `comparisonModes`, which each chart
 * config answers from the list its renderer paints from, so menu and picture agree.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'lit';

import { comparisonModeDropdown } from '../../../../src/common/charts/host/comparisonModeControl.js';
import { comparisonStateShowing } from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { queryHtml } from '../../../support/dom.js';
import { signal } from '@preact/signals-core';

/** @typedef {import('../../../../src/common/charts/comparisonState.js').ComparisonState} ComparisonState */
/** @typedef {import('../../../../src/common/charts/comparisonState.js').ComparisonStateReader & Partial<Pick<ComparisonState, 'setActive'>>} HostComparisonState */

const CONTROL_SELECTOR = '.header-action-dropdown-wrapper:has(> [data-header-action-button])';

/**
 * A host with the given comparison state as its option; `show` renders the control
 * into `toolbar` (the test's own element), as the host's shell render does.
 * @param {HostComparisonState|null} comparisonState
 */
function makeHost(comparisonState) {
    const toolbar = document.createElement('div');
    document.body.appendChild(toolbar);
    const host = {
        toolbar,
        options: { context: createTestContext(), comparisonState },
        /** @param {() => Array<{id: string, label: string}>} getModes */
        show: (getModes) => render(comparisonModeDropdown(host, getModes), toolbar),
    };
    return host;
}

/**
 * The writable port an app provides; `setActive` is what makes a control appear.
 * @param {string[]} [shownIds] - The modes shown at the start.
 */
function makeComparisonState(shownIds = []) {
    const state = comparisonStateShowing(shownIds);
    vi.spyOn(state, 'setActive');
    return state;
}

describe('shared comparison-mode dropdown', () => {
    const MODES = [{ id: 'state:state', label: 'Landesschnitt' }];

    it('takes a rendered control away when the averages go away', () => {
        // SL's `buildRow` skips an average whose metric does not resolve, so a
        // payload with no state value group plots none; MA's competence-level chart has nothing to toggle
        // with only its own group. A control offering one would be inert.
        const host = makeHost(makeComparisonState());
        host.show(() => MODES);
        expect(host.toolbar.querySelector(CONTROL_SELECTOR)).not.toBeNull();

        host.show(() => []);

        expect(host.toolbar.querySelector(CONTROL_SELECTOR)).toBeNull();
    });

    it('reads the checked state from the port and flips exactly that mode on a click', () => {
        // The comparison state is the one owner — the row shows what the state
        // holds, and a click writes back through `setActive`, which publishes to every
        // other chart and dropdown. The adapter itself keeps no state.
        const state = makeComparisonState(['state:state']);
        const host = makeHost(state);
        host.show(() => MODES);

        queryHtml(host.toolbar, 'button[aria-haspopup]').click();
        const row = queryHtml(host.toolbar, 'button[aria-checked]');
        expect(row.getAttribute('aria-checked')).toBe('true');

        row.click();

        expect(state.setActive).toHaveBeenCalledWith('state:state', false);
        expect(queryHtml(host.toolbar, 'button[aria-checked]').getAttribute('aria-checked')).toBe(
            'false',
        );
    });

    it('builds nothing for a read-only state, so a view-only surface offers no toggle', () => {
        // The scatterplot filter modal shows the page's averages but must not be a
        // second place to change them, so it passes a state without `setActive`.
        const readOnly = { activeModes: signal(['state:state']), isActive: () => true };
        const host = makeHost(readOnly);

        host.show(() => MODES);

        expect(host.toolbar.querySelector(CONTROL_SELECTOR)).toBeNull();
    });
});

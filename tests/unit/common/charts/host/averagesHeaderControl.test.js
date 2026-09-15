// @vitest-browser

/**
 * The comparison/averages module-header toggle, shared by every app that carries one.
 *
 * The shared adapter (`comparisonModeControl`) binds the dropdown to the host's comparison-state port and decides whether a
 * control exists at all: a menu entry with nothing behind it tells the reader a
 * comparison exists and then draws nothing when they ask for it, so a control with no
 * items is removed, not shown empty. What the entries *are* is the caller's `getModes`
 * closure, which each chart config answers from the same list its renderer paints
 * from — that is what keeps the menu and the picture in agreement. (The KS
 * distribution's answer is shared by EN and MA and lives on the base renderer — see
 * tests/unit/common/charts/ksDistribution/ksGroupVisibility.test.js.)
 */

import { describe, expect, it, afterEach, vi } from 'vitest';

import { ensureComparisonModeDropdown } from '@tba3/modules/common/charts/host/comparisonModeControl.js';

const CONTROL_SELECTOR = '[data-header-action-control]';

function makeHost() {
    const headerActionsContainer = document.createElement('div');
    document.body.appendChild(headerActionsContainer);
    return { headerActionsContainer };
}

/** The writable port an app provides; `setActive` is what makes a control appear. */
function makeComparisonState(state = {}) {
    return {
        getActiveModes: () => Object.keys(state).filter((id) => state[id]),
        isActive: (id) => Boolean(state[id]),
        setActive: vi.fn((id, active) => {
            state[id] = active;
        }),
        subscribe: () => () => {},
    };
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('shared comparison-mode dropdown', () => {
    const MODES = [{ id: 'state:state', label: 'Landesschnitt' }];

    it('mounts nothing when the chart has no reference average to offer', () => {
        // WHY: SL's `buildRow` skips an average whose metric does not resolve, so a
        // payload with no state row plots none; MA's KS chart has nothing to toggle
        // with only its own group. A control offering one would be inert.
        const host = makeHost();

        ensureComparisonModeDropdown(host, makeComparisonState(), () => []);

        expect(host.headerActionsContainer.querySelector(CONTROL_SELECTOR)).toBeNull();
    });

    it('removes an already-mounted control when the averages go away', () => {
        const host = makeHost();
        ensureComparisonModeDropdown(host, makeComparisonState(), () => MODES);
        expect(host.headerActionsContainer.querySelector(CONTROL_SELECTOR)).not.toBeNull();

        ensureComparisonModeDropdown(host, makeComparisonState(), () => []);

        expect(host.headerActionsContainer.querySelector(CONTROL_SELECTOR)).toBeNull();
    });

    it('reads the checked state from the port and flips exactly that mode on a click', () => {
        // WHY: the comparison state is the one owner — the row shows what the state
        // holds, and a click writes back through `setActive`, which publishes to every
        // other chart and dropdown. The adapter itself keeps no state.
        const host = makeHost();
        const state = makeComparisonState({ 'state:state': true });
        ensureComparisonModeDropdown(host, state, () => MODES);

        host.headerActionsContainer.querySelector('button[aria-haspopup]').click();
        const row = host.headerActionsContainer.querySelector(
            'button.header-action-checkbox-option',
        );
        expect(row.getAttribute('aria-checked')).toBe('true');

        row.click();

        expect(state.setActive).toHaveBeenCalledWith('state:state', false);
        expect(
            host.headerActionsContainer
                .querySelector('button.header-action-checkbox-option')
                .getAttribute('aria-checked'),
        ).toBe('false');
    });

    it('builds nothing for a read-only state, so a view-only surface offers no toggle', () => {
        // WHY: the scatterplot filter modal shows the page's averages but must not be a
        // second place to change them. It passes a state without `setActive`, and the
        // absence of the control is the whole mechanism.
        const host = makeHost();
        const readOnly = { getActiveModes: () => ['state:state'], isActive: () => true };

        ensureComparisonModeDropdown(host, readOnly, () => MODES);

        expect(host.headerActionsContainer.querySelector(CONTROL_SELECTOR)).toBeNull();
    });

    it('a re-render while the menu is open leaves it open', () => {
        // WHY: a toggle writes comparisonState, the SL row card re-renders through
        // `createRenderer`, and this ensure runs again while the reader's menu is still
        // open. The shared dropdown shell used to re-stamp the classes and close it on
        // every click, which made toggling two averages in a row impossible.
        const host = makeHost();
        ensureComparisonModeDropdown(host, makeComparisonState(), () => MODES);

        const button = host.headerActionsContainer.querySelector('button[aria-haspopup]');
        const dropdown = host.headerActionsContainer.querySelector('.header-action-dropdown');
        button.click();
        expect(dropdown.classList.contains('show')).toBe(true);
        expect(button.getAttribute('aria-expanded')).toBe('true');

        ensureComparisonModeDropdown(host, makeComparisonState(), () => MODES);

        expect(dropdown.classList.contains('show')).toBe(true);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(button.classList.contains('is-active')).toBe(true);
    });
});

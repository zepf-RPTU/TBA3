// @vitest-browser

/**
 * Segmented choice buttons (mode switches, table presets, SL material selectors)
 * must expose their selection to assistive tech, not only as a dimmed `is-active`
 * style — and `aria-pressed` is the oracle e2e specs use for them.
 */

import { describe, it, expect } from 'vitest';
import {
    createSegmentedChoiceButton,
    setSegmentedChoiceButtonState,
} from '@tba3/module-base/modules/header/segmentedButtonBuilder.js';

describe('createSegmentedChoiceButton', () => {
    it('stamps aria-pressed from isActive', () => {
        expect(
            createSegmentedChoiceButton({ label: 'Hören', isActive: true }).getAttribute(
                'aria-pressed',
            ),
        ).toBe('true');
        expect(createSegmentedChoiceButton({ label: 'Lesen' }).getAttribute('aria-pressed')).toBe(
            'false',
        );
    });
});

describe('setSegmentedChoiceButtonState', () => {
    it('flips is-active and aria-pressed together', () => {
        const button = document.createElement('button');

        setSegmentedChoiceButtonState(button, true);
        expect(button.classList.contains('is-active')).toBe(true);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.disabled).toBe(false);

        setSegmentedChoiceButtonState(button, false);
        expect(button.classList.contains('is-active')).toBe(false);
        expect(button.getAttribute('aria-pressed')).toBe('false');
    });

    it('disables the current choice only when disableWhenActive is set', () => {
        const button = document.createElement('button');

        setSegmentedChoiceButtonState(button, true, { disableWhenActive: true });
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-pressed')).toBe('true');

        setSegmentedChoiceButtonState(button, false, { disableWhenActive: true });
        expect(button.disabled).toBe(false);
    });
});

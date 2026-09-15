// @vitest-browser

import { describe, it, expect } from 'vitest';
import {
    createToggleIconButton,
    setToggleIconButtonState,
} from '../../../../../src/common/modules/header/toggleIconButtonBuilder.js';

describe('createToggleIconButton', () => {
    it('sets aria-label, aria-pressed, and innerHTML from options', () => {
        const button = createToggleIconButton({
            ariaLabel: 'Toggle thing',
            svgMarkup: '<svg data-testid="icon"></svg>',
            isActive: true,
        });

        expect(button.tagName).toBe('BUTTON');
        expect(button.getAttribute('aria-label')).toBe('Toggle thing');
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.querySelector('svg[data-testid="icon"]')).not.toBeNull();
    });

    it('defaults isActive to false', () => {
        const button = createToggleIconButton({ ariaLabel: 'x', svgMarkup: '<svg></svg>' });
        expect(button.getAttribute('aria-pressed')).toBe('false');
    });
});

describe('setToggleIconButtonState', () => {
    it('toggles is-active and aria-pressed to match isActive', () => {
        const button = document.createElement('button');

        setToggleIconButtonState(button, true);
        expect(button.classList.contains('is-active')).toBe(true);
        expect(button.getAttribute('aria-pressed')).toBe('true');

        setToggleIconButtonState(button, false);
        expect(button.classList.contains('is-active')).toBe(false);
        expect(button.getAttribute('aria-pressed')).toBe('false');
    });
});

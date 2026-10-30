// @vitest-browser

import { afterEach, describe, expect, it } from 'vitest';
import '../../src/styles/buttons.css';

afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.style.removeProperty('--primary-color');
    document.documentElement.style.removeProperty('--color-card-background');
    document.documentElement.style.removeProperty('--color-border');
});

/**
 * An icon button with the given state.
 * @param {(button: HTMLButtonElement) => void} [state]
 * @returns {HTMLButtonElement}
 */
function iconButton(state) {
    const button = document.createElement('button');
    button.className = 'btn btn--icon';
    state?.(button);
    return button;
}

/**
 * @param {Element} element
 * @returns {string} Its computed fill.
 */
const fill = (element) => getComputedStyle(element).backgroundColor;

describe('button state fills', () => {
    // A ticked batch checkbox and an open export menu sit in a segmented group; resting,
    // its icon buttons keep their own fill, so a hovered card header cannot show through.
    it('paints an icon button in a segmented group like one outside it', () => {
        document.documentElement.style.setProperty('--primary-color', 'rgb(255, 0, 0)');
        document.documentElement.style.setProperty('--color-card-background', 'rgb(0, 0, 255)');
        const selected = iconButton((button) => button.classList.add('is-selected'));
        const expanded = iconButton((button) => button.setAttribute('aria-expanded', 'true'));
        const resting = iconButton();
        const group = document.createElement('div');
        group.className = 'btn-group btn-group--segmented';
        group.append(selected, expanded, resting);
        const outside = iconButton((button) => button.classList.add('is-selected'));
        const outsideResting = iconButton();
        document.body.append(group, outside, outsideResting);

        expect(fill(resting)).toBe('rgb(0, 0, 255)');
        expect(fill(resting)).toBe(fill(outsideResting));
        expect(fill(selected)).toBe(fill(outside));
        expect(fill(expanded)).toBe(fill(outside));
        expect(fill(outside)).not.toBe(fill(resting));
    });
});

describe('segmented group', () => {
    // Each button keeps its own frame, so a fixed-height group cannot let its buttons
    // paint over a frame the group draws; the group only joins them.
    it('frames each button like one outside it and joins neighbours', () => {
        // Undefined, it would void the border shorthand and leave nothing to compare.
        document.documentElement.style.setProperty('--color-border', 'rgb(0, 128, 0)');
        const first = iconButton();
        const second = iconButton();
        const group = document.createElement('div');
        group.className = 'btn-group btn-group--segmented';
        group.append(first, second);
        const outside = iconButton();
        document.body.append(group, outside);

        const style = getComputedStyle;
        expect(style(group).borderTopWidth).toBe('0px');
        for (const button of [first, second]) {
            expect(style(button).borderTopWidth).toBe(style(outside).borderTopWidth);
            expect(style(button).borderBottomWidth).toBe(style(outside).borderBottomWidth);
        }
        expect(style(outside).borderTopWidth).toBe('1px');
        expect(style(second).marginInlineStart).toBe('-1px');
        expect(style(first).borderStartEndRadius).toBe('0px');
        expect(style(first).borderEndEndRadius).toBe('0px');
        expect(style(second).borderStartStartRadius).toBe('0px');
        expect(style(second).borderEndStartRadius).toBe('0px');
    });
});

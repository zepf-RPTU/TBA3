// @vitest-browser
/**
 * The shared tab-strip keyboard contract.
 *
 * A strip may re-render itself from scratch on selection, so the node the arrow key
 * moved to can be gone by the time focus is placed.
 */

import { describe, it, expect } from 'vitest';

import { handleTabKeydown } from '../../src/utils/tabStrip.js';

/**
 * @param {string} selectedId
 * @returns {HTMLElement} A rendered tablist of three tabs.
 */
function renderStrip(selectedId) {
    const list = document.createElement('div');
    list.setAttribute('role', 'tablist');
    list.innerHTML = ['a', 'b', 'c']
        .map(
            (id) =>
                `<button type="button" role="tab" id="${id}" aria-selected="${id === selectedId}">${id}</button>`,
        )
        .join('');
    return list;
}

describe('handleTabKeydown', () => {
    /**
     * @param {string} key
     * @param {string} from - Id of the tab holding focus.
     * @returns {string[]} The ids activation was called with.
     */
    function press(key, from) {
        document.body.innerHTML = '';
        let list = renderStrip(from);
        document.body.appendChild(list);
        /** @type {string[]} */
        const activated = [];
        const focused = /** @type {HTMLElement|null} */ (list.querySelector(`#${from}`));
        if (!focused) throw new Error(`Expected tab #${from}`);

        focused.addEventListener('keydown', (event) =>
            handleTabKeydown(event, (tab) => {
                activated.push(tab.id);
                // The worst case: throw the strip away and render a new one.
                const replacement = renderStrip(tab.id);
                list.replaceWith(replacement);
                list = replacement;
            }),
        );

        focused.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        return activated;
    }

    it('steps, wraps and jumps', () => {
        expect(press('ArrowRight', 'a')).toEqual(['b']);
        expect(press('ArrowLeft', 'a')).toEqual(['c']);
        expect(press('End', 'a')).toEqual(['c']);
        expect(press('Home', 'c')).toEqual(['a']);
    });

    it('leaves other keys to the strip', () => {
        expect(press('Enter', 'a')).toEqual([]);
        expect(press('ArrowDown', 'a')).toEqual([]);
    });

    it('focuses the re-rendered tab, not the node it replaced', () => {
        press('ArrowRight', 'a');

        expect(document.activeElement?.id).toBe('b');
        expect(document.activeElement?.isConnected).toBe(true);
    });
});

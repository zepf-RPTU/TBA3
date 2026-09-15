// @vitest-browser
/**
 * The shared tab-strip ARIA and keyboard contract.
 *
 * Both strips re-render themselves from scratch on selection, so the interesting case is
 * the one a naive `next.focus()` gets wrong: the node the arrow key moved to is gone by
 * the time focus is placed.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { tabAttributes, handleTabKeydown } from '@tba3/module-base/utils/tabStrip.js';

/**
 * @param {string} selectedId - Which tab is selected.
 * @returns {HTMLElement} A rendered tablist of three tabs.
 */
function renderStrip(selectedId) {
    const list = document.createElement('div');
    list.setAttribute('role', 'tablist');
    list.innerHTML = ['a', 'b', 'c']
        .map(
            (id) =>
                `<button type="button" ${tabAttributes({ id, panelId: 'panel', selected: id === selectedId })}>${id}</button>`,
        )
        .join('');
    return list;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('tabAttributes', () => {
    it('puts only the selected tab in the tab order', () => {
        const list = renderStrip('b');

        const stops = [...list.children].map((tab) => tab.getAttribute('tabindex'));
        expect(stops).toEqual(['-1', '0', '-1']);
        expect(list.querySelector('[aria-selected="true"]').id).toBe('b');
        expect(list.querySelector('#a').getAttribute('aria-controls')).toBe('panel');
    });
});

describe('handleTabKeydown', () => {
    /**
     * @param {string} key - The key to send.
     * @param {string} from - Id of the tab holding focus.
     * @returns {string[]} The ids activation was called with.
     */
    function press(key, from) {
        document.body.innerHTML = '';
        let list = renderStrip(from);
        document.body.appendChild(list);
        const activated = [];

        list.querySelector(`#${from}`).addEventListener('keydown', (event) =>
            handleTabKeydown(event, (tab) => {
                activated.push(tab.id);
                // What both callers do: throw the strip away and render a new one.
                const replacement = renderStrip(tab.id);
                list.replaceWith(replacement);
                list = replacement;
            }),
        );

        list.querySelector(`#${from}`).dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true }),
        );
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

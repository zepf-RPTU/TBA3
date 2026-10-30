// @vitest-browser

import { afterEach, describe, it, expect, vi } from 'vitest';
import { BaseModule, ContentModule } from '../../index.js';

// Each test places its own tree under the same ids; the last one's leaves with it.
afterEach(() => {
    document.body.replaceChildren();
});

/**
 * show()/hide() toggle the module's own `hidden` attribute and run the _onShow/_onHide
 * hooks through the subtree, never a child's own flag. A hidden parent already takes its
 * subtree off screen; un-hiding a child from the parent would re-open a child its owner
 * had hidden every time the view came back.
 */

class Probe extends BaseModule {
    /** @type {string[]} */
    #events = [];

    /** @returns {string[]} The hooks run, in order. */
    get events() {
        return this.#events;
    }

    /** @override */
    _onShow() {
        this.#events.push('show');
    }

    /** @override */
    _onHide() {
        this.#events.push('hide');
    }
}
customElements.define('test-visibility-probe', Probe);

/** A titled card: collapsing it folds its body away. */
class Card extends ContentModule {
    /** @type {string[]} */
    #events = [];

    /** @returns {string[]} The hooks run, in order. */
    get events() {
        return this.#events;
    }

    /** @override */
    async _renderBody() {}

    /** @override */
    _onShow() {
        this.#events.push('show');
    }

    /** @override */
    _onHide() {
        this.#events.push('hide');
    }
}
customElements.define('test-visibility-card', Card);

/**
 * A connected probe.
 * @param {string} id
 * @param {Element} [parent]
 * @returns {Probe}
 */
function place(id, parent = document.body) {
    const module = Probe.create(id, {});
    parent.append(module);
    return module;
}

/**
 * A view holding a card holding a table, all connected and settled.
 * @returns {Promise<{view: Probe, card: Card, table: Probe}>}
 */
async function placeCard() {
    const view = place('view');
    const card = Card.create('card', { showModuleTitle: true, collapsible: true });
    view.append(card);
    await card.updateComplete;
    const table = place('table', card.contentContainer);
    return { view, card, table };
}

describe('BaseModule visibility', () => {
    it('keeps a child its owner hid hidden when the parent is shown again', () => {
        const view = place('view');
        const child = place('child', view);

        view.show();
        child.hide();
        view.hide();
        view.show();

        expect(child.hidden).toBe(true);
        expect(child.visible).toBe(false);
        expect(child.events).toEqual(['show', 'hide']);
    });

    it('marks the subtree visible and runs its hooks without touching a child', () => {
        const view = place('view');
        const child = place('child', view);
        const grandchild = place('grandchild', child);

        view.show();
        expect([child.visible, grandchild.visible]).toEqual([true, true]);

        view.hide();
        expect(view.hidden).toBe(true);
        expect(child.hidden).toBe(false);
        expect([child.visible, grandchild.visible]).toEqual([false, false]);
        expect(grandchild.events).toEqual(['show', 'hide']);
    });

    it('runs a hook once per change, after the descendants have caught up', () => {
        const view = place('view');
        const child = place('child', view);
        /** @type {boolean[]} */
        const childVisibleWhenParentHooked = [];
        view._onShow = () => childVisibleWhenParentHooked.push(child.visible);

        view.show();
        view.show();

        expect(childVisibleWhenParentHooked).toEqual([true]);
        expect(child.events).toEqual(['show']);
    });

    it('reports a hook that throws and runs the rest, without throwing to the caller', () => {
        const view = place('view');
        const failing = place('failing', view);
        const sibling = place('sibling', view);
        const error = new Error('hook failed');
        failing._onShow = () => {
            throw error;
        };
        const report = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => view.show()).not.toThrow();

        expect(sibling.events).toEqual(['show']);
        expect(view.events).toEqual(['show']);
        expect(report).toHaveBeenCalledWith('BaseModule[failing]: Error in _onShow:', error);
    });

    it('runs _onHide on the first hide of a module placed in a visible subtree', () => {
        // A section built on its first visit, after the view reported the switch: it is
        // visible without having heard _onShow, and must still hear the switch away.
        const view = place('view');
        view.show();
        const late = place('late', view);

        view.hide();

        expect(late.events).toEqual(['hide']);
    });

    it('counts a collapsed card and its subtree as hidden, and shows them again on expanding', async () => {
        // A collapsed card keeps its header on screen but its body is display:none, so
        // nothing below it has a box: a chart or table there must hear _onHide, and
        // _onShow once it is expanded, to draw what it could not draw collapsed.
        const { view, card, table } = await placeCard();
        view.show();

        card.collapse();
        expect([card.visible, table.visible]).toEqual([false, false]);
        expect(card.hidden).toBe(false);

        card.expand();
        expect([card.visible, table.visible]).toEqual([true, true]);
        expect(table.events).toEqual(['show', 'hide', 'show']);
        expect(card.events).toEqual(['show', 'hide', 'show']);
    });

    it('keeps a collapsed card hidden across its view being shown again, and expanding a card in a hidden view shows nothing', async () => {
        const { view, card, table } = await placeCard();
        view.show();
        card.collapse();

        view.hide();
        view.show();
        expect(table.visible).toBe(false);

        view.hide();
        card.expand();
        expect(table.visible).toBe(false);
        view.show();
        expect(table.visible).toBe(true);
    });
});

describe('BaseModule export capture', () => {
    it('opens a folded card at once and folds it again on restore', async () => {
        // The capture waits for the opened subtree (`whenSettled()`) after this returns,
        // so the opening itself must not wait.
        const { view, card } = await placeCard();
        view.show();
        card.collapse();

        const restore = card.prepareExportCapture();
        expect(card.classList.contains('collapsed')).toBe(false);

        restore();
        expect(card.classList.contains('collapsed')).toBe(true);
    });
});

describe('ContentModule collapse toggle', () => {
    it('is a button that names the card, controls its body and states whether it is open', async () => {
        // A header div with a click handler is pointer-only: a card that starts collapsed
        // could never be opened from the keyboard.
        const { card } = await placeCard();
        const toggle = /** @type {HTMLButtonElement} */ (
            card.querySelector('button.content-module-toggle')
        );
        const body = card.contentContainer;

        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.getAttribute('aria-controls')).toBe(body.id);
        expect(toggle.getAttribute('aria-labelledby')).toBe(card.titleElement?.id);

        toggle.click();
        await card.updateComplete;
        expect(card.classList.contains('collapsed')).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        toggle.click();
        await card.updateComplete;
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('folds the body away against a later layer that gives it a display, and without a card frame', async () => {
        // A split chart body (`chart-host-body--table`) is a flex column in the modules
        // layer, which outranks the common layer the collapse rule sits in.
        const sheet = document.createElement('style');
        sheet.textContent = '@layer modules { .test-split-body { display: flex; } }';
        document.head.append(sheet);
        try {
            const view = place('view');
            const framed = Card.create('framed', {
                showModuleTitle: true,
                collapsible: true,
                bodyClassName: 'test-split-body',
            });
            const frameless = Card.create('frameless', {
                showModuleTitle: true,
                collapsible: true,
                showModuleCard: false,
            });
            view.append(framed, frameless);
            await Promise.all([framed.updateComplete, frameless.updateComplete]);
            framed.collapse();
            frameless.collapse();

            expect([framed.visible, frameless.visible]).toEqual([false, false]);
            expect(framed.contentContainer.checkVisibility()).toBe(false);
            expect(frameless.contentContainer.checkVisibility()).toBe(false);
        } finally {
            sheet.remove();
        }
    });

    it('leaves a click on a control in the title to that control, and folds on the bare title', async () => {
        // A glossary term in the title is a button of its own: a tap opens its popup,
        // and must not fold the card under it as well.
        const { card } = await placeCard();
        const title = /** @type {HTMLElement} */ (card.titleElement);
        const term = document.createElement('span');
        term.setAttribute('role', 'button');
        term.tabIndex = 0;
        term.textContent = 'Kompetenzstufe';
        title.append(term);

        term.click();
        expect(card.classList.contains('collapsed')).toBe(false);

        title.click();
        expect(card.classList.contains('collapsed')).toBe(true);
    });
});

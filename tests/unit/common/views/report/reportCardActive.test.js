// @vitest-browser

// WHY: a card's toolbar is revealed by hover on a pointer that has one. Without
// hover, a tap has to ask for it — and only one card may answer at a time. The
// toolbar is `width: max-content` at roughly twice the width of a half-span card,
// so two revealed at once overlap, and `.report-card` creates no stacking context
// at rest: which one swallows a tap would come down to DOM insertion order, which
// #applyOrder deliberately keeps diverging from what the user sees. Since the
// toolbar's last control removes the card from the report, that is a wrong-card
// deletion, not a cosmetic overlap.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn(async () => []);
vi.mock('../../../../../src/common/export/exportImageStore.js', () => ({
    exportImageStore: {
        list: (...args) => list(...args),
        get: async () => null,
        delete: async () => {},
        clear: async () => {},
    },
}));

const { exportSelectionManager } =
    await import('../../../../../src/common/export/exportSelectionManager.js');
const { ReportViewModule } =
    await import('../../../../../src/common/views/report/reportViewModule.js');

function record(itemId) {
    return {
        itemId,
        title: itemId,
        view: 'overview',
        docOrder: 0,
        capturedAt: 1,
        width: 100,
        height: 50,
        blob: new Blob(['png'], { type: 'image/png' }),
    };
}

function select(id) {
    exportSelectionManager.registerTarget(id, {
        id,
        title: id,
        type: 'chart',
        view: 'overview',
        container: null,
    });
    exportSelectionManager.toggleSelection(id);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('report card toolbar reveal', () => {
    let container;
    let view;

    /** @returns {HTMLElement} The card rendered for `id`. */
    const card = (id) => container.querySelector(`.report-card[data-report-item-id="${id}"]`);
    const activeIds = () =>
        [...container.querySelectorAll('.report-card.is-active')].map(
            (el) => el.dataset.reportItemId,
        );

    beforeEach(async () => {
        localStorage.clear();
        exportSelectionManager.clearSelection();
        list.mockReset();
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:card');
        globalThis.URL.revokeObjectURL = vi.fn();
        container = document.createElement('div');
        document.body.appendChild(container);
        view = new ReportViewModule('report', container, {
            viewConfig: { overview: { label: 'Übersicht' } },
        });

        select('a');
        select('b');
        list.mockResolvedValue([record('a'), record('b')]);
        await view._doRender();
        await flush();
    });

    afterEach(() => {
        view.destroy();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('reveals no toolbar until a card is tapped', () => {
        expect(container.querySelectorAll('.report-card')).toHaveLength(2);
        expect(activeIds()).toEqual([]);
    });

    it('reveals exactly one card at a time', () => {
        card('a').querySelector('.report-card-image').click();
        expect(activeIds()).toEqual(['a']);

        card('b').querySelector('.report-card-image').click();
        expect(activeIds()).toEqual(['b']);
    });

    it('clears on a tap on the bare page background', () => {
        card('a').querySelector('.report-card-image').click();
        expect(activeIds()).toEqual(['a']);

        container.querySelector('.report-pages').click();

        expect(activeIds()).toEqual([]);
    });

    it('clears on a click outside the page area', () => {
        card('a').querySelector('.report-card-image').click();
        expect(activeIds()).toEqual(['a']);

        const outside = document.createElement('div');
        document.body.appendChild(outside);
        outside.click();

        expect(activeIds()).toEqual([]);
    });

    it('leaves the active card alone when its own toolbar is used', () => {
        // A toolbar press is the point of revealing it; it must not double as the
        // gesture that hides it again.
        card('a').querySelector('.report-card-image').click();

        card('a').querySelector('[data-report-card-action="down"]').click();

        expect(activeIds()).toEqual(['a']);
    });

    it('forgets a card that leaves the report', async () => {
        card('a').querySelector('.report-card-image').click();
        expect(activeIds()).toEqual(['a']);

        list.mockResolvedValue([record('b')]);
        exportSelectionManager.deselect('a');
        await flush();

        expect(card('a')).toBeNull();
        // The id is gone with the node, so a later card reusing it cannot inherit
        // a reveal nobody asked for.
        expect(activeIds()).toEqual([]);
    });
});

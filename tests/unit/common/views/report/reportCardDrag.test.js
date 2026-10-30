// @vitest-browser

import { describe, expect, it, vi } from 'vitest';
import { ReportCardDrag } from '../../../../../src/common/views/report/reportCardDrag.js';

// A drag follows the pointer that grabbed the handle. A second finger lifted or
// cancelled on the page stack must neither drop nor revert the card the first one holds.

/**
 * A card with its drag handle in the page, and a drag over a stub host.
 * @returns {{drag: ReportCardDrag, handle: HTMLElement, host: {commit: import('vitest').Mock, moveTo: import('vitest').Mock}}}
 */
function grabbedCard() {
    const card = document.createElement('div');
    card.className = 'report-card';
    card.dataset.reportItemId = 'a';
    const handle = document.createElement('button');
    handle.className = 'report-card-handle';
    // Synthetic pointers are not active pointers the browser could capture.
    handle.setPointerCapture = () => {};
    card.append(handle);
    document.body.append(card);

    const host = { commit: vi.fn(), moveTo: vi.fn() };
    const drag = new ReportCardDrag({
        getIds: () => ['a', 'b'],
        moveTo: host.moveTo,
        getCard: () => card,
        getSheets: () => [],
        setDragging: () => {},
        commit: host.commit,
    });
    card.addEventListener('pointerdown', (event) => drag.onPointerDown(event));
    handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }),
    );
    return { drag, handle, host };
}

describe('ReportCardDrag pointers', () => {
    it('ends the drag only on the release of the pointer that holds it', () => {
        const { drag, host } = grabbedCard();

        drag.onPointerUp(new PointerEvent('pointerup', { pointerId: 2 }));
        expect(drag.active).toBe(true);
        expect(host.commit).not.toHaveBeenCalled();

        drag.onPointerUp(new PointerEvent('pointerup', { pointerId: 1 }));
        expect(drag.active).toBe(false);
        expect(host.commit).toHaveBeenCalledOnce();
    });

    it('reverts the drag only on a cancel of the pointer that holds it', () => {
        const { drag, host } = grabbedCard();

        drag.onPointerCancel(new PointerEvent('pointercancel', { pointerId: 2 }));
        expect(drag.active).toBe(true);
        expect(host.moveTo).not.toHaveBeenCalled();

        drag.onPointerCancel(new PointerEvent('pointercancel', { pointerId: 1 }));
        expect(drag.active).toBe(false);
        expect(host.moveTo).toHaveBeenCalledWith('a', 0);
    });
});

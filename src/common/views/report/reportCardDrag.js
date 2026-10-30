/**
 * Pointer drag-reorder of the report cards, by their `.report-card-handle`. Moves the
 * dragged card while the pointer moves (one step per animation frame) and knows
 * nothing else about the view: order, cards, sheets and saving come in through the
 * host. Every step moves only the dragged card, so Escape or `pointercancel` moves it
 * back to where the drag started.
 */

/**
 * @typedef {object} ReportCardDragHost
 * @property {() => Array<string>} getIds - The report's card ids, in order.
 * @property {(id: string, index: number) => void} moveTo - Move one card to an index and re-run the layout.
 * @property {(id: string) => HTMLElement|undefined} getCard - The card element of an item.
 * @property {() => Array<HTMLElement>} getSheets - The page sheets, in page order.
 * @property {(id: string|null) => void} setDragging - Show which card is being dragged, or none.
 * @property {() => void} commit - Persist the order a finished drag left behind.
 */

export class ReportCardDrag {
    /** @type {ReportCardDragHost} */
    #host;
    /** @type {{id: string, pointerId: number, handle: HTMLElement, startIndex: number}|null} */
    #drag = null;
    #dragFrame = 0;
    /** @type {{x: number, y: number}|null} */
    #dragPointer = null;

    /** @param {ReportCardDragHost} host - What the drag reads from and reports back to the view. */
    constructor(host) {
        this.#host = host;
    }

    /** @returns {boolean} Whether a card is being dragged. */
    get active() {
        return this.#drag !== null;
    }

    /** @param {PointerEvent} event - Pointer press that may begin a card drag. */
    onPointerDown(event) {
        if (event.button !== 0 || this.#drag) return;
        const handle = /** @type {HTMLElement|null} */ (
            /** @type {HTMLElement} */ (event.target).closest('.report-card-handle')
        );
        const card = /** @type {HTMLElement|null} */ (handle?.closest('.report-card') ?? null);
        const id = card?.dataset.reportItemId;
        if (!handle || !card || !id) return;

        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        this.#drag = {
            id,
            pointerId: event.pointerId,
            handle,
            startIndex: this.#host.getIds().indexOf(id),
        };
        this.#host.setDragging(id);
    }

    /** @param {PointerEvent} event - Pointer movement during an active card drag. */
    onPointerMove(event) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
        this.#dragPointer = { x: event.clientX, y: event.clientY };
        if (this.#dragFrame) return;
        this.#dragFrame = requestAnimationFrame(() => {
            this.#dragFrame = 0;
            if (this.#drag && this.#dragPointer) this.#dragTo(this.#dragPointer);
        });
    }

    /** @param {PointerEvent} event - A pointer release; the dragging pointer's ends the drag. */
    onPointerUp(event) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
        this.#finishDrag();
        this.#host.commit();
    }

    /** @param {PointerEvent} event - A pointer cancel; the dragging pointer's reverts the drag. */
    onPointerCancel(event) {
        if (event.pointerId === this.#drag?.pointerId) this.cancel();
    }

    /** Move the dragged card back to where the drag started and stop dragging. */
    cancel() {
        const drag = this.#drag;
        if (!drag) return;
        this.#finishDrag();
        this.#host.moveTo(drag.id, drag.startIndex);
    }

    /**
     * Move the dragged card to the slot under the pointer. The cards whose
     * vertical extent contains the pointer form the target row; the one under
     * the pointer decides (before it in its left half, after it otherwise), or
     * the row's first/last card when the pointer is left/right of them all.
     * With nothing at that height — a page margin, the gap between two sheets,
     * past the last card — the slot follows the last card that ends above the
     * pointer on that page, or the last card of the pages before it, so
     * dropping between pages appends to the page above.
     * @param {{x: number, y: number}} pointer - Current pointer position, in viewport coordinates.
     */
    #dragTo(pointer) {
        if (!this.#drag) return;
        const ids = this.#host.getIds();
        const dragId = this.#drag.id;
        const from = ids.indexOf(dragId);
        if (from === -1) return;

        /** @type {Array<{id: string, rect: DOMRect}>} */
        const others = [];
        ids.forEach((id) => {
            const rect = this.#host.getCard(id)?.getBoundingClientRect();
            if (id !== dragId && rect) others.push({ id, rect });
        });
        if (others.length === 0) return;

        // With the sheets packed into columns, "in this row" and "above" only
        // mean anything inside one page: the sheet beside it carries cards at
        // the very same height. So the page under the pointer supplies the
        // candidates, and the pages before it decide the fallback slot.
        const page = pageUnder(this.#host.getSheets(), pointer);
        /**
         * @param {string} id
         * @returns {number} The page its card sits on.
         */
        const pageOf = (id) => Number(this.#host.getCard(id)?.dataset.page);
        const onPage = page === 0 ? others : others.filter(({ id }) => pageOf(id) === page);
        const earlier = page === 0 ? [] : others.filter(({ id }) => pageOf(id) < page);

        let target;
        const row = onPage.filter(({ rect }) => pointer.y >= rect.top && pointer.y <= rect.bottom);
        if (row.length > 0) {
            const under = row.find(({ rect }) => pointer.x >= rect.left && pointer.x <= rect.right);
            const leftOfRow = pointer.x < row[0].rect.left;
            const anchor = under ?? (leftOfRow ? row[0] : row[row.length - 1]);
            const after = under ? pointer.x > anchor.rect.left + anchor.rect.width / 2 : !leftOfRow;
            target = ids.indexOf(anchor.id) + (after ? 1 : 0);
        } else {
            const above = onPage.filter(({ rect }) => rect.bottom < pointer.y);
            const last = above[above.length - 1] ?? earlier[earlier.length - 1];
            target = last ? ids.indexOf(last.id) + 1 : 0;
        }
        // Removing the dragged card first shifts everything after it up by one.
        if (target > from) target -= 1;
        if (target === from) return;

        this.#host.moveTo(dragId, target);
    }

    #finishDrag() {
        const drag = this.#drag;
        this.#drag = null;
        this.#dragPointer = null;
        if (this.#dragFrame) {
            cancelAnimationFrame(this.#dragFrame);
            this.#dragFrame = 0;
        }
        if (!drag) return;
        this.#host.setDragging(null);
        if (drag.handle.hasPointerCapture?.(drag.pointerId))
            drag.handle.releasePointerCapture(drag.pointerId);
    }
}

/**
 * @param {Array<HTMLElement>} sheets - The page sheets, in page order.
 * @param {{x: number, y: number}} pointer - viewport coordinates
 * @returns {number} 1-based page under the pointer, 0 when it is over none
 */
function pageUnder(sheets, pointer) {
    return (
        sheets.findIndex((sheet) => {
            const rect = sheet.getBoundingClientRect();
            return (
                pointer.x >= rect.left &&
                pointer.x <= rect.right &&
                pointer.y >= rect.top &&
                pointer.y <= rect.bottom
            );
        }) + 1
    );
}

// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { html, render } from 'lit';
import {
    showViewSkeleton,
    hideViewSkeleton,
    restartSkeletonHold,
    skeletonHoldDelay,
    waitForSkeletonHold,
} from '../../../../src/common/app/viewSkeleton.js';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { BaseModule, waitForLayout } from '@tba3/module-base';
import { mountMainContent } from '../../../../packages/modules/test/support/domShell.js';
import { viewOptions } from '../../support/viewOptions.js';
import { EmptyView } from '../../support/emptyView.js';
import { queryAllHtml } from '../../../../packages/modules/test/support/dom.js';

/** A child whose content settles only when the test says so. */
class HeldChild extends BaseModule {
    /** Settles the wait _contentSettled() handed out; a no-op until it was asked. */
    #settle = () => {};

    settle() {
        this.#settle();
    }

    /**
     * @override
     * @returns {Promise<void>} Resolves once settle() runs.
     */
    _contentSettled() {
        return new Promise((resolve) => {
            this.#settle = () => resolve();
        });
    }
}
customElements.define('test-held-child', HeldChild);

/** A view with one child that holds its settle until the test releases it. */
class HeldView extends BaseViewModule {
    /** @type {HeldChild[]} The children built, newest last. */
    static children = [];

    /** @override */
    async _renderView() {
        const child = HeldChild.create(`${this.id}-child`, {});
        HeldView.children.push(child);
        render(html`${child}`, this);
    }
}
customElements.define('test-held-view', HeldView);

/**
 * @param {import('../../../../src/common/app/viewSkeleton.js').ViewSkeletonShape} skeleton - The placeholder shape.
 * @returns {import('../../support/viewOptions.js').TestViewOptions} The shell's view options with that shape.
 */
const withSkeleton = (skeleton) => ({ ...viewOptions(), skeleton });

/**
 * The placeholder covers two windows in which the view area is otherwise blank: the
 * lazy view import, and the render pass during which view-layout.css hides the view
 * with `visibility: hidden`. Each assertion fails if a change reopens one of them.
 */

/**
 * Build a `.view-shell` holding one view container inside `.main-content`, as
 * ViewLifecycle does.
 * @param {HTMLElement} [main] - The `.main-content` to add the shell to.
 */
function mountShell(main = mountMainContent()) {
    const shell = document.createElement('div');
    shell.className = 'view-shell';
    const viewContainer = document.createElement('div');
    shell.appendChild(viewContainer);
    main.appendChild(shell);
    return { main, shell, viewContainer };
}

/**
 * Place a view in a fresh shell, as the app does: its first render starts as it
 * connects.
 * @template {BaseViewModule<any>} V
 * @param {(new () => V) & Pick<typeof BaseViewModule, 'create'>} ViewClass
 * @param {import('../../../../src/common/app/viewSkeleton.js').ViewSkeletonShape} skeleton
 */
function placeView(ViewClass, skeleton) {
    const { main, viewContainer } = mountShell();
    const view = ViewClass.create('view', /** @type {V['options']} */ (withSkeleton(skeleton)));
    viewContainer.replaceWith(view);
    return { main, view };
}

/**
 * @param {HTMLElement} main
 */
const skeletonsIn = (main) => queryAllHtml(main, '.view-skeleton');

describe('viewSkeleton', () => {
    it('mounts the overlay beside the view container in its shell, never inside it', () => {
        // A view's render replaces its container's content, so a child overlay
        // would be wiped; the shell's grid cell stacks the overlay over the
        // container instead.
        const { main, shell, viewContainer } = mountShell();

        showViewSkeleton(viewContainer, 'split');

        expect(skeletonsIn(main)).toHaveLength(1);
        expect(viewContainer.children).toHaveLength(0);
        expect(skeletonsIn(main)[0].parentElement).toBe(shell);
    });

    it('shows the stack shape for a view without one', () => {
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer);

        const overlay = skeletonsIn(main)[0];
        expect(overlay.classList.contains('view-skeleton--stack')).toBe(true);
        expect(overlay.querySelectorAll('.skeleton-card')).toHaveLength(1);
    });

    it('hides itself from assistive tech, which reads aria-busy on the view instead', () => {
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer);

        expect(skeletonsIn(main)[0].getAttribute('aria-hidden')).toBe('true');
    });

    it('removes only the overlay belonging to the given container', () => {
        const { main, viewContainer: firstContainer } = mountShell();
        const { shell: otherShell, viewContainer: otherContainer } = mountShell(main);

        showViewSkeleton(firstContainer, 'split');
        showViewSkeleton(otherContainer, 'stack');
        hideViewSkeleton(firstContainer);

        const remaining = skeletonsIn(main);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].parentElement).toBe(otherShell);
    });

    it('holds a skeleton that has begun appearing, so it is never a half-faded ghost', () => {
        // A render finishing mid-fade reads as a flicker. The placeholder either
        // never paints or is held for the 200 ms fade-in, so it is opaque before
        // it goes.
        expect(skeletonHoldDelay(0)).toBe(0); // render beat the delay
        expect(skeletonHoldDelay(149)).toBe(0); // still inside it
        expect(skeletonHoldDelay(150)).toBe(200); // just started fading in
        expect(skeletonHoldDelay(250)).toBe(100); // mid-fade
        expect(skeletonHoldDelay(350)).toBe(0); // fully served its time
        expect(skeletonHoldDelay(5000)).toBe(0); // long past, never negative
    });

    it('reuses the mounted overlay instead of recreating it', async () => {
        // The app mounts it for the lazy-import window and the view's
        // beginViewRender() asks for it again. Recreating it would restart the
        // fade-in, so a placeholder already on screen would flash.
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer, 'stack');
        const first = skeletonsIn(main)[0];
        showViewSkeleton(viewContainer, 'stack');

        expect(skeletonsIn(main)).toHaveLength(1);
        expect(skeletonsIn(main)[0]).toBe(first);
    });

    it('waits out the remaining minimum display time before resolving', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
        const { main, viewContainer } = mountShell();
        showViewSkeleton(viewContainer, 'stack');
        skeletonsIn(main)[0].dataset.skeletonShownAt = String(Date.now() - 200);

        let done = false;
        waitForSkeletonHold(viewContainer).then(() => {
            done = true;
        });

        await vi.advanceTimersByTimeAsync(149);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toBe(true);
    });

    it('holds a placeholder whose hold restarted while the wait was running', async () => {
        // A revisit shows the hidden shell again, which starts the fade-in over
        // (restartSkeletonHold): a wait that began before it must not end mid-fade.
        vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
        const { main, viewContainer } = mountShell();
        showViewSkeleton(viewContainer, 'stack');
        const overlay = skeletonsIn(main)[0];
        // Just began fading in: the wait is the whole 200 ms fade.
        overlay.dataset.skeletonShownAt = String(Date.now() - 150);

        let done = false;
        waitForSkeletonHold(viewContainer).then(() => {
            done = true;
        });
        await vi.advanceTimersByTimeAsync(10);
        restartSkeletonHold(viewContainer);

        // The first wait ends 190 ms into the restarted fade-in: mid-fade.
        await vi.advanceTimersByTimeAsync(190);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(159);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toBe(true);
    });
});

describe('BaseViewModule render window', () => {
    beforeEach(() => {
        HeldView.children = [];
    });

    it('shows the skeleton alongside the attributes that blank the view', () => {
        // view-layout.css hides [data-view-rendering="true"]; without the
        // skeleton going up in the same step the user sees empty space.
        const { main, view } = placeView(HeldView, 'split');

        expect(view.getAttribute('data-view-rendering')).toBe('true');
        expect(view.getAttribute('aria-busy')).toBe('true');
        expect(skeletonsIn(main)[0].classList.contains('view-skeleton--split')).toBe(true);
    });

    it('covers the view before _renderView() runs and reveals only after it resolves', async () => {
        // The render template owns the cover pair, so a view that implements
        // _renderView() cannot forget to cover first or reveal last.
        let finishRender = () => {};
        /** @type {boolean|null} */
        let coveredDuringRender = null;
        class View extends BaseViewModule {
            /** @override */
            async _renderView() {
                coveredDuringRender =
                    this.getAttribute('data-view-rendering') === 'true' &&
                    this.parentElement?.querySelector('.view-skeleton') != null;
                await new Promise((resolve) => {
                    finishRender = () => resolve(undefined);
                });
            }
        }
        customElements.define('test-covered-view', View);

        const { main, view } = placeView(View, 'stack');
        expect(coveredDuringRender).toBe(true);
        await waitForLayout();
        expect(view.getAttribute('data-view-rendering')).toBe('true');

        finishRender();
        await view.whenRevealed();

        expect(view.hasAttribute('data-view-rendering')).toBe(false);
        expect(skeletonsIn(main)).toHaveLength(0);
    });

    it('keeps the skeleton up until the layout pass that actually reveals the view', async () => {
        // Callers do not await revealView(), so taking the skeleton down
        // synchronously would expose the blank window for the frames before the
        // view becomes visible.
        const { main, view } = placeView(EmptyView, 'stack');
        await view.contentComplete;

        expect(skeletonsIn(main)).toHaveLength(1);
        expect(view.getAttribute('data-view-rendering')).toBe('true');

        await view.whenRevealed();

        // The render beat the anti-flash delay: the skeleton never painted and
        // goes as soon as the view is revealed.
        expect(skeletonsIn(main)).toHaveLength(0);
        expect(view.hasAttribute('data-view-rendering')).toBe(false);
        expect(view.hasAttribute('aria-busy')).toBe(false);
    });

    it('waits for a child that is still settling before revealing', async () => {
        // A child's content pass resolving does not put its content on screen: a
        // Tabulator builds and re-measures over later frames, and a view revealed
        // first shows the table assembling.
        // The clock stands still, so the frame waits below never push the
        // placeholder past its anti-flash delay into a minimum-display hold.
        vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
        const { main, view } = placeView(HeldView, 'stack');
        await view.contentComplete;
        await waitForLayout();
        await waitForLayout();

        expect(view.getAttribute('data-view-rendering')).toBe('true');
        expect(skeletonsIn(main)).toHaveLength(1);

        HeldView.children[0].settle();
        await view.whenRevealed();

        expect(view.hasAttribute('data-view-rendering')).toBe(false);
    });

    it('reveals anyway when a child never reports settled', async () => {
        // Fail-safe: a module that never settles must not strand the view behind
        // its placeholder. BaseModule's settle cap, restated.
        const SETTLE_TIMEOUT_MS = 3000;
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { view } = placeView(HeldView, 'stack');
        await view.contentComplete;
        const revealed = view.whenRevealed();

        await vi.advanceTimersByTimeAsync(SETTLE_TIMEOUT_MS);
        vi.useRealTimers();

        await expect(revealed).resolves.toBeUndefined();
        expect(view.hasAttribute('data-view-rendering')).toBe(false);
    });

    it('takes the placeholder down when the view is removed mid-render', async () => {
        // A view can be removed while still covered (the first-render catch in
        // viewLifecycle.js). The overlay is a sibling of the view, so only the view's
        // own teardown takes it along.
        const { main, view } = placeView(HeldView, 'stack');
        await view.contentComplete;

        view.remove();
        // Teardown waits out a move, one microtask.
        await Promise.resolve();

        expect(skeletonsIn(main)).toHaveLength(0);
        expect(view.hasAttribute('data-view-rendering')).toBe(false);
        expect(view.hasAttribute('aria-busy')).toBe(false);
    });

    it('never leaves a placeholder standing over an uncovered view', async () => {
        // Sampled across the whole reveal: a .view-skeleton coexists only with a
        // view that still carries the rendering attribute. Revealing first would
        // show the finished content under a placeholder still fading in.
        const { main, view } = placeView(HeldView, 'stack');
        await view.contentComplete;
        skeletonsIn(main)[0].dataset.skeletonShownAt = String(Date.now() - 200);
        HeldView.children[0].settle();

        await waitForLayout();
        await waitForLayout();
        // Still inside the minimum display time: the view must remain covered.
        expect(view.getAttribute('data-view-rendering')).toBe('true');
        expect(skeletonsIn(main)).toHaveLength(1);

        /** @type {number[]} */
        const violations = [];
        for (let i = 0; i < 60; i++) {
            const covered = view.hasAttribute('data-view-rendering');
            const hasSkeleton = skeletonsIn(main).length > 0;
            if (hasSkeleton && !covered) violations.push(i);
            if (!hasSkeleton && !covered) break;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        expect(violations).toEqual([]);
        expect(view.hasAttribute('data-view-rendering')).toBe(false);
        expect(skeletonsIn(main)).toHaveLength(0);
    });
});

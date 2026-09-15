// @vitest-browser

import { describe, it, expect, beforeEach } from 'vitest';
import {
    showViewSkeleton,
    hideViewSkeleton,
    skeletonHoldDelay,
    waitForSkeletonHold,
} from '../../../../src/common/app/viewSkeleton.js';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { BaseModule } from '@tba3/module-base/modules/baseModule.js';
import { mountMainContent } from '../../support/domShell.js';

/**
 * These tests encode *why* the skeleton is built the way it is, not just that
 * it renders: the placeholder exists to cover two windows in which the view
 * area is otherwise blank (the lazy view import, and the render pass during
 * which view-layout.css hides the view with `visibility: hidden`). Each
 * assertion below fails if a change reopens one of those windows.
 */

/** Build a `.main-content` shell holding one view container, as appModule does. */
function mountShell(containerId = 'view-container') {
    const main = mountMainContent();
    const viewContainer = document.createElement('div');
    viewContainer.id = containerId;
    main.appendChild(viewContainer);
    return { main, viewContainer };
}

const skeletonsIn = (main) => main.querySelectorAll('.view-skeleton');

describe('viewSkeleton', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('mounts the overlay as a sibling of the view container, never a child', () => {
        // Every view rebuilds container.innerHTML after beginViewRender(), so a
        // child overlay would be wiped before it was ever seen.
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer, 'split');

        expect(skeletonsIn(main)).toHaveLength(1);
        expect(viewContainer.children).toHaveLength(0);
        expect(skeletonsIn(main)[0].parentElement).toBe(main);
    });

    it('is idempotent so the app and the view can both assert it', () => {
        // The app mounts it for the lazy-import window; the view's
        // beginViewRender() asserts it again. Neither tracks the other's state,
        // so the second call must not stack a duplicate overlay.
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer, 'split');
        showViewSkeleton(viewContainer, 'split');

        expect(skeletonsIn(main)).toHaveLength(1);
    });

    it('draws the card count and modifier for the requested shape', () => {
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer, 'triple');

        const overlay = skeletonsIn(main)[0];
        expect(overlay.classList.contains('view-skeleton--triple')).toBe(true);
        expect(overlay.querySelectorAll('.skeleton-card')).toHaveLength(3);
    });

    it('falls back to the stack shape for an unknown or missing shape', () => {
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer, 'nonsense');

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
        const { main } = mountShell('view-a');
        const otherContainer = document.createElement('div');
        otherContainer.id = 'view-b';
        main.appendChild(otherContainer);
        const firstContainer = /** @type {HTMLElement} */ (main.querySelector('#view-a'));

        showViewSkeleton(firstContainer, 'split');
        showViewSkeleton(otherContainer, 'stack');
        hideViewSkeleton(firstContainer);

        const remaining = skeletonsIn(main);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].dataset.skeletonFor).toBe('view-b');
    });

    it('holds a skeleton that has begun appearing, so it is never a half-faded ghost', () => {
        // A render finishing mid-fade is the worst outcome: visible enough to
        // register as a flicker, not long enough to read as a placeholder.
        // Either it never paints, or it stays long enough to be understood — the
        // hold is exactly the 200 ms fade-in, so it is fully opaque before it goes.
        expect(skeletonHoldDelay(0)).toBe(0); // render beat the delay
        expect(skeletonHoldDelay(149)).toBe(0); // still inside it
        expect(skeletonHoldDelay(150)).toBe(200); // just started fading in
        expect(skeletonHoldDelay(250)).toBe(100); // mid-fade
        expect(skeletonHoldDelay(350)).toBe(0); // fully served its time
        expect(skeletonHoldDelay(5000)).toBe(0); // long past, never negative
    });

    it('removes immediately when the render beat the anti-flash delay', () => {
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer, 'stack');
        hideViewSkeleton(viewContainer);

        expect(skeletonsIn(main)).toHaveLength(0);
    });

    it('reuses the mounted overlay instead of recreating it', async () => {
        // Recreating would restart the fade-in from zero, so a placeholder that
        // is already on screen would visibly flash.
        const { main, viewContainer } = mountShell();

        showViewSkeleton(viewContainer, 'stack');
        const first = skeletonsIn(main)[0];
        showViewSkeleton(viewContainer, 'stack');

        expect(skeletonsIn(main)).toHaveLength(1);
        expect(skeletonsIn(main)[0]).toBe(first);
    });

    it('waits out the remaining minimum display time before resolving', async () => {
        const { main, viewContainer } = mountShell();
        showViewSkeleton(viewContainer, 'stack');
        skeletonsIn(main)[0].dataset.skeletonShownAt = String(Date.now() - 200);

        let done = false;
        const hold = waitForSkeletonHold(viewContainer).then(() => {
            done = true;
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(done).toBe(false);
        await hold;
        expect(done).toBe(true);
    });

    it('does not wait when the placeholder never painted', async () => {
        const { viewContainer } = mountShell();
        showViewSkeleton(viewContainer, 'stack');

        // Mounted just now, still inside the anti-flash delay.
        await expect(waitForSkeletonHold(viewContainer)).resolves.toBeUndefined();
    });

    it('tolerates hiding when nothing is mounted', () => {
        const { main, viewContainer } = mountShell();

        expect(() => hideViewSkeleton(viewContainer)).not.toThrow();
        expect(skeletonsIn(main)).toHaveLength(0);
    });

    it('ignores a container that is not in the DOM', () => {
        const detached = document.createElement('div');

        expect(() => showViewSkeleton(detached, 'stack')).not.toThrow();
        expect(document.querySelectorAll('.view-skeleton')).toHaveLength(0);
    });
});

describe('BaseViewModule render window', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('shows the skeleton alongside the attributes that blank the view', () => {
        // view-layout.css hides [data-view-rendering="true"]; without the
        // skeleton going up in the same step the user sees empty space.
        const { main, viewContainer } = mountShell();
        const view = new BaseViewModule('view', viewContainer, { skeleton: 'split' });

        view.beginViewRender();

        expect(viewContainer.getAttribute('data-view-rendering')).toBe('true');
        expect(viewContainer.getAttribute('aria-busy')).toBe('true');
        expect(skeletonsIn(main)[0].classList.contains('view-skeleton--split')).toBe(true);
    });

    it('covers the view before _renderView() runs and reveals only after it resolves', async () => {
        // The render template is the one place the cover pair lives: a view that
        // implements _renderView() cannot forget to cover first or reveal last.
        // Without the template, a view that skipped revealView() would sit
        // behind its placeholder for the whole settle fail-safe.
        const { main, viewContainer } = mountShell();
        let finishRender = () => {};
        let coveredDuringRender = null;
        class View extends BaseViewModule {
            async _renderView() {
                coveredDuringRender =
                    viewContainer.getAttribute('data-view-rendering') === 'true' &&
                    skeletonsIn(main).length === 1;
                await new Promise((resolve) => {
                    finishRender = resolve;
                });
            }
        }
        const view = new View('view', viewContainer, { skeleton: 'stack' });

        const rendering = view.init({});
        await Promise.resolve();
        expect(coveredDuringRender).toBe(true);
        expect(viewContainer.getAttribute('data-view-rendering')).toBe('true');

        finishRender();
        await rendering;
        await view.waitForLayout();
        await view.waitForLayout();

        expect(viewContainer.hasAttribute('data-view-rendering')).toBe(false);
        expect(skeletonsIn(main)).toHaveLength(0);
    });

    it('keeps the skeleton up until the layout pass that actually reveals the view', async () => {
        // revealView() is deliberately not awaited by callers, so tearing the
        // skeleton down synchronously would re-expose the blank window for the
        // couple of frames before the view becomes visible.
        const { main, viewContainer } = mountShell();
        const view = new BaseViewModule('view', viewContainer, { skeleton: 'stack' });

        view.beginViewRender();
        view.revealView();

        expect(skeletonsIn(main)).toHaveLength(1);
        expect(viewContainer.getAttribute('data-view-rendering')).toBe('true');

        await view.waitForLayout();
        await view.waitForLayout();

        // Render beat the anti-flash delay, so the skeleton never painted and
        // is dropped as soon as the view is actually revealed.
        expect(skeletonsIn(main)).toHaveLength(0);
        expect(viewContainer.hasAttribute('data-view-rendering')).toBe(false);
        expect(viewContainer.hasAttribute('aria-busy')).toBe(false);
    });

    it('waits for a child that is still settling before revealing', async () => {
        // A child's _doRender() resolving does not mean its content is on
        // screen — a Tabulator builds and re-measures over later frames. If the
        // view reveals first, the user watches the table assemble itself.
        const { main, viewContainer } = mountShell();
        const view = new BaseViewModule('view', viewContainer, { skeleton: 'stack' });

        let settleChild = () => {};
        const child = new BaseModule('child', document.createElement('div'));
        child.whenSettled = () =>
            new Promise((resolve) => {
                settleChild = resolve;
            });
        view.registerChildModule(child);

        view.beginViewRender();
        view.revealView();
        await view.waitForLayout();
        await view.waitForLayout();

        // Child has not settled: view stays hidden, skeleton stays up.
        expect(viewContainer.getAttribute('data-view-rendering')).toBe('true');
        expect(skeletonsIn(main)).toHaveLength(1);

        // Re-stamp the placeholder's mount time so the reveal's
        // waitForSkeletonHold() measures elapsed from here — not from
        // beginViewRender(). Otherwise the frame waits above can push elapsed
        // past the 150ms anti-flash delay, turning the hold into a 200-350ms
        // wait this test never awaits (the pre-existing ~25% flake). The
        // sibling holds use the same stamping to control that timing.
        skeletonsIn(main)[0].dataset.skeletonShownAt = String(Date.now());
        settleChild();
        await view.waitForLayout();
        await view.waitForLayout();
        await view.waitForLayout();

        expect(viewContainer.hasAttribute('data-view-rendering')).toBe(false);
    });

    it('reveals anyway when a child never reports settled', async () => {
        // Fail-safe: a module that never settles must not strand the view
        // behind its placeholder forever.
        const { viewContainer } = mountShell();
        const view = new BaseViewModule('view', viewContainer, { skeleton: 'stack' });

        const child = new BaseModule('child', document.createElement('div'));
        child.whenSettled = () => new Promise(() => {}); // never resolves
        view.registerChildModule(child);

        view.beginViewRender();
        const settled = view.whenSubtreeSettled(30);
        await expect(settled).resolves.toBeUndefined();
    });

    it('stays covered for the whole minimum display time, then uncovers and drops the placeholder together', async () => {
        // The regression this guards: revealing first and removing the
        // placeholder afterwards showed the finished content underneath a
        // placeholder that was still fading in — a visible flicker on any view
        // that settles inside the hold window.
        const { main, viewContainer } = mountShell();
        const view = new BaseViewModule('view', viewContainer, { skeleton: 'stack' });

        view.beginViewRender();
        // Stand in for a render slow enough that the placeholder faded in.
        skeletonsIn(main)[0].dataset.skeletonShownAt = String(Date.now() - 200);
        view.revealView();

        await view.waitForLayout();
        await view.waitForLayout();

        // Still inside the hold: the view must remain covered.
        expect(viewContainer.getAttribute('data-view-rendering')).toBe('true');
        expect(skeletonsIn(main)).toHaveLength(1);

        await new Promise((resolve) => setTimeout(resolve, 400));

        // Both happen together — never one without the other.
        expect(viewContainer.hasAttribute('data-view-rendering')).toBe(false);
        expect(skeletonsIn(main)).toHaveLength(0);
    });

    it('takes the placeholder down when the view is destroyed mid-render', () => {
        // A view can be destroyed while still covered (initializeView()'s catch
        // in appModule.js). The overlay is a *sibling* of the container, so
        // nothing BaseModule.destroy() does can reach it — without this, the
        // placeholder and its resize observation outlive the view that mounted
        // them, and only the caller's own follow-up cleanup would remove them.
        const { main, viewContainer } = mountShell();
        const view = new BaseViewModule('view', viewContainer, { skeleton: 'stack' });

        view.beginViewRender();
        view.destroy();

        expect(skeletonsIn(main)).toHaveLength(0);
        expect(viewContainer.hasAttribute('data-view-rendering')).toBe(false);
        expect(viewContainer.hasAttribute('aria-busy')).toBe(false);
    });

    it('never leaves a placeholder standing over an uncovered view', async () => {
        // The invariant, sampled across the whole reveal: a .view-skeleton may
        // only ever coexist with a container that still carries the rendering
        // attribute. This is the assertion the original bug slipped past.
        const { main, viewContainer } = mountShell();
        const view = new BaseViewModule('view', viewContainer, { skeleton: 'stack' });

        view.beginViewRender();
        skeletonsIn(main)[0].dataset.skeletonShownAt = String(Date.now() - 200);
        view.revealView();

        const violations = [];
        for (let i = 0; i < 60; i++) {
            const covered = viewContainer.hasAttribute('data-view-rendering');
            const hasSkeleton = skeletonsIn(main).length > 0;
            if (hasSkeleton && !covered) violations.push(i);
            if (!hasSkeleton && !covered) break;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        expect(violations).toEqual([]);
        expect(viewContainer.hasAttribute('data-view-rendering')).toBe(false);
        expect(skeletonsIn(main)).toHaveLength(0);
    });
});

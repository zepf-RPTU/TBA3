// @vitest-browser

import { describe, expect, it, vi } from 'vitest';

import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { mountEmptyView } from '../../support/emptyView.js';
import { queryHtml } from '../../../../packages/modules/test/support/dom.js';

/**
 * A view with nothing to render: only its cover is under test.
 * @returns {Promise<import('../../support/emptyView.js').EmptyView>} A rendered, uncovered view.
 */
async function makeView() {
    const { view } = await mountEmptyView();
    await view.whenRevealed();
    return view;
}

/** @returns {{promise: Promise<void>, resolve: () => void}} */
function deferred() {
    /** @type {() => void} */
    let resolve = () => {};
    /** @type {Promise<void>} */
    const promise = new Promise((r) => {
        resolve = () => r();
    });
    return { promise, resolve };
}

const covered = (/** @type {HTMLElement} */ view) =>
    view.hasAttribute(BaseViewModule.RENDERING_ATTRIBUTE);

describe('BaseViewModule.coverWhile', () => {
    it('covers the view while the work runs and uncovers it once it has settled', async () => {
        const view = await makeView();
        const work = deferred();

        const cover = view.coverWhile(work.promise);
        expect(covered(view)).toBe(true);

        work.resolve();
        await cover;
        expect(covered(view)).toBe(false);
    });

    it('counts the placeholder hold from a revisit that finds it still up', async () => {
        // Hiding the shell stops the placeholder's fade-in and showing it starts that
        // over: a hold counted from the first mount would take it down half faded in.
        const view = await makeView();
        const work = deferred();
        const cover = view.coverWhile(work.promise);
        const placeholder = queryHtml(document.body, ':scope > .view-skeleton');
        const mountedAt = Number(placeholder.dataset.skeletonShownAt);
        view.hide();
        const now = vi.spyOn(Date, 'now').mockReturnValue(mountedAt + 5000);

        view.show();

        expect(placeholder.dataset.skeletonShownAt).toBe(String(mountedAt + 5000));
        now.mockRestore();
        work.resolve();
        await cover;
    });

    it('leaves the uncovering to a newer cover while that one still works', async () => {
        // A second layout switch during the first one's build: uncovering when the
        // first build settles would show the second one assembling.
        const view = await makeView();
        const first = deferred();
        const second = deferred();

        const firstCover = view.coverWhile(first.promise);
        const secondCover = view.coverWhile(second.promise);
        first.resolve();
        await firstCover;
        expect(covered(view)).toBe(true);

        second.resolve();
        await secondCover;
        expect(covered(view)).toBe(false);
    });
});

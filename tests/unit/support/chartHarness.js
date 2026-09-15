/**
 * Shared fixtures for ChartRenderer / ChartHostModule lifecycle suites (browser project).
 *
 * The container factory mounts a div into the live document, which is what
 * ChartRenderer's hidden-container skip in `_render()` checks (`offsetParent`), so
 * render passes run against real layout.
 */

/**
 * Create a container div that ChartRenderer treats as visible.
 * @param {string} [id]
 * @returns {HTMLDivElement}
 */
export function makeVisibleChartContainer(id = 'chart') {
    const container = document.createElement('div');
    container.id = id;
    document.body.appendChild(container);
    return container;
}

/**
 * Minimal stand-in for ResizeService, injected via `options.resizeService`.
 *
 * `removeByScope` records the scope but deliberately keeps the observation, so
 * `trigger()` can simulate a stray late resize callback (e.g. a debounce timer
 * that fired after destroy) — the case ChartRenderer must survive via its
 * destroyed guard rather than by trusting the observer was unhooked in time.
 */
export class FakeResizeService {
    observations = [];
    removedScopes = [];

    observe(target, callback, options = {}) {
        this.observations.push({ target, callback, options });
    }

    unobserve(target) {
        this.observations = this.observations.filter((entry) => entry.target !== target);
    }

    removeByScope(scopeId) {
        this.removedScopes.push(scopeId);
    }

    trigger() {
        for (const { callback } of this.observations) callback();
    }
}

/**
 * Await `count` animation-frame turns. `create()` registers its resize
 * observer behind a double-nested rAF, so tests that need the observer
 * registered await two frames.
 * @param {number} [count]
 * @returns {Promise<void>}
 */
export function nextAnimationFrames(count = 2) {
    let chain = Promise.resolve();
    for (let i = 0; i < count; i++) {
        chain = chain.then(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    }
    return chain;
}

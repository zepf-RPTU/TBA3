/**
 * The DOM shell an app or view module expects to be mounted into.
 *
 * `.main-content` is the contract: bootstrapDashboardApp resolves it, and
 * BaseAppModule builds every view container beneath it. Suites that mount module
 * lifecycles need that structure to exist before they construct anything, so the
 * selector is asserted in one place rather than re-typed per suite.
 *
 * Resets `document.body` first — the browser page is per *file*, not per test, so a
 * suite that skips the reset inherits the previous test's nodes.
 */

/**
 * Build an empty `.main-content` shell.
 *
 * @param {string} [id] Optional id for the shell element.
 * @returns {HTMLDivElement} The mounted `.main-content` element.
 */
export function mountMainContent(id) {
    document.body.innerHTML = '';
    const main = document.createElement('div');
    main.className = 'main-content';
    if (id) main.id = id;
    document.body.appendChild(main);
    return main;
}

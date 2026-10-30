/**
 * The DOM shell an app or view module is mounted into: a host resolves `.main-content`
 * and builds every view container beneath it, so it must exist before a suite
 * constructs a module.
 */

/**
 * Build an empty `.main-content` shell.
 * @returns {HTMLDivElement} Appended to the body.
 */
export function mountMainContent() {
    const main = document.createElement('div');
    main.className = 'main-content';
    document.body.appendChild(main);
    return main;
}

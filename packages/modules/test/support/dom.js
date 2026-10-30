/**
 * Typed DOM queries for tests: a test that clicks, styles or reads the dataset of a node
 * it just rendered needs it as an `HTMLElement`, present, or fails here naming the
 * selector instead of on the next property access.
 */

/**
 * The HTML element a selector finds under a root, asserted present.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement} The first match.
 * @throws {Error} when nothing matches, or the match is no HTML element
 */
export function queryHtml(root, selector) {
    const element = root.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
        throw new Error(`Expected an HTML element at ${selector}`);
    }
    return element;
}

/**
 * Every HTML element a selector finds under a root.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement[]} The matches that are HTML elements, in document order.
 */
export function queryAllHtml(root, selector) {
    return [...root.querySelectorAll(selector)].filter((el) => el instanceof HTMLElement);
}

/**
 * The pills of a legend panel, in order, within the section its heading names.
 * @param {ParentNode} panel
 * @param {string} [section] - The heading text of the section to look in; none looks in every section.
 * @returns {HTMLButtonElement[]}
 */
function legendPills(panel, section) {
    return [...panel.querySelectorAll('.legend-section')]
        .filter(
            (node) =>
                section === undefined ||
                node.querySelector(':scope > .legend-section-title')?.textContent?.trim() ===
                    section,
        )
        .flatMap((node) => [...node.querySelectorAll('button.legend-pill')])
        .filter((pill) => pill instanceof HTMLButtonElement);
}

/**
 * A legend pill, found as a reader finds it: by its label, within the section its
 * heading names.
 * @param {ParentNode} panel
 * @param {string} label - The pill's text, whitespace collapsed.
 * @param {string} [section] - The heading text of the section to look in; none looks in every section.
 * @returns {HTMLButtonElement}
 * @throws {Error} when no pill, or more than one, carries that label
 */
export function legendPill(panel, label, section) {
    const pills = legendPills(panel, section).filter(
        (pill) => pill.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
    if (pills.length !== 1) {
        throw new Error(`Expected one legend pill labelled ${label}, found ${pills.length}`);
    }
    return pills[0];
}

/**
 * The lines of an element's delegated tooltip — the title, then each row as `label: value`.
 * @param {Element} element
 * @returns {string[]} The lines, whitespace collapsed.
 */
export function tooltipLines(element) {
    const host = document.createElement('div');
    host.innerHTML = element.getAttribute('data-tooltip-html') ?? '';
    return [...host.querySelectorAll('.tooltip-title, .tooltip-row')].map((node) =>
        node.textContent.replace(/\s+/g, ' ').trim(),
    );
}

/**
 * Await `count` animation-frame turns: work a module schedules behind
 * `requestAnimationFrame` (a redraw, a nested observer registration) has run once as
 * many frames have passed as it nests.
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

/**
 * Connect a module under `parent` with a payload and wait until it has settled.
 * @template {import('@tba3/module-base').BaseModule<any>} M
 * @param {M} module
 * @param {unknown} [data] - Left out, the module keeps its own.
 * @param {ParentNode} [parent]
 * @returns {Promise<M>}
 */
export async function mountModule(module, data, parent = document.body) {
    if (data !== undefined) module.data = data;
    parent.append(module);
    await module.updateComplete;
    return module;
}

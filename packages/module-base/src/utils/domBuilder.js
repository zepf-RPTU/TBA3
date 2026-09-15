/**
 * Small DOM construction helpers for view/module scaffolding.
 * Keep these intentionally low-level so local layouts remain readable.
 */

/**
 * Create an element and assign common properties in one place.
 * @param {string} tagName - Tag to create
 * @param {object} [options] - Properties to assign after creation; anything omitted is left untouched.
 * @param {string} [options.id] - Element id.
 * @param {string|string[]} [options.className] - One class, or several to add.
 * @param {string} [options.textContent] - Text content, set before any children are appended.
 * @param {{[name: string]: string}} [options.attributes] - Attributes to set, by name.
 * @param {{[key: string]: string}} [options.dataset] - `data-*` values to set, by key.
 * @param {Array<Node|null|undefined>} [children] - Children to append; nullish entries are skipped.
 * @returns {HTMLElement} The created element, fully populated.
 */
export function createElement(tagName, options = {}, children = []) {
    const element = document.createElement(tagName);
    const { id, className, textContent, attributes, dataset } = options;

    if (id) element.id = id;
    if (Array.isArray(className)) {
        element.className = className.filter(Boolean).join(' ');
    } else if (className) {
        element.className = className;
    }
    if (textContent !== undefined) element.textContent = textContent;

    if (attributes) {
        Object.entries(attributes).forEach(([name, value]) => {
            if (value !== undefined && value !== null) element.setAttribute(name, String(value));
        });
    }

    if (dataset) {
        Object.entries(dataset).forEach(([name, value]) => {
            if (value !== undefined && value !== null) element.dataset[name] = String(value);
        });
    }

    appendChildren(element, children);
    return element;
}

/**
 * Append a list of child nodes, ignoring nullish entries.
 * @param {HTMLElement} parent - Element to append to.
 * @param {Array<Node|null|undefined>} children - Children to append; nullish entries are skipped.
 * @returns {HTMLElement} The same parent, for chaining.
 */
export function appendChildren(parent, children = []) {
    children.forEach((child) => {
        if (child instanceof Node) parent.appendChild(child);
    });
    return parent;
}

/**
 * Create a div placeholder used as a module host.
 * @param {string} id - Id the module will later mount against.
 * @param {string|string[]} [className] - One class, or several to add.
 * @returns {HTMLElement} An empty div ready to host a module.
 */
export function createPlaceholder(id, className = '') {
    return createElement('div', { id, className });
}

/**
 * Query a single element as an HTMLElement. Centralizes the
 * `querySelector(...)` → HTMLElement cast so call sites don't repeat it.
 * @param {Element|Document|null} root - Where to search; a nullish root yields null.
 * @param {string} selector - Selector to match.
 * @returns {HTMLElement|null} The first match, already cast, or null.
 */
export function queryEl(root, selector) {
    return /** @type {HTMLElement|null} */ (root?.querySelector(selector) ?? null);
}

/**
 * Read an event's target as an HTMLElement. Centralizes the
 * `event.target` (EventTarget | null) → HTMLElement cast.
 * @param {Event} event - The event whose target is wanted.
 * @returns {HTMLElement|null} The event's target, already cast.
 */
export function targetEl(event) {
    return /** @type {HTMLElement|null} */ (event.target);
}

/**
 * Whether an event travelled through an element carrying `className`. Reads the
 * composed path rather than `event.target.closest(...)`: a handler that rebuilds
 * its DOM on click (a menu row replaced on toggle) detaches the target before the
 * event reaches later listeners, and `closest()` on a detached node finds nothing.
 * @param {Event} event - The event whose path is inspected.
 * @param {string} className - The class to look for on any node in the path.
 * @returns {boolean} True when some node in the path carries the class.
 */
export function eventPathHasClass(event, className) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.some((node) => /** @type {any} */ (node)?.classList?.contains?.(className));
}

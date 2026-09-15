import {
    ensureHeaderActionButtonControl,
    ensureHeaderActionCheckboxDropdownControl,
} from '@tba3/module-base/modules/header/headerActionDropdown.js';

/**
 * Ensure an idempotent header action toggle button exists in a chart host header.
 * The caller owns the click behavior and visual sync; this helper owns only DOM creation,
 * button reuse, and click rebinding.
 * @param {import('./chartHostModule.js').ChartHostModule | object} host - The chart host whose header the control belongs to.
 * @param {object} options - Where to find or mount the button, and what it does when clicked.
 * @param {string} options.selector - Selector used to find an existing button
 * @param {string} [options.buttonClass] - Custom button class name(s)
 * @param {{[name: string]: string}} [options.buttonAttributes] - Extra attributes to stamp on the button
 * @param {string} options.ariaLabel - Accessible label
 * @param {string} [options.tooltipText] - Tooltip text
 * @param {(button: HTMLButtonElement, host: object) => void} [options.syncButton] - Sync icon/active state
 * @param {(button: HTMLButtonElement, host: object) => void} [options.onClick] - Click behavior
 * @returns {HTMLButtonElement|null} The button, newly created or the existing one; null when the host has no matching action area.
 */
export function ensureHeaderActionButton(host, options = /** @type {any} */ ({})) {
    const {
        selector,
        buttonClass,
        buttonAttributes = null,
        ariaLabel,
        tooltipText = ariaLabel,
        syncButton = null,
        onClick = null,
    } = options;

    const actionContainer = host?.headerActionsContainer ?? null;
    return ensureHeaderActionButtonControl(actionContainer, {
        selector,
        buttonClass,
        buttonAttributes,
        ariaLabel,
        tooltipText,
        syncButton: (button) => syncButton?.(button, host),
        onClick: (button) => onClick?.(button, host),
    });
}

/**
 * Ensure an idempotent checkbox-style dropdown control exists in a chart host header.
 * The caller owns item resolution and toggle behavior; this helper owns DOM creation
 * and consistent menu item rendering.
 * @param {import('./chartHostModule.js').ChartHostModule | object} host - The chart host whose header the control belongs to.
 * @param {object} options - Where to find or mount the dropdown, and how its items are resolved and toggled.
 * @param {string} options.wrapperSelector - Selector used to find an existing wrapper
 * @param {string} [options.wrapperClass] - Optional wrapper class name
 * @param {string} [options.buttonClass] - Custom button class name(s)
 * @param {string} options.ariaLabel - Accessible label
 * @param {string} [options.tooltipText] - Tooltip text
 * @param {string} [options.buttonHTML] - Initial button HTML
 * @param {{[name: string]: string}} [options.wrapperAttributes] - Extra attributes to stamp on the wrapper
 * @param {{[name: string]: string}} [options.buttonAttributes] - Extra attributes to stamp on the button
 * @param {(host: object) => Array<{id: string, label: string, checked: boolean, disabled?: boolean}>} options.getItems - Returns the menu items and their checked state, called each time the menu opens.
 * @param {(item: object, host: object) => void} options.onToggle - Applies a toggled item back to the chart.
 * @returns {{wrapper: HTMLDivElement, button: HTMLButtonElement, dropdown: HTMLUListElement}|null} The wrapper, button and dropdown; null when the host has no matching action area.
 */
export function ensureHeaderActionCheckboxDropdown(host, options = /** @type {any} */ ({})) {
    const {
        wrapperSelector,
        wrapperClass,
        wrapperAttributes = null,
        buttonClass,
        buttonAttributes = null,
        ariaLabel,
        tooltipText = ariaLabel,
        buttonHTML = '',
        getItems = () => [],
        onToggle = null,
    } = options;

    const actionContainer = host?.headerActionsContainer ?? null;
    if (!actionContainer || !wrapperSelector) return null;

    return ensureHeaderActionCheckboxDropdownControl(actionContainer, {
        wrapperSelector,
        wrapperClass,
        wrapperAttributes,
        buttonClass,
        buttonAttributes,
        ariaLabel,
        tooltipText,
        buttonHTML,
        getItems,
        onToggle,
        context: host,
    });
}

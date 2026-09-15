import { toggleDropdown } from './dropdownManager.js';
import './headerActionDropdown.css';

const HEADER_ACTION_BUTTON_CLASS = 'btn btn--icon';
const HEADER_ACTION_MENU_ITEM_CLASS = 'btn btn--item header-action-dropdown-option';
const HEADER_ACTION_DROPDOWN_WRAPPER_CLASS = 'header-action-dropdown-wrapper';

/**
 * Set a batch of attributes, skipping nullish values.
 * @param {any} element - Element to set them on.
 * @param {object|null} [attributes] - Attribute name to value; nullish entries are left unset.
 */
function setElementAttributes(element, attributes = null) {
    if (!(element instanceof Element)) return;

    Object.entries(attributes || {}).forEach(([attributeName, attributeValue]) => {
        if (attributeValue === false || attributeValue === null || attributeValue === undefined) {
            element.removeAttribute(attributeName);
            return;
        }

        element.setAttribute(attributeName, String(attributeValue));
    });
}

/**
 * Add a space-separated class list, ignoring empty entries.
 * @param {any} element - Element to add the classes to.
 * @param {string} [classNameString=''] - Space-separated class names.
 */
function applyClassNames(element, classNameString = '') {
    if (!(element instanceof Element)) return;

    const classNames = [
        HEADER_ACTION_DROPDOWN_WRAPPER_CLASS,
        ...String(classNameString).split(/\s+/),
    ]
        .map((className) => className.trim())
        .filter(Boolean);

    element.classList.add(...classNames);
}

/**
 * The popup trigger among a wrapper’s direct children.
 * @param {any} wrapper - The control wrapper to search.
 * @returns {any} The trigger button, or null when the wrapper has none yet.
 */
function findTriggerButton(wrapper) {
    return (
        Array.from(wrapper.children).find((child) => child.matches?.('button[aria-haspopup]')) ??
        null
    );
}

/**
 * Give a menu item the content/leading/label structure the styles expect, keeping any that exists.
 * Idempotent, so re-rendering a menu does not rebuild items that are already well-formed.
 * @param {any} button - The menu item to normalise.
 * @returns {{content: any, leading: any, label: any}} Its three structural parts.
 */
function ensureHeaderActionMenuItemStructure(button) {
    let content = button.querySelector('.header-action-menu-item-content');
    let leading = button.querySelector('.header-action-menu-item-leading');
    let label = button.querySelector('.header-action-menu-item-label');

    if (content && leading && label) {
        return { content, leading, label };
    }

    button.replaceChildren();

    content = document.createElement('span');
    content.className = 'header-action-menu-item-content';

    leading = document.createElement('span');
    leading.className = 'header-action-menu-item-leading';
    leading.setAttribute('aria-hidden', 'true');

    label = document.createElement('span');
    label.className = 'header-action-menu-item-label';

    content.appendChild(leading);
    content.appendChild(label);
    button.appendChild(content);

    return { content, leading, label };
}

/**
 * Build one menu item button.
 * @param {object} [options] - Its id, tooltip and extra class.
 * @returns {any} The item, structured and ready to append.
 */
function createHeaderActionMenuItem(options = {}) {
    const { id = null, tooltipText = null, buttonClass = '' } = options;

    const listItem = document.createElement('li');
    listItem.setAttribute('role', 'none');

    const button = document.createElement('button');
    button.className = [HEADER_ACTION_MENU_ITEM_CLASS, buttonClass].filter(Boolean).join(' ');
    button.type = 'button';

    const { leading, label } = ensureHeaderActionMenuItemStructure(button);

    if (id !== null && id !== undefined) {
        button.dataset.menuItemId = String(id);
    }

    if (tooltipText) {
        button.setAttribute('data-tooltip-text', tooltipText);
    } else {
        button.removeAttribute('data-tooltip-text');
    }

    listItem.appendChild(button);
    return { listItem, button, leading, label };
}

/**
 * Sync a menu item’s disabled state, including the ARIA attribute.
 * @param {any} button - The menu item.
 * @param {boolean} [disabled=false] - Whether it should be non-interactive.
 */
function setMenuItemDisabledState(button, disabled = false) {
    if (disabled) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        return;
    }

    button.disabled = false;
    button.removeAttribute('aria-disabled');
}

/**
 * @param {HTMLButtonElement} button - The button to update.
 * @param {{ariaLabel?: string, tooltipText?: string, buttonClass?: string, buttonAttributes?: object | null}} [options] - Accessible label, tooltip, extra class and raw attributes.
 */
export function setHeaderActionButtonAttributes(
    button,
    { ariaLabel, tooltipText = ariaLabel, buttonClass = '', buttonAttributes = null } = {},
) {
    button.className = [buttonClass, HEADER_ACTION_BUTTON_CLASS].filter(Boolean).join(' ');
    button.type = 'button';

    if (ariaLabel) {
        button.setAttribute('aria-label', ariaLabel);
    } else {
        button.removeAttribute('aria-label');
    }

    if (tooltipText) {
        button.setAttribute('data-tooltip-text', tooltipText);
    } else {
        button.removeAttribute('data-tooltip-text');
    }

    setElementAttributes(button, buttonAttributes);
}

/**
 * Create, or find and update, a plain header action button.
 * @param {any} container - Header-actions element the control is created in or found under.
 * @param {object} [options] - Its selector, classes, attributes and accessible label.
 * @returns {any} The button, newly created or the existing one.
 */
export function ensureHeaderActionButtonControl(container, options = {}) {
    const {
        selector,
        buttonClass = '',
        buttonAttributes = null,
        ariaLabel,
        tooltipText = ariaLabel,
        syncButton = null,
        onClick = null,
    } = options;

    if (!container || !selector) return null;

    let button = container.querySelector(selector);
    if (!button) {
        button = document.createElement('button');
        container.appendChild(button);
    }

    setHeaderActionButtonAttributes(button, {
        ariaLabel,
        tooltipText,
        buttonClass,
        buttonAttributes,
    });

    button.onclick = () => {
        onClick?.(button);
        syncButton?.(button);
    };

    syncButton?.(button);
    return button;
}

/**
 * Create, or find and update, a header action button with a dropdown menu.
 * @param {any} container - Header-actions element the control is created in or found under.
 * @param {object} [options] - Wrapper and button selectors, classes, attributes and accessible label.
 * @returns {any} The control’s wrapper, button and dropdown.
 */
export function ensureHeaderActionDropdownControl(container, options = {}) {
    const {
        wrapperSelector = null,
        wrapperClass = '',
        wrapperAttributes = null,
        buttonClass = '',
        buttonAttributes = null,
        ariaLabel,
        tooltipText = ariaLabel,
        buttonHTML = '',
        dropdownClass = 'header-action-dropdown',
        buildMenu = null,
        context = null,
    } = options;

    if (!container) return null;

    let wrapper = wrapperSelector ? container.querySelector(wrapperSelector) : null;
    if (!wrapper) {
        wrapper = document.createElement('div');
        container.appendChild(wrapper);
    }

    applyClassNames(wrapper, wrapperClass);
    setElementAttributes(wrapper, wrapperAttributes);

    let button = findTriggerButton(wrapper);
    if (!button) {
        button = document.createElement('button');
        wrapper.appendChild(button);
    }

    let dropdown = wrapper.querySelector('.header-action-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('ul');
        wrapper.appendChild(dropdown);
    }

    // Re-stamping the classes below would close an open menu — and a toggle that
    // re-renders its host (the SL averages card) lands back here while the reader's
    // menu is still open. Read the open state first, restore it after.
    const isOpen = dropdown.classList.contains('show');

    setHeaderActionButtonAttributes(button, {
        ariaLabel,
        tooltipText,
        buttonClass,
        buttonAttributes,
    });
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', String(isOpen));
    button.innerHTML = buttonHTML;

    dropdown.className = dropdownClass;
    dropdown.setAttribute('role', 'menu');
    if (isOpen) {
        dropdown.classList.add('show');
        button.classList.add('is-active');
    }

    button.onclick = () => {
        toggleDropdown(button, dropdown, {
            onBeforeOpen: () => buildMenu?.(dropdown, button, context),
        });
    };

    wrapper._cleanupListeners = () => {
        button.onclick = null;
        dropdown.querySelectorAll('.header-action-dropdown-option').forEach((option) => {
            option.onclick = null;
        });
    };

    return { wrapper, button, dropdown };
}

/**
 * Create, or find and update, a header action dropdown whose items are checkboxes.
 * @param {any} container - Header-actions element the control is created in or found under.
 * @param {object} [options] - Wrapper and button selectors, classes, attributes and accessible label.
 * @returns {any} The control’s wrapper, button and dropdown.
 */
export function ensureHeaderActionCheckboxDropdownControl(container, options = {}) {
    const {
        wrapperSelector = null,
        wrapperClass = '',
        wrapperAttributes = null,
        buttonClass = '',
        buttonAttributes = null,
        ariaLabel,
        tooltipText = ariaLabel,
        buttonHTML = '',
        dropdownClass = 'header-action-dropdown',
        getItems = () => [],
        onToggle = null,
        context = null,
    } = options;

    return ensureHeaderActionDropdownControl(container, {
        wrapperSelector,
        wrapperClass,
        wrapperAttributes,
        buttonClass,
        buttonAttributes,
        ariaLabel,
        tooltipText,
        buttonHTML,
        dropdownClass,
        buildMenu: (dropdown, _button, dropdownContext) => {
            const rebuildMenu = (focusItemId = null) => {
                const items = getItems(dropdownContext) || [];
                renderHeaderActionCheckboxMenu(dropdown, items, {
                    focusItemId,
                    onToggle: (item) => {
                        onToggle?.(item, dropdownContext);
                        rebuildMenu(item.id);
                    },
                });
            };

            rebuildMenu();
        },
        context,
    });
}

/**
 * Render a dropdown’s items, replacing whatever it held.
 * @param {any} dropdown - The menu container.
 * @param {Array<object>} [items] - One descriptor per item, in display order.
 * @param {object} [options] - Shared item options, such as an extra button class.
 */
export function renderHeaderActionMenuItems(dropdown, items = [], options = {}) {
    const { onSelect = null } = options;
    const fragment = document.createDocumentFragment();

    for (const item of items) {
        const { listItem, button, leading, label } = createHeaderActionMenuItem(item);
        button.setAttribute('role', 'menuitem');
        leading.textContent = '';
        label.textContent = item.label ?? '';
        setMenuItemDisabledState(button, item.disabled);

        if (!item.disabled && onSelect) {
            button.onclick = () => onSelect(item, button);
        }

        fragment.appendChild(listItem);
    }

    dropdown.replaceChildren(fragment);
}

/**
 * Render a dropdown’s items as checkboxes, replacing whatever it held.
 * @param {any} dropdown - The menu container.
 * @param {Array<object>} [items] - One descriptor per item, in display order, each carrying its checked state.
 * @param {object} [options] - Shared item options, such as an extra button class.
 */
function renderHeaderActionCheckboxMenu(dropdown, items = [], options = {}) {
    const { onToggle = null, focusItemId = null, checkedSymbol = '\u2713' } = options;
    const fragment = document.createDocumentFragment();

    for (const item of items) {
        const { listItem, button, leading, label } = createHeaderActionMenuItem(item);
        const checked = Boolean(item.checked);

        button.classList.add('header-action-checkbox-option');
        button.setAttribute('role', 'menuitemcheckbox');
        button.setAttribute('aria-checked', String(checked));
        leading.textContent = checked ? checkedSymbol : '';
        label.textContent = item.label ?? '';
        setMenuItemDisabledState(button, item.disabled);

        if (!item.disabled && onToggle) {
            button.onclick = () => onToggle(item, button);
        }

        fragment.appendChild(listItem);
    }

    dropdown.replaceChildren(fragment);

    if (focusItemId !== null && focusItemId !== undefined) {
        const nextFocusTarget = Array.from(dropdown.querySelectorAll('[data-menu-item-id]')).find(
            (button) => button.dataset.menuItemId === String(focusItemId),
        );
        nextFocusTarget?.focus();
    }
}

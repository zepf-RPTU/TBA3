import { html, nothing, render } from 'lit';
import { ref } from 'lit/directives/ref.js';

import { FOCUSABLE, queryEl } from '../../utils/domBuilder.js';
import { followAnchor } from '../../utils/followAnchor.js';
import { renderCheckboxIcon, renderIcon } from '../../utils/icons.js';
import './headerActionDropdown.css';

/** Space between the trigger and its menu. */
const MENU_GAP_PX = 4;

/** @type {WeakMap<HTMLElement, () => void>} The open menus' Floating UI `autoUpdate` cleanups. */
const menuPositioning = new WeakMap();

/**
 * One entry of a header action menu. Callers may carry further fields on it; the
 * render functions hand the entry back to their callbacks unchanged.
 * @typedef {object} HeaderActionMenuItem
 * @property {string|number|null} [id] - Stamped as `data-menu-item-id`, which keyboard focus restores by.
 * @property {string} [label]
 * @property {string} [icon] - Material Symbols name shown before the label.
 * @property {string} [description] - A second, smaller line under the label.
 * @property {string} [buttonClass] - Extra classes on the item button.
 * @property {boolean} [disabled]
 * @property {boolean} [checked] - Checkbox and radio menus only: whether the item is ticked or chosen.
 * @property {string|null} [group] - Checkbox menus only: the section the item sits in.
 */

/**
 * What every header action trigger carries. `name` is the `data-header-action-button`
 * hook, a stable handle on the trigger.
 * @typedef {object} HeaderActionTriggerOptions
 * @property {string|null} [name]
 * @property {string} ariaLabel
 * @property {string} [tooltipText] - Defaults to `ariaLabel`.
 * @property {string} [buttonClass] - Extra classes on the trigger button.
 * @property {unknown} [buttonContent] - The button's face, a lit value such as `renderIcon(name)`.
 */

/**
 * A menu trigger and its popup. `role` is the popup's: `menu` for a list of items,
 * `group` for a panel of form controls, whose trigger is a disclosure button
 * (`aria-expanded` without `aria-haspopup`). `placement` is where the menu opens against
 * its trigger: under it, right edges aligned (`bottom-end`, the default), or left
 * edges aligned (`bottom-start`) for a trigger at the left edge of its surface, or
 * beside it, bottom edges aligned (`right-end`) for a trigger in a side rail.
 * `buildMenu` fills the popup on every open, so it always shows the state of that
 * moment. `busy` holds the trigger while its action runs: `aria-disabled` and
 * `aria-busy`, still focusable, its menu kept shut. `family` is the
 * trigger's button family: a square glyph button (`icon`, the default) or a labelled one
 * (`text`).
 * @typedef {HeaderActionTriggerOptions & {
 *   role?: 'menu'|'group',
 *   family?: 'icon'|'text',
 *   placement?: 'bottom-end'|'bottom-start'|'right-end',
 *   dropdownClass?: string,
 *   menuLabel?: string|null,
 *   busy?: boolean,
 *   buildMenu?: ((dropdown: HTMLElement, button: HTMLButtonElement) => void)|null,
 * }} HeaderActionMenuOptions
 */

/**
 * The trigger's class list: the caller's, then the shared button family and the state.
 * @param {string} buttonClass
 * @param {string} [state] - The state class: `is-active` for a toggle that is on, `is-selected` for a ticked checkbox.
 * @param {'icon'|'text'} [family]
 * @returns {string}
 */
function triggerClass(buttonClass, state = '', family = 'icon') {
    return [buttonClass, `btn btn--${family}`, state].filter(Boolean).join(' ');
}

/**
 * The icon in a menu item's leading slot: a checkbox's box, a radio's dot, else the
 * item's own icon.
 * @param {HeaderActionMenuItem} item
 * @param {boolean} checkbox
 * @param {boolean} checkable - Whether the item is a checkbox or a radio.
 * @returns {unknown}
 */
function leadingIcon(item, checkbox, checkable) {
    if (checkbox) return renderCheckboxIcon(Boolean(item.checked));
    if (checkable) {
        return renderIcon(item.checked ? 'radio_button_checked' : 'radio_button_unchecked');
    }
    return item.icon ? renderIcon(item.icon) : nothing;
}

/**
 * One menu item: an `li` holding a button with the content/leading/text structure the
 * styles expect (text = label, then the optional description), its role, label,
 * disabled state and click handler. A checkbox item (`menuitemcheckbox` in a menu,
 * `checkbox` in a panel that is not one) carries its box icon in
 * the leading slot and its `aria-checked` state; a radio item (`menuitemradio`, one
 * choice of several) carries a radio icon and its `aria-checked` state the same way. A
 * plain action in such a panel passes no role, and its row stays a plain button.
 * @template {HeaderActionMenuItem} TItem
 * @param {TItem} item
 * @param {'menuitem'|'menuitemcheckbox'|'menuitemradio'|'checkbox'|null} role
 * @param {((item: TItem, button: HTMLButtonElement) => void)|null} onActivate - Run on click of an enabled item.
 * @returns {import('lit').TemplateResult}
 */
export function headerActionMenuItem(item, role, onActivate) {
    const { id = null, buttonClass = '', disabled = false } = item;
    const checkbox = role === 'menuitemcheckbox' || role === 'checkbox';
    const checkable = checkbox || role === 'menuitemradio';
    const className = ['btn btn--item header-action-dropdown-option', buttonClass]
        .filter(Boolean)
        .join(' ');
    const leading = html`<span class="header-action-menu-item-leading" aria-hidden="true"
        >${leadingIcon(item, checkbox, checkable)}</span
    >`;
    const label = html`<span>${item.label ?? ''}</span>`;
    const description = item.description
        ? html`<span class="header-action-menu-item-description">${item.description}</span>`
        : nothing;
    const text = html`<span class="header-action-menu-item-text">${label}${description}</span>`;
    const content = html`<span class="header-action-menu-item-content">${leading}${text}</span>`;
    const onClick =
        !disabled && onActivate
            ? (/** @type {MouseEvent} */ event) =>
                  onActivate(item, /** @type {HTMLButtonElement} */ (event.currentTarget))
            : nothing;
    return html`<li role="none">
        <button
            type="button"
            class=${className}
            role=${role ?? nothing}
            aria-disabled=${disabled ? 'true' : nothing}
            aria-checked=${checkable ? String(Boolean(item.checked)) : nothing}
            data-menu-item-id=${id === null || id === undefined ? nothing : String(id)}
            ?disabled=${disabled}
            @click=${onClick}
        >
            ${content}
        </button>
    </li>`;
}

/**
 * A plain header action button. A toggle passes `pressed`, which shows as `is-active`
 * and `aria-pressed`; a checkbox passes `checked`, which makes it `role="checkbox"`
 * with `aria-checked` and shows as `is-selected`. The host re-renders it from the state
 * the click wrote. `busy` holds it while its action runs, as a menu trigger's does:
 * `aria-disabled` and `aria-busy`, its click ignored, never native `disabled`, which
 * would drop the focus the button holds to the page. `inactive` is for an
 * action that does not apply to what the card shows now (a plot toggle while the
 * card's data table shows): `aria-disabled`, kept in place and focusable, its click
 * ignored.
 * @param {HeaderActionTriggerOptions & {
 *   name: string,
 *   pressed?: boolean|null,
 *   checked?: boolean|null,
 *   busy?: boolean,
 *   inactive?: boolean,
 *   onClick: (event: MouseEvent) => void,
 * }} options
 * @returns {import('lit').TemplateResult}
 */
export function headerActionButton({
    name,
    ariaLabel,
    tooltipText = ariaLabel,
    buttonClass = '',
    buttonContent = nothing,
    pressed = null,
    checked = null,
    busy = false,
    inactive = false,
    onClick,
}) {
    const state = pressed === true ? 'is-active' : checked === true ? 'is-selected' : '';
    return html`<button
        type="button"
        class=${triggerClass(buttonClass, state)}
        role=${checked === null ? nothing : 'checkbox'}
        aria-checked=${checked === null ? nothing : String(checked)}
        aria-label=${ariaLabel || nothing}
        aria-busy=${busy ? 'true' : nothing}
        data-tooltip-text=${tooltipText || nothing}
        data-header-action-button=${name}
        aria-pressed=${pressed === null ? nothing : String(pressed)}
        aria-disabled=${inactive || busy ? 'true' : nothing}
        @click=${(!inactive && !busy && onClick) || nothing}
    >
        ${buttonContent}
    </button>`;
}

/**
 * Point a menu's trigger (its preceding sibling) at it, so the browser opens it:
 * the trigger toggles it, a click outside or Escape closes it (Escape returning focus
 * to the trigger), opening one closes any other, and it renders in the top layer.
 * @param {Element|undefined} dropdown - The menu, or undefined when it leaves.
 */
function linkTrigger(dropdown) {
    if (!(dropdown instanceof HTMLElement)) return;
    /** @type {HTMLButtonElement} */ (dropdown.previousElementSibling).popoverTargetElement =
        dropdown;
}

/**
 * The menu is about to open or close. The template never binds `aria-expanded`, so a
 * re-render of the host while the menu is open leaves what is set here alone.
 * Synchronous, unlike `toggle`: the menu is filled before it shows, and the trigger's
 * state is right the moment the click returns. While it is open, `followAnchor` keeps
 * it at its trigger.
 * @param {Event} event - The `beforetoggle` event.
 * @param {'bottom-end'|'bottom-start'|'right-end'} placement - Where it opens against the trigger.
 * @param {HeaderActionMenuOptions['buildMenu']} buildMenu
 */
function onMenuBeforeToggle(event, placement, buildMenu) {
    const dropdown = /** @type {HTMLElement} */ (event.currentTarget);
    const button = /** @type {HTMLButtonElement} */ (dropdown.previousElementSibling);
    const open = /** @type {ToggleEvent} */ (event).newState === 'open';
    // A busy trigger stays focusable, so its popover target would still open the menu.
    if (open && button.getAttribute('aria-busy') === 'true') {
        event.preventDefault();
        return;
    }
    button.setAttribute('aria-expanded', String(open));
    // Also on open: a menu taken out of the page while open fired no closing
    // `beforetoggle`, and its follower would otherwise keep placing it beside the new one.
    menuPositioning.get(dropdown)?.();
    menuPositioning.delete(dropdown);
    if (!open) return;
    buildMenu?.(dropdown, button);
    // Placed once the menu is shown; `isActive` ends the following of a menu that left
    // the page.
    menuPositioning.set(
        dropdown,
        followAnchor(button, dropdown, {
            placement,
            gapPx: MENU_GAP_PX,
            capHeight: true,
            isActive: () => dropdown.matches(':popover-open'),
        }),
    );
}

/**
 * The enabled items of a menu, in order.
 * @param {HTMLElement} menu
 * @returns {HTMLButtonElement[]}
 */
const menuItems = (menu) => [
    ...menu.querySelectorAll(/** @type {'button'} */ ('button:not(:disabled)')),
];

/**
 * A menu's keyboard contract (the APG menu pattern; Escape is the popover's own):
 * ↓/↑ step through the enabled items and wrap, Home/End jump to the first and last.
 * @param {KeyboardEvent} event - The keydown event on the menu.
 */
function onMenuKeydown(event) {
    const items = menuItems(/** @type {HTMLElement} */ (event.currentTarget));
    const index = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    const last = items.length - 1;
    /** @type {{[key: string]: number}} */
    const targets = {
        Home: 0,
        End: last,
        ArrowDown: (index + 1) % items.length,
        // From no item (-1) as from the first, up wraps to the last.
        ArrowUp: index <= 0 ? last : index - 1,
    };
    const next = items[targets[event.key]];
    if (!next) return;
    event.preventDefault();
    next.focus();
}

/**
 * A menu that has opened takes focus on its first item, so the arrow keys reach it at
 * once (APG menu button).
 * @param {Event} event - The `toggle` event.
 */
function onMenuToggle(event) {
    if (/** @type {ToggleEvent} */ (event).newState !== 'open') return;
    menuItems(/** @type {HTMLElement} */ (event.currentTarget))[0]?.focus();
}

/**
 * A header action button with a dropdown menu, in its wrapper: the trigger and its
 * `auto` popover as siblings. A `menu` answers the arrow keys and focuses its first
 * item on open; a `group` panel (form controls) keeps the plain tab order.
 * @param {HeaderActionMenuOptions & {wrapperClass?: string, after?: unknown}} options - `after` is what the wrapper holds after the menu.
 * @returns {import('lit').TemplateResult}
 */
export function headerActionDropdown({
    name = null,
    role = 'menu',
    family = 'icon',
    ariaLabel,
    tooltipText = ariaLabel,
    buttonClass = '',
    buttonContent = nothing,
    dropdownClass = '',
    menuLabel = null,
    placement = 'bottom-end',
    busy = false,
    buildMenu = null,
    wrapperClass = '',
    after = nothing,
}) {
    return html`<div
        class=${['header-action-dropdown-wrapper', wrapperClass].filter(Boolean).join(' ')}
    >
        <button
            type="button"
            class=${triggerClass(buttonClass, '', family)}
            aria-haspopup=${role === 'menu' ? 'menu' : nothing}
            aria-expanded="false"
            aria-label=${ariaLabel || nothing}
            aria-busy=${busy ? 'true' : nothing}
            data-tooltip-text=${tooltipText || nothing}
            data-header-action-button=${name ?? nothing}
            aria-disabled=${busy ? 'true' : nothing}
        >
            ${buttonContent}
        </button>
        <ul
            class=${['header-action-dropdown', dropdownClass].filter(Boolean).join(' ')}
            role=${role}
            aria-label=${menuLabel ?? nothing}
            popover="auto"
            ${ref(linkTrigger)}
            @beforetoggle=${(/** @type {Event} */ event) =>
                onMenuBeforeToggle(event, placement, buildMenu)}
            @toggle=${role === 'menu' ? onMenuToggle : nothing}
            @keydown=${role === 'menu' ? onMenuKeydown : nothing}
        ></ul>
        ${after}
    </div>`;
}

/**
 * A header action dropdown whose items are checkboxes. The items are read on every
 * open and after every toggle, so the menu always shows the current state.
 * @template {HeaderActionMenuItem} TItem
 * @param {HeaderActionMenuOptions & {
 *   wrapperClass?: string,
 *   getItems: () => TItem[],
 *   onToggle: (item: TItem) => void,
 *   getActions?: () => HeaderActionMenuItem[],
 *   onAction?: ((item: HeaderActionMenuItem) => void)|null,
 * }} options - Optional plain actions (read on every rebuild) render above the checkboxes, behind a separator.
 * @returns {import('lit').TemplateResult}
 */
export function headerActionCheckboxDropdown({
    getItems,
    onToggle,
    getActions = () => [],
    onAction = null,
    ...frame
}) {
    return headerActionDropdown({
        ...frame,
        buildMenu: (dropdown) => {
            /** @param {string|number|null} [focusItemId] - The item to refocus after the rebuild. */
            const rebuildMenu = (focusItemId = null) => {
                renderHeaderActionCheckboxMenu(dropdown, getItems(), {
                    actions: getActions(),
                    focusItemId,
                    onToggle: (item) => {
                        onToggle(item);
                        rebuildMenu(item.id);
                    },
                    onAction: (item) => {
                        onAction?.(item);
                        rebuildMenu(item.id);
                    },
                });
            };

            rebuildMenu();
        },
    });
}

/**
 * A header action dropdown that picks one of several options (WAI-ARIA menu button with
 * `menuitemradio` items). The chosen option is read on every open; picking one closes
 * the menu and reports it, and the host re-renders the trigger from the state it wrote.
 * Picking the chosen option again only closes the menu.
 * @template {string} TId
 * @param {HeaderActionMenuOptions & {
 *   wrapperClass?: string,
 *   options: Array<{id: TId, label: string}>,
 *   getSelected: () => TId|null,
 *   onSelect: (id: TId) => void,
 * }} options
 * @returns {import('lit').TemplateResult}
 */
export function headerActionRadioDropdown({ options, getSelected, onSelect, ...frame }) {
    return headerActionDropdown({
        ...frame,
        buildMenu: (dropdown) => {
            const selected = getSelected();
            renderHeaderActionMenuItems(
                dropdown,
                options.map((option) => ({ ...option, checked: option.id === selected })),
                (option) => {
                    dropdown.hidePopover();
                    if (option.id !== selected) onSelect(option.id);
                },
                'menuitemradio',
            );
        },
    });
}

/**
 * Render a dropdown’s items, replacing whatever it held. lit-html owns the dropdown's
 * children: a re-render patches them, so a focused row keeps its button.
 * @template {HeaderActionMenuItem} TItem
 * @param {HTMLElement} dropdown
 * @param {TItem[]} items - In display order.
 * @param {((item: TItem, button: HTMLButtonElement) => void)|null} onSelect - The handler an enabled item runs on click.
 * @param {'menuitem'|'menuitemradio'} [role] - The rows' role: actions, or the choices of a radio menu.
 */
export function renderHeaderActionMenuItems(dropdown, items, onSelect, role = 'menuitem') {
    render(
        items.map((item) => headerActionMenuItem(item, role, onSelect)),
        dropdown,
    );
}

/**
 * Fold consecutive items naming the same group into one section: a visible label
 * and a `role="group"` list it names. Ungrouped items stay top-level rows.
 * @template {HeaderActionMenuItem} TItem
 * @param {TItem[]} items - In display order.
 * @param {(item: TItem) => import('lit').TemplateResult} rowTemplate - One item's `li` row.
 * @param {string} idPrefix - Unique per menu, for the labels' ids.
 * @returns {import('lit').TemplateResult[]} The top-level children.
 */
function groupedMenuRows(items, rowTemplate, idPrefix) {
    /** @type {Array<{group: string|null, items: TItem[]}>} */
    const runs = [];
    for (const item of items) {
        const group = item.group || null;
        const last = runs.at(-1);
        if (group && last?.group === group) last.items.push(item);
        else runs.push({ group, items: [item] });
    }
    return runs.map(({ group, items: runItems }, index) => {
        if (!group) return html`${runItems.map(rowTemplate)}`;
        const labelId = `${idPrefix}-section-${index}`;
        return html`<li class="header-action-menu-section" role="none">
            <span class="header-action-menu-section-label" id=${labelId}>${group}</span>
            <ul class="header-action-menu-section-items" role="group" aria-labelledby=${labelId}>
                ${runItems.map(rowTemplate)}
            </ul>
        </li>`;
    });
}

/**
 * The rule between a menu's action rows and its items.
 * @returns {import('lit').TemplateResult}
 */
export function headerActionMenuSeparator() {
    return html`<li class="header-action-menu-separator" role="separator"></li>`;
}

let checkboxMenuCount = 0;

/**
 * Render a dropdown’s items as checkboxes, replacing whatever it held.
 * @template {HeaderActionMenuItem} TItem
 * @param {HTMLElement} dropdown
 * @param {TItem[]} items - In display order, each carrying its checked state.
 * @param {{
 *   actions: HeaderActionMenuItem[],
 *   onToggle: (item: TItem, button: HTMLButtonElement) => void,
 *   onAction: (item: HeaderActionMenuItem, button: HTMLButtonElement) => void,
 *   focusItemId: string|number|null,
 * }} options - Plain actions above the checkboxes, the toggle and action handlers, and the item to refocus after a rebuild.
 */
function renderHeaderActionCheckboxMenu(
    dropdown,
    items,
    { actions, onToggle, onAction, focusItemId },
) {
    dropdown.dataset.menuId ||= `header-action-menu-${++checkboxMenuCount}`;

    const separator = actions.length > 0 ? headerActionMenuSeparator() : nothing;
    const actionRows = actions.map((action) => headerActionMenuItem(action, 'menuitem', onAction));
    const itemRows = groupedMenuRows(
        items,
        (item) => headerActionMenuItem(item, 'menuitemcheckbox', onToggle),
        dropdown.dataset.menuId,
    );
    render(html`${actionRows}${separator}${itemRows}`, dropdown);

    if (focusItemId != null) {
        // An action that disables itself (nothing left to show) hands focus to the
        // first live row rather than dropping it to the page.
        const target = /** @type {HTMLButtonElement|null} */ (
            dropdown.querySelector(`[data-menu-item-id="${CSS.escape(String(focusItemId))}"]`)
        );
        (target && !target.disabled ? target : queryEl(dropdown, FOCUSABLE))?.focus();
    }
}

// @vitest-browser
import { describe, expect, it, vi } from 'vitest';
import { render } from 'lit';
import { createIcon } from '../../../src/utils/icons.js';

import {
    headerActionButton,
    headerActionCheckboxDropdown,
    headerActionDropdown,
    headerActionRadioDropdown,
    renderHeaderActionMenuItems,
} from '../../../index.js';

// Pins the checkbox menu's structure: a box icon in every row (so ticked and
// unticked labels share one edge), grouped items folded into labelled sections,
// and plain actions above the checkboxes that rebuild the menu when run.

/**
 * Render a control into a fresh container on the page.
 * @param {unknown} template
 * @returns {{container: HTMLElement, button: HTMLButtonElement, dropdown: HTMLElement}} The container, and the control's trigger and menu.
 */
function mount(template) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(template, container);
    return {
        container,
        button: /** @type {HTMLButtonElement} */ (container.querySelector('button[aria-expanded]')),
        dropdown: /** @type {HTMLElement} */ (container.querySelector('.header-action-dropdown')),
    };
}

/**
 * Mount a checkbox dropdown and open it.
 * @param {Partial<Parameters<typeof headerActionCheckboxDropdown>[0]>} options
 * @returns {HTMLElement} The open dropdown.
 */
function openMenu(options) {
    const { button, dropdown } = mount(
        headerActionCheckboxDropdown({
            ariaLabel: 'Spalten',
            getItems: () => [],
            onToggle: () => {},
            ...options,
        }),
    );
    button.click();
    return dropdown;
}

/**
 * The first match under `root`; every node the menu renders is an HTML element.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
const find = (root, selector) => /** @type {HTMLElement|null} */ (root.querySelector(selector));

/**
 * Every match under `root`; every node the menu renders is an HTML element.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
const findAll = (root, selector) => /** @type {HTMLElement[]} */ ([
    ...root.querySelectorAll(selector),
]);

/**
 * The first match under `root`, asserted present.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement}
 */
function get(root, selector) {
    const node = find(root, selector);
    if (!node) throw new Error(`Expected ${selector}`);
    return node;
}

/**
 * The label of a menu row.
 * @param {HTMLElement} row
 * @returns {HTMLElement}
 */
const label = (row) => get(row, '.header-action-menu-item-text > span:first-child');

describe('checkbox dropdown', () => {
    it('gives ticked and unticked rows a box icon and the same label edge', () => {
        const dropdown = openMenu({
            getItems: () => [
                { id: 'a', label: 'Ticked', checked: true },
                { id: 'b', label: 'Unticked', checked: false },
            ],
        });
        const [ticked, unticked] = findAll(dropdown, '[role=menuitemcheckbox]');

        expect(find(ticked, '.icon-swap')?.dataset.state).toBe('on');
        expect(find(unticked, '.icon-swap')?.dataset.state).toBe('off');
        expect(label(unticked).getBoundingClientRect().x).toBe(
            label(ticked).getBoundingClientRect().x,
        );
    });

    it('folds consecutive items of one group into a section its label names', () => {
        const dropdown = openMenu({
            getItems: () => [
                { id: 'id', label: 'ID' },
                { id: 'h1', label: 'Verteilung', group: 'Hörverstehen' },
                { id: 'h2', label: 'GER', group: 'Hörverstehen' },
                { id: 'l1', label: 'Verteilung', group: 'Leseverstehen' },
            ],
        });

        const sections = dropdown.querySelectorAll('ul[role=group]');
        expect(sections).toHaveLength(2);
        const names = [...sections].map(
            (section) =>
                document.getElementById(section.getAttribute('aria-labelledby') ?? '')?.textContent,
        );
        expect(names).toEqual(['Hörverstehen', 'Leseverstehen']);
        expect(sections[0].querySelectorAll('[role=menuitemcheckbox]')).toHaveLength(2);
        // The ungrouped row stays a top-level row.
        expect(dropdown.querySelector(':scope > li [data-menu-item-id="id"]')).not.toBeNull();
        expect(dropdown.querySelector('[role=group] [data-menu-item-id="id"]')).toBeNull();
    });

    it('renders actions above a separator and rebuilds after one runs', () => {
        let allShown = false;
        const onAction = vi.fn(() => {
            allShown = true;
        });
        const dropdown = openMenu({
            getItems: () => [{ id: 'a', label: 'A', checked: allShown }],
            getActions: () => [{ id: 'show-all', label: 'Alle', disabled: allShown }],
            onAction,
        });

        const [action, separator] = /** @type {HTMLElement[]} */ ([...dropdown.children]);
        expect(find(action, '[role=menuitem]')?.dataset.menuItemId).toBe('show-all');
        expect(separator.getAttribute('role')).toBe('separator');

        get(action, 'button').click();

        expect(onAction).toHaveBeenCalledOnce();
        expect(
            /** @type {HTMLButtonElement} */ (get(dropdown, '[data-menu-item-id="show-all"]'))
                .disabled,
        ).toBe(true);
        expect(get(dropdown, '[data-menu-item-id="a"]').getAttribute('aria-checked')).toBe('true');
        // The disabled action cannot hold focus; the first live row takes it.
        expect(/** @type {HTMLElement|null} */ (document.activeElement)?.dataset.menuItemId).toBe(
            'a',
        );
    });

    it('puts an item icon in the leading slot and a description under the label', () => {
        const { button, dropdown } = mount(
            headerActionDropdown({
                ariaLabel: 'Export',
                buildMenu: (menu) =>
                    renderHeaderActionMenuItems(
                        menu,
                        [
                            {
                                id: 'csv',
                                label: 'CSV',
                                icon: 'table',
                                description: 'Tabellendaten',
                            },
                            { id: 'pdf', label: 'PDF' },
                        ],
                        null,
                    ),
            }),
        );
        button.click();
        const [csv, pdf] = findAll(dropdown, '[role=menuitem]');

        expect(find(csv, '.header-action-menu-item-leading svg path')?.getAttribute('d')).toBe(
            createIcon('table').querySelector('path')?.getAttribute('d'),
        );
        expect(csv.querySelector('.header-action-menu-item-description')?.textContent).toBe(
            'Tabellendaten',
        );
        expect(pdf.querySelector('.header-action-menu-item-description')).toBeNull();
    });

    it('renders no separator for a menu without actions', () => {
        const dropdown = openMenu({ getItems: () => [{ id: 'a', label: 'A' }] });

        expect(dropdown.querySelector('[role=separator]')).toBeNull();
    });
});

describe('radio dropdown', () => {
    /**
     * Mount a radio dropdown over three options and open it.
     * @param {(id: string) => void} onSelect
     * @returns {HTMLElement} The open dropdown.
     */
    function openRadioMenu(onSelect) {
        const { button, dropdown } = mount(
            headerActionRadioDropdown({
                ariaLabel: 'Gruppieren',
                options: [
                    { id: 'a', label: 'Leitidee' },
                    { id: 'b', label: 'Allgemeine Kompetenz' },
                    { id: 'c', label: 'Anforderungsbereich' },
                ],
                getSelected: () => 'a',
                onSelect,
            }),
        );
        button.click();
        return dropdown;
    }

    it('marks exactly the chosen option checked, as a menuitemradio row', () => {
        const rows = findAll(
            openRadioMenu(() => {}),
            '[role="menuitemradio"]',
        );

        expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual([
            'true',
            'false',
            'false',
        ]);
        // Every row leads with its radio icon, so the labels share one edge.
        expect(rows.every((row) => find(row, '.header-action-menu-item-leading .icon'))).toBe(true);
    });

    it('reports another option and closes; the chosen one only closes', () => {
        const onSelect = vi.fn();
        const dropdown = openRadioMenu(onSelect);

        find(dropdown, '[data-menu-item-id="a"]')?.click();
        expect(onSelect).not.toHaveBeenCalled();
        expect(dropdown.matches(':popover-open')).toBe(false);

        const reopened = openRadioMenu(onSelect);
        find(reopened, '[data-menu-item-id="c"]')?.click();
        expect(onSelect).toHaveBeenCalledWith('c');
        expect(reopened.matches(':popover-open')).toBe(false);
    });
});

describe('dropdown re-render', () => {
    it('leaves an open menu open, its trigger expanded, when the host renders again', () => {
        // A toggle in the menu writes state its host renders the toolbar from (the
        // SL averages card), so the template renders again while the reader's menu is
        // still open. Closing it, or re-stamping the trigger as closed, would happen on
        // every click and make toggling two entries in a row impossible.
        const control = () =>
            headerActionCheckboxDropdown({
                ariaLabel: 'Vergleiche',
                getItems: () => [{ id: 'a', label: 'A' }],
                onToggle: () => {},
            });
        const { container, button, dropdown } = mount(control());
        button.click();
        expect(dropdown.matches(':popover-open')).toBe(true);

        render(control(), container);

        expect(dropdown.matches(':popover-open')).toBe(true);
        expect(button.getAttribute('aria-expanded')).toBe('true');
    });
});

describe('headerActionDropdown trigger semantics', () => {
    // A menu trigger announces its menu; a panel of form controls is a disclosure,
    // which `aria-haspopup` would misannounce as a menu.
    it('names a menu popup and leaves a group panel a disclosure button', () => {
        const menu = mount(headerActionDropdown({ ariaLabel: 'Export' }));
        expect(menu.button.getAttribute('aria-haspopup')).toBe('menu');

        const { button } = mount(headerActionDropdown({ ariaLabel: 'Filter', role: 'group' }));
        expect(button.hasAttribute('aria-haspopup')).toBe(false);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        button.click();
        expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    // A labelled trigger must not carry the icon square it would have to undo.
    it('draws an icon trigger by default and a labelled one on request', () => {
        const icon = mount(headerActionDropdown({ ariaLabel: 'Export' })).button.classList;
        expect([icon.contains('btn--icon'), icon.contains('btn--text')]).toEqual([true, false]);

        const text = mount(headerActionDropdown({ ariaLabel: 'Link', family: 'text' })).button
            .classList;
        expect([text.contains('btn--icon'), text.contains('btn--text')]).toEqual([false, true]);
    });
});

describe('menu keyboard', () => {
    // A `menu` role promises the APG menu keys; Tab alone would leave screen-reader
    // menu mode with no way to move.
    it('focuses the first item on open, steps and wraps with the arrows, jumps with Home/End, skips disabled items', async () => {
        const dropdown = openMenu({
            getItems: () => [
                { id: 'a', label: 'A', checked: true },
                { id: 'b', label: 'B', checked: false },
                { id: 'c', label: 'C', checked: false, disabled: true },
                { id: 'd', label: 'D', checked: false },
            ],
        });
        await new Promise((resolve) =>
            dropdown.addEventListener('toggle', resolve, { once: true }),
        );
        const focusedId = () => document.activeElement?.getAttribute('data-menu-item-id');
        const press = (/** @type {string} */ key) =>
            dropdown.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

        expect(focusedId()).toBe('a');
        press('ArrowDown');
        expect(focusedId()).toBe('b');
        press('ArrowDown');
        expect(focusedId()).toBe('d');
        press('ArrowDown');
        expect(focusedId()).toBe('a');
        press('ArrowUp');
        expect(focusedId()).toBe('d');
        press('Home');
        expect(focusedId()).toBe('a');
        press('End');
        expect(focusedId()).toBe('d');
    });
});

describe('headerActionButton as a checkbox', () => {
    // The export cart's tick is a header button like every other; it must read
    // as a checkbox and refuse clicks while its capture runs.
    it('is a checkbox whose state, busy hold and export target follow the options', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        /** @param {{checked: boolean, busy: boolean}} state - What the host holds. */
        const draw = ({ checked, busy }) =>
            render(
                headerActionButton({
                    name: 'batch-select',
                    ariaLabel: 'Merken',
                    onClick: () => {},
                    checked,
                    busy,
                }),
                container,
            );

        draw({ checked: false, busy: true });
        const button = /** @type {HTMLButtonElement} */ (container.querySelector('button'));
        expect(button.getAttribute('role')).toBe('checkbox');
        expect(button.getAttribute('aria-checked')).toBe('false');
        expect(button.getAttribute('aria-busy')).toBe('true');
        // Held, not disabled: a disabled button would drop its focus to the page.
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.disabled).toBe(false);

        draw({ checked: true, busy: false });
        expect(button.getAttribute('aria-checked')).toBe('true');
        expect(button.classList.contains('is-selected')).toBe(true);
        expect(button.hasAttribute('aria-busy')).toBe(false);
        expect(button.hasAttribute('aria-disabled')).toBe(false);
    });
});

describe('headerActionButton inactive', () => {
    // A plot toggle while the card shows its data table: in place, focusable, but
    // announced as unavailable and deaf to clicks.
    it('stays focusable and in place, aria-disabled, its click ignored', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const onClick = vi.fn();
        /** @param {boolean} inactive - Whether the action applies now. */
        const draw = (inactive) =>
            render(
                headerActionButton({ name: 'zoom', ariaLabel: 'Zoom', inactive, onClick }),
                container,
            );

        draw(true);
        const button = /** @type {HTMLButtonElement} */ (container.querySelector('button'));
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.disabled).toBe(false);
        button.click();
        expect(onClick).not.toHaveBeenCalled();

        draw(false);
        expect(button.hasAttribute('aria-disabled')).toBe(false);
        button.click();
        expect(onClick).toHaveBeenCalledOnce();
    });
});

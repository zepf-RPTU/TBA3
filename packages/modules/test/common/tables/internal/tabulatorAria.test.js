// @vitest-browser
/**
 * The ARIA repairs applied to Tabulator's own grid markup.
 *
 * Each one is pinned against the tree tabulator-tables 6.5.2 emits, which the fixtures
 * below reproduce, so an upgrade that reshapes that tree is noticed; the e2e axe sweep
 * guards the same against the real table.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { required } from '../../../support/required.js';

import {
    applyBodyAria,
    applyColumnGroupAria,
    applyGroupRowAria,
    applyHeaderTabStops,
    installHeaderKeyboard,
} from '../../../../src/common/tables/internal/tabulatorAria.js';

/** @returns {HTMLElement} A `.tabulator` root shaped the way Tabulator builds one. */
function buildTable() {
    const root = document.createElement('div');
    root.className = 'tabulator';
    root.setAttribute('role', 'grid');
    root.innerHTML = `
        <div class="tabulator-header" role="rowgroup">
            <div class="tabulator-header-contents">
                <div class="tabulator-headers" role="row">
                    <div class="tabulator-col" role="columnheader" aria-sort="none"></div>
                    <div class="tabulator-col tabulator-sortable" role="columnheader" aria-sort="none">
                        <div class="tabulator-col-content"><span class="glossary-term">Name</span></div>
                    </div>
                    <div class="tabulator-col tabulator-col-group" role="columngroup" aria-title="Merkmale" aria-sort="none">
                        <div class="tabulator-col-content"><span class="glossary-term">Merkmale</span></div>
                        <div class="tabulator-col-group-cols">
                            <div class="tabulator-col" role="columnheader">
                                <div class="tabulator-col-content"><div class="tabulator-col-title">TD</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="tabulator-tableholder" tabindex="0">
            <div class="tabulator-table" role="rowgroup">
                <div class="tabulator-row" role="row"><div class="tabulator-cell" role="gridcell"></div></div>
            </div>
        </div>
    `;
    return root;
}

/** @type {HTMLElement} */
let root;

beforeEach(() => {
    root = buildTable();
});

describe('applyBodyAria', () => {
    it('moves the body tab stop off the role-less holder', () => {
        const holder = required(root.querySelector('.tabulator-tableholder'));
        const body = required(root.querySelector('.tabulator-table'));

        applyBodyAria(root);

        // A focusable role-less div is an unallowed child of role="grid"; one level in,
        // the same tab stop sits on an element the grid is allowed to own.
        expect(holder.hasAttribute('tabindex')).toBe(false);
        expect(body.getAttribute('tabindex')).toBe('0');
        expect(body.getAttribute('role')).toBe('rowgroup');
    });
});

describe('applyColumnGroupAria', () => {
    it('empties the invalid columngroup wrapper out of the header', () => {
        applyColumnGroupAria(root);

        const group = required(root.querySelector('.tabulator-col-group'));
        expect(group.getAttribute('role')).toBe('presentation');
        // A presentational element carries no ARIA attribute, and Tabulator stamps
        // the wrapper with an aria-sort it has nothing to sort.
        expect(group.hasAttribute('aria-title')).toBe(false);
        expect(group.hasAttribute('aria-sort')).toBe(false);
        // The sub-column keeps its own role; it is what the header row should own. The
        // group's title is no header of its own: a screen reader pairs cells with headers
        // by position, so one header more than cells reads every later cell wrongly.
        const title = required(group.querySelector(':scope > .tabulator-col-content'));
        expect(title.getAttribute('aria-hidden')).toBe('true');
        expect(title.hasAttribute('role')).toBe(false);
        expect(root.querySelectorAll('[role="columnheader"]')).toHaveLength(3);
        // Each of its columns says the group instead, once however often it runs.
        applyColumnGroupAria(root);
        const leaf = required(
            group.querySelector('.tabulator-col-group-cols .tabulator-col-content'),
        );
        expect(leaf.textContent).toBe('Merkmale – TD');
        expect(leaf.querySelectorAll('.column-group-prefix.visually-hidden')).toHaveLength(1);
    });
});

describe('applyHeaderTabStops / installHeaderKeyboard', () => {
    /** @returns {{sortable: HTMLElement, plain: HTMLElement, onClick: import('vitest').Mock}} */
    function setUp() {
        const sortable = /** @type {HTMLElement} */ (root.querySelector('.tabulator-sortable'));
        const plain = /** @type {HTMLElement} */ (
            root.querySelector('.tabulator-col:not(.tabulator-sortable)')
        );
        const onClick = vi.fn();
        sortable.addEventListener('click', onClick);
        return { sortable, plain, onClick };
    }

    /**
     * Dispatch a keydown from `target`, bubbling as a real one does.
     * @param {Element} target
     * @param {string} key
     * @returns {KeyboardEvent}
     */
    function press(target, key) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event;
    }

    it('makes only the sortable headers tab stops', () => {
        const { sortable, plain } = setUp();
        applyHeaderTabStops(root);

        expect(sortable.getAttribute('tabindex')).toBe('0');
        expect(plain.hasAttribute('tabindex')).toBe(false);
    });

    it('drops the aria-sort Tabulator stamps on a header that cannot sort', () => {
        const { sortable, plain } = setUp();
        applyHeaderTabStops(root);

        expect(sortable.getAttribute('aria-sort')).toBe('none');
        expect(plain.hasAttribute('aria-sort')).toBe(false);
    });

    it('marks a sortable header whose title holds a term, and only while it does', () => {
        // The term is no second tab stop inside the header; the marker is what lets
        // the header's own keyboard focus open the term's popup.
        const { sortable } = setUp();
        const term = /** @type {HTMLElement} */ (sortable.querySelector('.glossary-term'));
        term.setAttribute('data-glossary-key', 'name');
        applyHeaderTabStops(root);
        expect(sortable.hasAttribute('data-glossary-focus')).toBe(true);

        term.removeAttribute('data-glossary-key');
        applyHeaderTabStops(root);
        expect(sortable.hasAttribute('data-glossary-focus')).toBe(false);
    });

    it('makes a term in a header that is no tab stop one itself', () => {
        // The title formatters stamp every header term unfocusable; under a header
        // that is no control the term would be out of the keyboard's reach.
        const { plain } = setUp();
        plain.innerHTML =
            '<div class="tabulator-col-content"><span data-glossary-key="name">Name</span></div>';
        applyHeaderTabStops(root);

        expect(plain.querySelector('[data-glossary-key]')?.getAttribute('tabindex')).toBe('0');
        expect(plain.hasAttribute('tabindex')).toBe(false);
    });

    it('sorts on Enter and Space through the header click, and keeps Space from scrolling', () => {
        const { sortable, onClick } = setUp();
        installHeaderKeyboard(root);

        press(sortable, 'Enter');
        const space = press(sortable, ' ');

        expect(onClick).toHaveBeenCalledTimes(2);
        expect(space.defaultPrevented).toBe(true);
    });

    it('ignores other keys and keys from inside the header', () => {
        const { sortable, onClick } = setUp();
        installHeaderKeyboard(root);

        press(sortable, 'a');
        const inner = press(
            /** @type {HTMLElement} */ (sortable.querySelector('.glossary-term')),
            'Enter',
        );

        expect(onClick).not.toHaveBeenCalled();
        expect(inner.defaultPrevented).toBe(false);
    });
});

describe('applyGroupRowAria', () => {
    it('re-roles group headers, nested ones included', () => {
        const outer = document.createElement('div');
        outer.setAttribute('role', 'rowgroup');
        const inner = document.createElement('div');
        inner.setAttribute('role', 'rowgroup');

        // The re-roling reads only a group's element and its subgroups.
        const groups = /** @type {import('tabulator-tables').GroupComponent[]} */ (
            /** @type {unknown} */ ([
                {
                    getElement: () => outer,
                    getSubGroups: () => [{ getElement: () => inner, getSubGroups: () => [] }],
                },
            ])
        );
        applyGroupRowAria(groups);

        expect(outer.getAttribute('role')).toBe('row');
        expect(inner.getAttribute('role')).toBe('row');
    });
});

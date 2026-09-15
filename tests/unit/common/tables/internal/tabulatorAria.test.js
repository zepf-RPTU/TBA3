// @vitest-browser
/**
 * The ARIA repairs applied to Tabulator's own grid markup.
 *
 * Each one is pinned against the tree tabulator-tables 6.3.1 emits, because the whole
 * point is that an upgrade which reshapes that tree has to be noticed: the fixtures below
 * are that tree, and the e2e axe sweep is the second half of the same guard.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
    applyBodyAria,
    applyHeaderAria,
    applyColumnGroupAria,
    applyGroupRowAria,
} from '@tba3/modules/common/tables/internal/tabulatorAria.js';

/** @returns {HTMLElement} A `.tabulator` root shaped the way Tabulator builds one. */
function buildTable() {
    const root = document.createElement('div');
    root.className = 'tabulator';
    root.setAttribute('role', 'grid');
    root.innerHTML = `
        <div class="tabulator-header" role="rowgroup">
            <div class="tabulator-header-contents" role="rowgroup">
                <div class="tabulator-headers" role="row">
                    <div class="tabulator-col" role="columnheader" aria-sort="none"></div>
                    <div class="tabulator-col tabulator-col-group" role="columngroup" aria-title="Merkmale" aria-sort="none">
                        <div class="tabulator-col-group-cols">
                            <div class="tabulator-col" role="columnheader"></div>
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

describe('applyHeaderAria', () => {
    it('drops the inner header rowgroup so the header row is reachable', () => {
        applyHeaderAria(root);

        // A rowgroup owns rows and nothing else, so a rowgroup inside a rowgroup is
        // both an unallowed child and a rowgroup without its grid.
        expect(root.querySelector('.tabulator-header-contents').hasAttribute('role')).toBe(false);
        expect(root.querySelector('.tabulator-header').getAttribute('role')).toBe('rowgroup');
        expect(root.querySelector('.tabulator-headers').getAttribute('role')).toBe('row');
    });
});

describe('applyBodyAria', () => {
    it('moves the body tab stop off the role-less holder', () => {
        const holder = root.querySelector('.tabulator-tableholder');
        const body = root.querySelector('.tabulator-table');

        applyBodyAria(root);

        // A focusable role-less div is an unallowed child of role="grid"; one level in,
        // the same tab stop sits on an element the grid is allowed to own.
        expect(holder.hasAttribute('tabindex')).toBe(false);
        expect(body.getAttribute('tabindex')).toBe('0');
        expect(body.getAttribute('role')).toBe('rowgroup');
    });

    it('does nothing to a table that has not rendered its body yet', () => {
        const bare = document.createElement('div');
        expect(() => applyBodyAria(bare)).not.toThrow();
    });
});

describe('applyColumnGroupAria', () => {
    it('empties the invalid columngroup wrapper out of the header', () => {
        applyColumnGroupAria(root);

        const group = root.querySelector('.tabulator-col-group');
        expect(group.getAttribute('role')).toBe('presentation');
        // A presentational element carries no ARIA attribute — and the wrapper is
        // stamped with an aria-sort it has nothing to sort.
        expect(group.hasAttribute('aria-title')).toBe(false);
        expect(group.hasAttribute('aria-sort')).toBe(false);
        // The sub-column keeps its own role; it is what the header row should own.
        expect(root.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    });
});

describe('applyGroupRowAria', () => {
    it('re-roles group headers, nested ones included', () => {
        const outer = document.createElement('div');
        outer.setAttribute('role', 'rowgroup');
        const inner = document.createElement('div');
        inner.setAttribute('role', 'rowgroup');

        applyGroupRowAria([
            {
                getElement: () => outer,
                getSubGroups: () => [{ getElement: () => inner, getSubGroups: () => [] }],
            },
        ]);

        expect(outer.getAttribute('role')).toBe('row');
        expect(inner.getAttribute('role')).toBe('row');
    });
});

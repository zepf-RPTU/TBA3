// @vitest-browser
/**
 * The Material glyphs that replace Tabulator's border-drawn sort and toggle arrows.
 *
 * Pinned against the boxes tabulator-tables 6.3.1 emits (`.tabulator-col-sorter`,
 * `.tabulator-group .tabulator-arrow`, `.tabulator-data-tree-control`): an upgrade that
 * renames one has to be noticed here, not as a table that silently lost its arrows.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
    applySortIcons,
    applyToggleIcons,
    applyTableIcons,
} from '@tba3/modules/common/tables/internal/tabulatorIcons.js';

/** @returns {HTMLElement} A `.tabulator` root with one sortable column, a group row and a tree row. */
function buildTable() {
    const root = document.createElement('div');
    root.className = 'tabulator';
    root.innerHTML = `
        <div class="tabulator-header">
            <div class="tabulator-col tabulator-sortable" aria-sort="none">
                <div class="tabulator-col-content">
                    <div class="tabulator-col-title">Name</div>
                    <div class="tabulator-col-sorter"><div class="tabulator-arrow"></div></div>
                </div>
            </div>
        </div>
        <div class="tabulator-table">
            <div class="tabulator-row tabulator-group">
                <div class="tabulator-group-toggle"><div class="tabulator-arrow"></div></div>
                <span>Deutsch</span>
            </div>
            <div class="tabulator-row">
                <div class="tabulator-cell">
                    <div class="tabulator-data-tree-control">
                        <div class="tabulator-data-tree-control-expand"></div>
                    </div>
                </div>
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

describe('applySortIcons', () => {
    it('puts all three sort glyphs into the sorter so CSS can pick one per aria-sort', () => {
        applySortIcons(root);

        const glyphs = [...root.querySelectorAll('.tabulator-col-sorter svg')].map(
            (svg) => svg.dataset.icon,
        );
        expect(glyphs).toEqual(['swap_vert', 'arrow_upward', 'arrow_downward']);
        // Tabulator's own arrow box stays: it is the element its click handler is bound to.
        expect(root.querySelector('.tabulator-col-sorter .tabulator-arrow')).not.toBeNull();
    });

    it('is idempotent, since the header is re-scanned on every column load', () => {
        applySortIcons(root);
        applySortIcons(root);

        expect(root.querySelectorAll('.tabulator-col-sorter svg')).toHaveLength(3);
    });
});

describe('applyToggleIcons', () => {
    it('gives the group arrow and the tree control one chevron each', () => {
        applyToggleIcons(root);

        expect(root.querySelector('.tabulator-group .tabulator-arrow svg').dataset.icon).toBe(
            'chevron_right',
        );
        expect(root.querySelector('.tabulator-data-tree-control svg').dataset.icon).toBe(
            'chevron_right',
        );
    });

    it('skips a control that already has its chevron', () => {
        applyToggleIcons(root);
        applyToggleIcons(root);

        expect(root.querySelectorAll('.tabulator-data-tree-control svg')).toHaveLength(1);
    });
});

describe('applyTableIcons', () => {
    it('runs both passes', () => {
        applyTableIcons(root);

        expect(root.querySelectorAll('svg.tabulator-glyph')).toHaveLength(5);
    });
});

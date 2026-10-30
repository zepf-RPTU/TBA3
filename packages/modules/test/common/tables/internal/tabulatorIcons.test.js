// @vitest-browser
/**
 * The Material glyphs that replace Tabulator's border-drawn sort and toggle arrows.
 *
 * The sort glyphs are a Tabulator option (`headerSortElement`); the group arrow is
 * decorated in place, pinned against the box tabulator-tables 6.5.2 emits for a group
 * (`.tabulator-group .tabulator-arrow`), so an upgrade that renames it fails here.
 */

import { describe, it, expect } from 'vitest';
import { createIcon } from '@tba3/module-base';

import { applyGroupIcons } from '../../../../src/common/tables/internal/tabulatorIcons.js';

describe('applyGroupIcons', () => {
    /** @returns {HTMLElement} A `.tabulator` root with one rendered group row. */
    function buildTable() {
        const root = document.createElement('div');
        root.className = 'tabulator';
        root.innerHTML = `
            <div class="tabulator-table">
                <div class="tabulator-row tabulator-group">
                    <div class="tabulator-group-toggle"><div class="tabulator-arrow"></div></div>
                    <span>Deutsch</span>
                </div>
            </div>
        `;
        return root;
    }

    it('gives the group arrow one chevron, once across renders', () => {
        const root = buildTable();
        applyGroupIcons(root);
        applyGroupIcons(root);

        const glyphs = root.querySelectorAll(
            /** @type {'svg'} */ ('.tabulator-group .tabulator-arrow svg'),
        );
        expect(glyphs).toHaveLength(1);
        expect(glyphs[0]?.querySelector('path')?.getAttribute('d')).toBe(
            createIcon('chevron_right').querySelector('path')?.getAttribute('d'),
        );
    });
});

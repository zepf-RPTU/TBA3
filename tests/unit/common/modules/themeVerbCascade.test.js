// @vitest-browser

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseModule } from '@tba3/module-base/modules/baseModule.js';
import { ChartHostModule } from '@tba3/modules/common/charts/host/chartHostModule.js';
import { TableModule } from '@tba3/modules/common/tables/tableModule.js';

/**
 * The KS theme switch is a plain verb, not an event: viewLifecycle calls the
 * active view's onThemeChanged(), and BaseModule's default forwards it
 * recursively to registered children. These tests pin the two halves that a
 * broken refactor would silently drop:
 * - the default reaches *grandchildren* (composites like EnStudentTablesModule
 *   and SlBaseTableModule hold table/chart children of their own), and
 * - the leaf overrides (ChartHostModule, TableModule) still call
 *   super.onThemeChanged() after their own refresh, so their children catch up.
 * A leaf stranded outside the cascade keeps painting the old palette with no
 * error anywhere — exactly the failure mode that stays invisible in e2e.
 */

class CountingLeaf extends BaseModule {
    themeCalls = 0;
    onThemeChanged() {
        this.themeCalls += 1;
        super.onThemeChanged();
    }
}

function div() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

describe('onThemeChanged cascade', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('the BaseModule default forwards recursively, reaching grandchildren', () => {
        const root = new BaseModule('root', div());
        const middle = new BaseModule('middle', div());
        const leaf = new CountingLeaf('leaf', div());
        root.registerChildModule(middle);
        middle.registerChildModule(leaf);

        root.onThemeChanged();

        expect(leaf.themeCalls).toBe(1);
    });

    it('ChartHostModule refreshes itself and still forwards to its children', () => {
        const host = new ChartHostModule('theme-host', div(), { createRenderer: () => null }, {});
        const leaf = new CountingLeaf('host-leaf', div());
        host.registerChildModule(leaf);

        // Not initialized: the rerender guard skips the rebuild, but the
        // cascade to children must run regardless.
        host.onThemeChanged();

        expect(leaf.themeCalls).toBe(1);
    });

    it('TableModule redraws itself and still forwards to its children', () => {
        const table = new TableModule('theme-table', div(), {});
        const leaf = new CountingLeaf('table-leaf', div());
        table.registerChildModule(leaf);

        table.onThemeChanged();

        expect(leaf.themeCalls).toBe(1);
    });
});

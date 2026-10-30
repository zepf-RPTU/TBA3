// @vitest-browser
import { signal } from '@preact/signals-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TableModule } from '../../../src/common/tables/tableModule.js';
import { TableModeController } from '../../../src/common/tables/tableModeController.js';
import { FakeTabulator, resetFakeTabulator, settleBuiltTable } from '../../support/tableHarness.js';
import { createTestModuleOptions } from '../../support/glossaryFixture.js';

vi.mock('../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

// The app's mode signal changes as soon as the header switch does, which can be
// while the table still builds (loading datasets, waiting for a width). A change
// dropped then leaves the table filtered to the previous mode.

/** @augments {TableModule<import('../../../src/common/tables/tableModule.js').TableOptions & {mode: string | import('@preact/signals-core').Signal<string>}>} */
class ModeTable extends TableModule {
    /** @type {string[]} */
    #applied = [];

    /** @type {string[]} */
    #previous = [];

    /** @type {TableModeController<string>} */
    #mode;

    /** @override */
    _setup() {
        super._setup();
        this.#mode = new TableModeController(this, {
            mode: this.options.mode,
            key: 'mode',
            apply: (mode, previous) => {
                this.#applied.push(mode);
                this.#previous.push(previous);
            },
        });
    }

    /** @returns {string[]} The modes applied, in order. */
    get applied() {
        return this.#applied;
    }

    /** @returns {string[]} The mode each change came from, in order. */
    get previous() {
        return this.#previous;
    }

    /** @returns {TableModeController<string>} The controller under test. */
    get mode() {
        return this.#mode;
    }

    /** @override */
    async _renderBody() {
        this.createTable({
            container: this.contentContainer,
            columns: [{ title: 'Name', field: 'name' }],
            data: [{ name: 'A' }],
        });
    }
}

customElements.define('test-mode-table', ModeTable);

/** @type {HTMLDivElement} */
let host;

beforeEach(() => {
    resetFakeTabulator();
    host = document.createElement('div');
    document.body.appendChild(host);
});

describe('TableModeController', () => {
    it('applies a mode the signal moves to while the table still builds', async () => {
        host.style.width = '0px';
        const mode = signal('a');
        const module = ModeTable.create('mode-table', {
            ...createTestModuleOptions('en'),
            mode,
        });
        host.append(module);

        expect(FakeTabulator.instances).toHaveLength(0);
        mode.value = 'b';

        host.style.width = '400px';
        await settleBuiltTable(module);
        expect(module.applied).toEqual(['b']);
        expect(module.mode.value).toBe('b');
        module.remove();
    });

    it('hands each change the mode the table was last brought to, not one it skipped', async () => {
        const mode = signal('a');
        const module = ModeTable.create('mode-table', {
            ...createTestModuleOptions('en'),
            mode,
        });
        host.style.width = '400px';
        host.append(module);
        await settleBuiltTable(module);

        // Two changes behind one deferral: the table never was in 'b'.
        module.hide();
        mode.value = 'b';
        mode.value = 'c';
        module.show();
        await vi.waitFor(() => expect(module.applied).toEqual(['c']));
        expect(module.previous).toEqual(['a']);

        mode.value = 'd';
        await vi.waitFor(() => expect(module.applied).toEqual(['c', 'd']));
        expect(module.previous).toEqual(['a', 'c']);
        module.remove();
    });

    it('stops following once removed', async () => {
        const mode = signal('a');
        const module = ModeTable.create('mode-table', {
            ...createTestModuleOptions('en'),
            mode,
        });
        host.append(module);
        module.remove();
        await Promise.resolve();

        mode.value = 'b';

        expect(module.applied).toEqual([]);
    });

    it('takes a plain mode for a table built standalone', () => {
        const module = ModeTable.create('plain-table', {
            ...createTestModuleOptions('en'),
            mode: 'c',
        });
        host.append(module);

        expect(module.mode.value).toBe('c');
    });
});

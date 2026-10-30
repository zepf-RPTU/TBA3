// @vitest-browser
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlBaseTableModule } from '../../../../src/sl/modules/tables/slBaseTableModule.js';
import {
    FakeTabulator,
    resetFakeTabulator,
    settleBuiltTable,
    stubCanvasTextMeasurement,
} from '../../../support/tableHarness.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

vi.mock('../../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

// Every SL table module owns exactly one table, so the shared toolbar binds to
// the table it describes.

class TestSlTableModule extends SlBaseTableModule {
    /** @override */
    async _renderBody() {
        this.createTable({
            container: this.contentContainer,
            columns: [
                { title: 'Fach', field: 'subjectName' },
                { title: 'Domäne', field: 'domain' },
            ],
            data: [{ subjectName: 'Deutsch', domain: 'Lesen' }],
        });
    }
}

customElements.define('test-sl-table', TestSlTableModule);

stubCanvasTextMeasurement();

/** @type {HTMLDivElement} */
let root;
/** @type {SlBaseTableModule[]} */
let modules;

/**
 * Initialise a table module and let its table settle.
 * @template {SlBaseTableModule} M
 * @param {M} module
 * @returns {Promise<M>} The module, drawn.
 */
async function build(module) {
    modules.push(module);
    const built = FakeTabulator.instances.length;
    root.append(module);
    await settleBuiltTable(module, built);
    return module;
}

/**
 * @param {SlBaseTableModule} module - A drawn table module.
 * @returns {Element|null|undefined} Its column-visibility button.
 */
const columnMenuOf = (module) =>
    module.querySelector(
        '.content-module-header-actions [data-header-action-button="table-columns"]',
    );

beforeEach(() => {
    resetFakeTabulator();
    modules = [];
    root = document.createElement('div');
    document.body.appendChild(root);
});

afterEach(() => {
    modules.forEach((module) => module.remove());
    root.remove();
});

describe('SL table toolbar', () => {
    it('offers the column-visibility menu over its one table', async () => {
        const module = await build(
            TestSlTableModule.create('sl-toolbar-table', {
                showModuleTitle: true,
                title: 'Test',
                context: await createSubjectContext('sl'),
            }),
        );

        expect(columnMenuOf(module)).not.toBeNull();
    });
});

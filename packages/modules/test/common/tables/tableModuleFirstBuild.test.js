// @vitest-browser
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TableModule } from '../../../src/common/tables/tableModule.js';
import { FakeTabulator, resetFakeTabulator } from '../../support/tableHarness.js';
import { createTestModuleOptions } from '../../support/glossaryFixture.js';

vi.mock('../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

// A table built into a laid-out box with no width yet (a split layout still
// settling) hides every column and snaps to its real widths only on a later resize,
// after the view is revealed. So the first build waits for the width; a table in a
// hidden box builds at once and is redrawn when shown.

class TestTableModule extends TableModule {
    /** @override */
    async _renderBody() {
        this.createTable({
            container: this.contentContainer,
            columns: [{ title: 'Name', field: 'name' }],
            data: [{ name: 'A' }],
        });
    }
}

customElements.define('test-first-build-table', TestTableModule);

/** @type {HTMLDivElement} */
let host;

beforeEach(() => {
    resetFakeTabulator();
    host = document.createElement('div');
    document.body.appendChild(host);
});

describe('TableModule first build', () => {
    it('waits for a laid-out container to get its width', async () => {
        host.style.width = '0px';
        const module = TestTableModule.create('zero-width-table', createTestModuleOptions('en'));
        host.append(module);

        // Held: a box with layout builds at once otherwise, as the hidden one below does.
        expect(FakeTabulator.instances).toHaveLength(0);

        host.style.width = '400px';
        await vi.waitFor(() => expect(FakeTabulator.instances).toHaveLength(1));
        module.remove();
    });

    it('builds at once in a hidden container', async () => {
        host.style.display = 'none';
        const module = TestTableModule.create('hidden-table', createTestModuleOptions('en'));
        host.append(module);

        // Built synchronously: no frame had to pass.
        expect(FakeTabulator.instances).toHaveLength(1);
        module.remove();
    });
});

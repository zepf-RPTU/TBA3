// @vitest-browser

// Every refresh reads all stored images from IndexedDB and rewrites the saved layout.
// A revisit after a view switch that left the cart alone must not pay for that, but
// a tick made on another view must arrive when the report comes back.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, mountReportView, select } from '../../../support/reportFixture.js';
import { createTestAppOptions } from '../../../support/glossaryFixture.js';
import { createMemoryImageStore } from '../../../../../src/common/export/memoryImageStore.js';

const images = createMemoryImageStore();
/** @type {import('vitest').MockInstance<typeof images.list>} Set per test, after the mount's own reads. */
let list;

const appOptions = createTestAppOptions('en', {}, images);
const { exportCart } = appOptions.context;

describe('report view on resume', () => {
    /** @type {import('../../../../../src/common/views/report/reportViewModule.js').ReportViewModule} */
    let view;

    beforeEach(async () => {
        view = await mountReportView(appOptions, ['a']);
        list = vi.spyOn(images, 'list');
    });

    it('does not re-read the images when the cart did not change while hidden', async () => {
        view.hide();
        view.show();
        await flush();

        expect(list).not.toHaveBeenCalled();
    });

    it('shows a card ticked on another view', async () => {
        view.hide();
        await select(exportCart, 'b');
        expect(list).not.toHaveBeenCalled();

        view.show();
        await flush();

        expect(list).toHaveBeenCalledOnce();
        expect(view.querySelectorAll('.report-card')).toHaveLength(2);
    });
});

// @vitest-browser

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { flush, mountReportView } from '../../../support/reportFixture.js';
import { createTestAppOptions } from '../../../support/glossaryFixture.js';
import { required } from '../../../../../packages/modules/test/support/required.js';

// A written PDF ends the workflow the cart was filled for; left standing, the cart
// re-ticks the checkboxes of modules the user is done with. It goes only after the
// document exists: clearing on a failed compose would throw away captures the user
// cannot retake without revisiting every view.

const save = vi.fn();
const addBands = vi.fn();
vi.mock('../../../../../src/common/export/pdfComposer.js', async (importOriginal) => ({
    // Only the composer is faked: the band planning the export path runs stays real
    // (`pdfPagePlan.js`, which reportLayout.js reads directly).
    ...(await importOriginal()),
    createPdfComposer: async () => ({ addBands, save }),
}));

const appOptions = createTestAppOptions('en');
const { exportCart } = appOptions.context;

/** @returns {HTMLElement} The report toolbar's export button. */
const exportButton = () =>
    /** @type {HTMLElement} */ (
        page.getByRole('button', { name: 'Als PDF exportieren' }).element()
    );

describe('report view clears the cart once the PDF is written', () => {
    /** @type {import('../../../../../src/common/views/report/reportViewModule.js').ReportViewModule} */
    let view;

    beforeEach(async () => {
        save.mockReset();
        addBands.mockReset();
        view = await mountReportView(appOptions, ['a', 'b']);
    });

    it('empties the cart and says so after a successful export', async () => {
        exportButton().click();
        // The export decodes every stored capture before it writes.
        await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        await flush();

        expect(exportCart.selection.value).toEqual([]);
        expect(
            required(document.querySelector('.toast-region'), 'toast region').textContent,
        ).toContain('Auswahl wurde geleert');
        expect(view.querySelectorAll('.report-card')).toHaveLength(0);
    });

    it('keeps the cart when writing the document fails', async () => {
        save.mockImplementation(() => {
            throw new Error('jsPDF unavailable');
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        exportButton().click();
        // The export ran into the failure, rather than not having run yet.
        await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        await flush();

        expect(console.error).toHaveBeenCalled();
        expect(exportCart.selection.value).toEqual(['a', 'b']);
        expect(view.querySelectorAll('.report-card')).toHaveLength(2);
    });
});

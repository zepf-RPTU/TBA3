/**
 * E2E test: every module card's export menu, every format it offers, produces a real file.
 *
 * Breadth over depth: one test per view, every card on screen in the view's first state,
 * each offered format downloaded once and checked by its file signature and a few
 * format-level oracles. tests/e2e/module-export.spec.js holds the deep checks of single
 * cards (columns, typing, colours); its "Export target ids" check captures every card
 * through the cart, which this sweep does not repeat. What only this sweep covers is
 * the menu each card type offers, the PDF path (paper capture, pagination) for every
 * card, and CSV/JSON for every table and chart. JPG is skipped: it is PNG's capture
 * under another encoder.
 *
 * Cards behind a tab, mode or selection (an SL details display mode, an item-detail tab,
 * a picked student) are outside the sweep.
 */

import { test, expect } from '../e2e/support/test.js';
import { gotoApp } from '../e2e/support/app.js';
import { CAPTURE_TIMEOUT_MS, cardOf } from '../e2e/support/cart.js';
import { EXPORT_TRIGGER, exportFormatsOf, exportVia } from '../e2e/support/exportMenu.js';
import { assertNoPageErrors, collectErrors } from '../e2e/support/pageErrors.js';
import { fillShare, imageSrc } from '../e2e/support/pixels.js';
import { VIEWS } from '../e2e/support/views.js';

/** The formats the sweep downloads, of those a card offers. */
const SWEPT_FORMATS = new Set(['PDF', 'PNG', 'CSV', 'JSON']);

/** The most of a PNG one colour may cover: a capture of the bare card surface is blank. */
const MAX_SURFACE_SHARE = 0.98;

/** Text a data export carries only when a value was serialised wrongly. */
const SERIALISATION_LEAKS = ['[object', '<span', 'undefined', 'NaN'];

/**
 * Check one downloaded file against its format.
 * @param {import('@playwright/test').Page} page - A page to decode images in.
 * @param {{name: string, bytes: Buffer}} file
 * @param {string} format - The menu row's id.
 * @param {{app: string, surface: string, where: string}} context - The dashboard, the
 *     card's background colour, and the card's label for failure messages.
 */
async function checkFile(page, { name, bytes }, format, { app, surface, where }) {
    const ext = format.toLowerCase();
    expect(name, where).toMatch(new RegExp(`^tba3-${app}-.+-\\d{8}-\\d{4}\\.${ext}$`));
    switch (format) {
        case 'PDF': {
            expect(bytes.subarray(0, 5).toString('latin1'), where).toBe('%PDF-');
            expect(bytes.length, where).toBeGreaterThan(5_000);
            // jsPDF compresses streams only; the page dictionaries stay readable.
            expect(bytes.toString('latin1'), where).toMatch(/\/Type \/Page\b(?!s)/);
            return;
        }
        case 'PNG': {
            expect(Array.from(bytes.subarray(0, 4)), where).toEqual([0x89, 0x50, 0x4e, 0x47]);
            const { total, matching } = await fillShare(page, imageSrc(bytes), surface);
            expect(total, where).toBeGreaterThan(0);
            expect(matching / total, `${where}: blank capture`).toBeLessThan(MAX_SURFACE_SHARE);
            return;
        }
        case 'CSV': {
            expect(Array.from(bytes.subarray(0, 3)), where).toEqual([0xef, 0xbb, 0xbf]);
            const text = bytes.subarray(3).toString('utf8');
            // A header and at least one row; a card of several tables puts each title on
            // a line above its header, so the cells are not parsed here.
            expect(text.split(/\r?\n/).filter(Boolean).length, where).toBeGreaterThan(1);
            for (const leak of SERIALISATION_LEAKS) expect(text, where).not.toContain(leak);
            expect(text, `${where}: JSON dump in a cell`).not.toMatch(/(^|;)"[[{]/m);
            return;
        }
        case 'JSON': {
            const json = JSON.parse(bytes.toString('utf8'));
            expect(Array.isArray(json), where).toBe(true);
            expect(json.length, where).toBeGreaterThan(0);
            // Several tables are `{title, rows}` each.
            for (const entry of json) {
                if (entry && 'title' in entry && Array.isArray(entry.rows)) {
                    expect(entry.rows.length, `${where}: ${entry.title}`).toBeGreaterThan(0);
                }
            }
            return;
        }
        default:
            throw new Error(`${where}: unexpected export format ${format}`);
    }
}

for (const [app, views] of Object.entries(VIEWS)) {
    for (const view of views) {
        test(`${app} ${view}: every card exports every format it offers`, async ({ page }) => {
            const { pageErrors } = collectErrors(page);
            await gotoApp(page, `/${app}/#${view}`);
            const triggers = page.locator(`#${app}-${view}-container ${EXPORT_TRIGGER}:visible`);
            const count = await triggers.count();
            test.skip(count === 0, 'no exportable card in the view’s first state');
            // At most four swept formats a card, each one capture.
            test.setTimeout(30_000 + count * SWEPT_FORMATS.size * CAPTURE_TIMEOUT_MS);

            for (let i = 0; i < count; i++) {
                const trigger = triggers.nth(i);
                const card = cardOf(trigger);
                const [title = 'untitled'] = await card
                    .locator('.content-module-title')
                    .allTextContents();
                const where = `${app}/${view} card ${i} (${title.trim()})`;
                const surface = await card.evaluate((el) => getComputedStyle(el).backgroundColor);

                const formats = await exportFormatsOf(page, trigger);
                expect(formats.length, where).toBeGreaterThan(0);
                for (const format of formats.filter((id) => SWEPT_FORMATS.has(id))) {
                    const file = await exportVia(page, trigger, format);
                    await checkFile(page, file, format, {
                        app,
                        surface,
                        where: `${where} ${format}`,
                    });
                }
                await expect(page.locator('.export-capture-stage')).toHaveCount(0);
            }
            assertNoPageErrors(pageErrors);
        });
    }
}

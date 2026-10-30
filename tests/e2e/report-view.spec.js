/**
 * E2E test: the report view assembles modules ticked in different views.
 *
 * Guards the cross-view batch export (src/common/export/): capture-on-tick,
 * the IndexedDB image store, the A4 page preview's order/width/zoom controls,
 * and the band-packed PDF. Oracles are the cart state the user sees
 * (aria-checked, card count, the disabled up/down and pressed width buttons, the page
 * written to the cards, the page width the zoom resolves to) and the downloaded bytes.
 */

import { test, expect, seedColorScheme } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import {
    CAPTURE_TIMEOUT_MS,
    cardOf,
    expectReportPlace,
    exportCart,
    reportCardFor,
    tickOf,
} from './support/cart.js';
import { openReportWithTwoCards } from './support/nav.js';
import { pixelAt } from './support/pixels.js';
import { COMPETENCE_CARD, OVERLAY } from './support/slCompetenceChart.js';
import { required } from '../../packages/modules/test/support/required.js';
import { A4 } from '../../src/common/export/pdfPagePlan.js';

/** CSS pixels per inch, and millimetres per inch: an A4 sheet's size at 100 % zoom. */
const CSS_PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;
const A4_WIDTH_PX = (A4.widthMm * CSS_PX_PER_INCH) / MM_PER_INCH;

test.describe('Report view', () => {
    /**
     * The rendered width of one A4 sheet.
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<number>}
     */
    const pageWidthPx = (page) =>
        page
            .locator('.report-pages')
            .evaluate((el) =>
                parseFloat(getComputedStyle(el).getPropertyValue('--report-page-width')),
            );

    /**
     * Click one of a card's controls. The toolbar overlays the card and is revealed on
     * hover; unhovered, the image takes the click.
     * @param {import('@playwright/test').Locator} card
     * @param {string} selector - The control inside its toolbar.
     */
    async function clickCardControl(card, selector) {
        await card.hover();
        await card.locator(selector).click();
    }

    /**
     * A card's pressed width preset, whose `data-span` is the card's width.
     * @param {import('@playwright/test').Locator} card
     * @returns {import('@playwright/test').Locator}
     */
    const pressedSpan = (card) =>
        card.locator('[data-report-card-action="span"][aria-pressed="true"]');

    /**
     * A button of the report toolbar.
     * @param {import('@playwright/test').Page} page
     * @param {string} name - Its accessible name.
     * @returns {import('@playwright/test').Locator}
     */
    const toolbarButton = (page, name) =>
        page.locator('.report-toolbar').getByRole('button', { name });

    test('collects cards from two views, lets the user reorder and resize them, survives a reload and exports one PDF', async ({
        page,
    }) => {
        // The cards come in sidebar order: overview before item.
        await openReportWithTwoCards(page, { touch: false });
        const overviewCard = reportCardFor(page, 'Übersicht');
        const itemCard = reportCardFor(page, 'Ansicht Aufgaben');
        await expectReportPlace(overviewCard, 'first');
        await expectReportPlace(itemCard, 'last');

        // Both land on the A4 sheets the PDF will use, and the first sheet carries
        // the footer the PDF's first page will carry.
        const sheets = page.locator('.report-sheet');
        await expect(sheets.first()).toBeVisible();
        await expect(overviewCard).toHaveAttribute('data-page', /\d+/);
        const total = await sheets.count();
        await expect(page.locator('.report-sheet-footer').first()).toHaveText(
            new RegExp(`^TBA3 · EN · \\d{2}\\.\\d{2}\\.\\d{4} \\d{2}:\\d{2} · Seite 1/${total}$`),
        );

        // Up/down reorders without moving nodes.
        await clickCardControl(itemCard, '[data-report-card-action="up"]');
        await expectReportPlace(itemCard, 'first');
        await expectReportPlace(overviewCard, 'last');
        const movedTitle = await itemCard.locator('.report-card-title').textContent();
        await expect(page.locator('.report-toolbar > [role="status"]')).toHaveText(
            `„${movedTitle}“ an Position 1 von 2`,
        );

        // Width preset halves the card's share of the page content width.
        const sheetWidth = await pageWidthPx(page);
        await clickCardControl(itemCard, '[data-report-card-action="span"][data-span="6"]');
        await expect(pressedSpan(itemCard)).toHaveAttribute('data-span', '6');
        await expect(pressedSpan(overviewCard)).toHaveAttribute('data-span', '12');
        const contentWidth = sheetWidth * ((A4.widthMm - 2 * A4.marginMm) / A4.widthMm);
        /** @param {import('@playwright/test').Locator} card */
        const cardWidth = async (card) => required(await card.boundingBox()).width;
        await expect.poll(() => cardWidth(itemCard)).toBeLessThan(contentWidth * 0.55);
        await expect
            .poll(async () => Math.abs((await cardWidth(overviewCard)) - contentWidth))
            .toBeLessThan(2);

        // Zoom presets resize the sheets.
        await page.locator('[data-report-zoom="full"]').click();
        await expect
            .poll(async () => Math.abs((await pageWidthPx(page)) - A4_WIDTH_PX))
            .toBeLessThan(0.5);
        await page.locator('[data-report-zoom="half"]').click();
        await expect
            .poll(async () => Math.abs((await pageWidthPx(page)) - A4_WIDTH_PX / 2))
            .toBeLessThan(0.5);
        await page.locator('[data-report-zoom="fit-page"]').click();

        // Reload: images (IndexedDB) and layout (sessionStorage) come back.
        await page.reload({ timeout: LOAD_TIMEOUT_MS });
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT_MS });
        await expect(page).toHaveURL(/#report$/);
        const cardsAfterReload = page.locator('.report-card');
        await expect(cardsAfterReload).toHaveCount(2);
        await expectReportPlace(itemCard, 'first');
        await expect(pressedSpan(itemCard)).toHaveAttribute('data-span', '6');
        await expectReportPlace(overviewCard, 'last');

        // The sheet count is read while the preview still stands: writing the document
        // clears the cart, and the sheets go with it.
        const sheetCount = await page.locator('.report-sheet').count();
        const downloadPromise = page.waitForEvent('download', { timeout: CAPTURE_TIMEOUT_MS });
        await toolbarButton(page, 'Als PDF exportieren').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^tba3-en-bericht-\d{8}-\d{4}\.pdf$/);
        const { readFileSync } = await import('node:fs');
        const bytes = readFileSync(await download.path());
        expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(5_000);
        // The document has exactly the pages the preview's sheets showed.
        const pdfPages = bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
        expect(pdfPages).toBe(sheetCount);

        // The written document ends the workflow the cart was filled for, so the cart
        // goes with it; left standing, it would re-tick these modules on the next visit.
        await expect(page.locator('.report-card')).toHaveCount(0);
        await expect(page.locator('.toast-region')).toContainText('Auswahl wurde geleert');
        await expect(page.locator('.batch-export-toolbar')).toBeHidden();
    });

    // Paper is white whatever the screen shows: a card ticked in dark mode is captured
    // light, and the sheet with its footer stays light around it.
    test('in dark mode, the sheets and the captured cards are light', async ({ context, page }) => {
        await seedColorScheme(context, 'dark');
        await openReportWithTwoCards(page, { touch: false });
        await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');

        const sheet = page.locator('.report-sheet').first();
        await expect(sheet).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        const src = required(await page.locator('.report-card-image').first().getAttribute('src'));
        // Just inside the card's edge: its padding, painted in the card surface.
        expect(await pixelAt(page, src, 8, 8)).toBe('rgb(255, 255, 255)');
    });

    // A card's remove button is the only way a module leaves the report while its own
    // view is off screen, so it has to drop the cart entry too. Kept out of the export
    // test above, where writing the PDF clears the cart.
    test('removing a card drops it from the cart', async ({ page }) => {
        await openReportWithTwoCards(page, { touch: false });
        const cards = page.locator('.report-card');

        await clickCardControl(cards.first(), '[data-report-card-action="remove"]');
        await expect(cards).toHaveCount(1);
        await expect(page.locator('.batch-export-toolbar .selection-count')).toContainText('1 ');
        // The report counts and clears the cart itself, so the batch toolbar stays
        // down here, and comes back on any other view.
        await expect(page.locator('.batch-export-toolbar')).toBeHidden();
        await clickNav(page, '#overviewViewButton');
        await expect(page.locator('.batch-export-toolbar')).toBeVisible();
    });

    test('empties the report only after the confirmation', async ({ page }) => {
        await openReportWithTwoCards(page, { touch: false });
        const cards = page.locator('.report-card');
        const clear = toolbarButton(page, 'Alle Karten entfernen');
        const confirmDialog = page.getByRole('dialog', { name: 'Alle Karten entfernen' });

        await clear.click();
        await confirmDialog.getByRole('button', { name: 'Abbrechen' }).click();
        await expect(confirmDialog).toBeHidden();
        await expect(cards).toHaveCount(2);

        await clear.click();
        await confirmDialog.getByRole('button', { name: 'Alle entfernen' }).click();
        await expect(cards).toHaveCount(0);
    });

    test('drops a selection whose stored image is gone, says so, and unticks the module', async ({
        page,
    }) => {
        const cart = exportCart(page);
        await gotoApp(page, '/en/#overview');
        const overviewSvg = await cart.tickOverviewChart();

        // Reload first, so the page holds no connection that would block the delete;
        // nothing on the overview opens the store.
        await page.reload({ timeout: LOAD_TIMEOUT_MS });
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT_MS });
        await cart.dropImageStore();
        await cart.toReport();

        // Lost work: a toast that stays until it is closed.
        const notice = page.locator('.toast--persistent');
        await expect(notice).toContainText('1 Karte ohne gespeichertes Bild');
        await expect(page.locator('.report-card')).toHaveCount(0);
        await expect(page.locator('.batch-export-toolbar')).toBeHidden();

        await clickNav(page, '#overviewViewButton');
        await expect(tickOf(cardOf(overviewSvg))).toHaveAttribute('aria-checked', 'false');
        await cart.tick(cardOf(overviewSvg));
        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(1);
        await expect(page.locator('.toast--persistent')).toHaveCount(1);
    });
});

// Wide from the start: resizing an open dashboard first redraws every chart.
test.describe('Report view in a wide window', () => {
    test.use({ viewport: { width: 1900, height: 1000 } });

    test('packs the A4 pages into as many columns as the window has room for', async ({ page }) => {
        const cart = exportCart(page);
        // Three overview charts: each is tall enough to claim a page of its own,
        // so there are several sheets to distribute.
        await gotoApp(page, '/en/#overview');
        const modules = page.locator('#en-overview-container .module-container');
        await modules.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        for (let i = 0; i < Math.min(3, await modules.count()); i++) {
            const module = modules.nth(i);
            if ((await tickOf(module).count()) === 0) continue;
            await cart.tick(module);
        }

        await cart.toReport();
        await page.waitForSelector('.report-sheet', { timeout: LOAD_TIMEOUT_MS });

        const layout = () =>
            page.evaluate(() => {
                const boxes = [...document.querySelectorAll('.report-sheet')].map((s) =>
                    s.getBoundingClientRect(),
                );
                return {
                    sheets: boxes.length,
                    columns: new Set(boxes.map((b) => Math.round(b.left))).size,
                    rows: new Set(boxes.map((b) => Math.round(b.top))).size,
                    firstTwoShareARow:
                        boxes.length > 1 && Math.abs(boxes[0].top - boxes[1].top) < 1,
                };
            });

        // The sheets are packed after they mount.
        await expect.poll(async () => (await layout()).columns).toBeGreaterThan(1);
        const wide = await layout();
        expect(wide.sheets).toBeGreaterThan(1);
        expect(wide.columns).toBeGreaterThan(1);
        expect(wide.firstTwoShareARow).toBe(true);
        expect(wide.rows).toBeLessThan(wide.sheets);

        // Narrow window (the 1024px shell minimum): one column again, one sheet per row.
        await page.setViewportSize({ width: 1024, height: 1000 });
        await expect.poll(async () => (await layout()).columns).toBe(1);
        const narrow = await layout();
        expect(narrow.sheets).toBe(wide.sheets);
        expect(narrow.rows).toBe(narrow.sheets);
        expect(narrow.firstTwoShareARow).toBe(false);
    });
});

/**
 * One module instance re-pointed at a different entity in place must carry that entity
 * in its export id; otherwise the second thing opens already ticked and its capture
 * overwrites the first, leaving one report card for two ticks. The describes below
 * cover that shape per dashboard.
 *
 * Every SL Details thumbnail opens the same SlDetailOverlayModule instance, so the
 * cards differ for the export cart only by the id their panels are built with.
 */
test.describe('SL Details cards are ticked independently', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/sl/#details');
        await page.waitForSelector(COMPETENCE_CARD, { timeout: LOAD_TIMEOUT_MS });
    });

    /**
     * Open the nth thumbnail and return the overlay's competence chart card.
     * @param {import('@playwright/test').Page} page
     * @param {number} index - The thumbnail's position.
     * @returns {Promise<import('@playwright/test').Locator>} The chart card.
     */
    async function openCard(page, index) {
        await page.locator(COMPETENCE_CARD).nth(index).click();
        const overlay = page.locator(OVERLAY);
        await overlay.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const chart = overlay
            .locator('.sl-detail-overlay-charts > :not(.overlay-panel--sp)')
            .first();
        await chart
            .locator('svg.chart-root')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        return chart;
    }

    /** @param {import('@playwright/test').Page} page */
    async function closeOverlay(page) {
        await page.locator(`${OVERLAY} .modal-close`).click();
        await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: LOAD_TIMEOUT_MS });
    }

    test('a tick on one card leaves the next card unticked and both reach the report', async ({
        page,
    }) => {
        const cart = exportCart(page);
        // Card 0 is Selbstwirksamkeit; 1 and 2 are two different subjects.
        const first = await openCard(page, 1);
        await expect(tickOf(first)).toHaveAttribute('aria-checked', 'false');
        await cart.tick(first);
        await closeOverlay(page);

        const second = await openCard(page, 2);
        // Card 2 opens unticked: it does not share card 1's target.
        await expect(tickOf(second)).toHaveAttribute('aria-checked', 'false');
        await cart.tick(second);
        await closeOverlay(page);

        await expect(page.locator('.batch-export-toolbar .selection-count')).toContainText('2 ');

        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
    });
});

/** EN item detail is one module instance that shows one item at a time. */
test.describe('EN item detail is ticked per item', () => {
    const NAME_CELL = '.tabulator-cell[tabulator-field="exerciseName"]';
    // The card, not its body: the tick sits in the card's title bar, the body carries the id.
    const DETAIL_CARD = '.en-item-view .item-detail-panel';

    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/#item');
        await page
            .locator('#item-table .tabulator-row')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    });

    test('a tick follows the item on screen and both items reach the report', async ({ page }) => {
        const cart = exportCart(page);
        const detail = page.locator(DETAIL_CARD);
        const tick = tickOf(detail);
        const rows = page.locator('#item-table .tabulator-row');

        // Nothing selected: no item to export, so no tick.
        await expect(tick).toHaveCount(0);

        await rows.nth(0).locator(NAME_CELL).click();
        await expect(tick).toHaveAttribute('aria-checked', 'false', { timeout: LOAD_TIMEOUT_MS });
        await cart.tick(detail);

        // Deselect the first, so one item shows at a time.
        await rows.nth(0).locator(NAME_CELL).click();
        await rows.nth(1).locator(NAME_CELL).click();

        await expect(tick).toHaveAttribute('aria-checked', 'false', { timeout: LOAD_TIMEOUT_MS });
        await cart.tick(detail);

        await expect(page.locator('.batch-export-toolbar .selection-count')).toContainText('2 ');
        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
    });
});

test.describe('SL material is ticked per subject', () => {
    test('a tick on one subject leaves the next unticked and both reach the report', async ({
        page,
    }) => {
        const cart = exportCart(page);
        await gotoApp(page, '/sl/#material');

        // The card is the module element itself.
        const material = page.locator('#sl-material-module');
        await material.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        // One module serves every subject × type; the header buttons swap its content
        // in place. The active Fach's button is disabled, so the enabled ones are the
        // others.
        const otherSubjects = page.locator(
            '#sl-shared-header-subject-select button:not([disabled], [aria-disabled="true"])',
        );
        await expect(otherSubjects.first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });

        await cart.tick(material);

        await otherSubjects.first().click();
        await expect(tickOf(material)).toHaveAttribute('aria-checked', 'false', {
            timeout: LOAD_TIMEOUT_MS,
        });
        await cart.tick(material);

        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
    });
});

test.describe('a tick belongs to the dataset it was made in', () => {
    test('switching group leaves the chart unticked, and the report names both groups', async ({
        page,
    }) => {
        const cart = exportCart(page);
        await gotoApp(page, '/en/?scope=groups/8a_mid#overview');
        const overviewSvg = await cart.tickOverviewChart();

        // What the dataset selector does: set ?scope= and reload (scopeSearchParams.js
        // assigns location.search). The cart is in sessionStorage and survives that.
        await gotoApp(page, '/en/?scope=groups/8b_good#overview');

        // The chart in 8b does not inherit 8a's tick, so re-ticking cannot overwrite
        // 8a's capture.
        await expect(tickOf(cardOf(overviewSvg))).toHaveAttribute('aria-checked', 'false', {
            timeout: LOAD_TIMEOUT_MS,
        });
        await cart.tick(cardOf(overviewSvg));

        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
        await expect(page.locator('.report-card-meta', { hasText: 'Lerngruppe 8a' })).toHaveCount(
            1,
        );
        await expect(page.locator('.report-card-meta', { hasText: 'Lerngruppe 8b' })).toHaveCount(
            1,
        );
    });
});

/**
 * E2E test: the report view assembles modules ticked in different views.
 *
 * Guards the cross-view batch export (src/common/export/): capture-on-tick,
 * the IndexedDB image store, the A4 page preview's order/width/zoom controls,
 * and the band-packed PDF. Oracles are the cart state the user sees
 * (aria-checked, card count, order/width/page written to the cards, the page
 * width the zoom resolves to) and the downloaded bytes.
 */

import { test, expect, describe } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT } from './support/app.js';
import { CAPTURE_TIMEOUT, cardOf, exportCart, tickOf } from './support/cart.js';

describe('Report view', () => {
    test.beforeEach(async ({ page }) => {
        // Start from an empty cart regardless of what an earlier run left behind.
        await exportCart(page).open('/en/');
    });

    /** The rendered width of one A4 sheet, in px. */
    const pageWidth = (page) =>
        page
            .locator('.report-pages')
            .evaluate((el) =>
                parseFloat(getComputedStyle(el).getPropertyValue('--report-page-width')),
            );

    /**
     * Click one of a card's controls. The toolbar overlays the card and is
     * revealed on hover, so it has to be hovered before it can be hit — the
     * image would otherwise take the click.
     */
    async function clickCardControl(card, selector) {
        await card.hover();
        await card.locator(selector).click();
    }

    test('collects cards from two views, lets the user reorder and resize them, survives a reload and exports one PDF', async ({
        page,
    }) => {
        const cart = exportCart(page);
        // Tick a chart in the item view …
        await page.locator('#itemViewButton').click();
        const lollipop = page.locator('#item-itemLollipop svg');
        await lollipop.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(cardOf(page.locator('#item-itemLollipop')));

        // … and a chart in the overview.
        await page.locator('#overviewViewButton').click();
        const overviewSvg = page.locator('#en-overview-container svg').first();
        await overviewSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(cardOf(overviewSvg));

        // The toolbar opens the report with both cards, in sidebar order (overview before item).
        await cart.toReport();
        const cards = page.locator('.report-card');
        await expect(cards).toHaveCount(2);
        const cardFor = (viewLabel) =>
            page
                .locator('.report-card')
                .filter({ has: page.locator('.report-card-meta', { hasText: viewLabel }) });
        const overviewCard = cardFor('Übersicht');
        const itemCard = cardFor('Ansicht Aufgaben');
        await expect(overviewCard).toHaveAttribute('data-report-order', '0');
        await expect(itemCard).toHaveAttribute('data-report-order', '1');

        // Both land on the A4 sheets the PDF will use, and the first sheet carries
        // the footer the PDF's first page will carry.
        const sheets = page.locator('.report-sheet');
        await expect(sheets.first()).toBeVisible();
        await expect(overviewCard).toHaveAttribute('data-page', /\d+/);
        const total = await sheets.count();
        await expect(page.locator('.report-sheet-footer').first()).toHaveText(
            new RegExp(`^TBA3 · EN · Bericht · .+ · Seite 1/${total}$`),
        );

        // Up/down reorders without moving nodes.
        await clickCardControl(itemCard, '[data-report-card-action="up"]');
        await expect(itemCard).toHaveAttribute('data-report-order', '0');
        await expect(overviewCard).toHaveAttribute('data-report-order', '1');
        await expect(itemCard.locator('[data-report-card-action="up"]')).toBeDisabled();

        // Width preset halves the card's share of the page content width.
        const sheetWidth = await pageWidth(page);
        await clickCardControl(itemCard, '[data-report-card-action="span"][data-span="6"]');
        await expect(itemCard).toHaveAttribute('data-span', '6');
        await expect(itemCard.locator('[data-span="6"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(overviewCard).toHaveAttribute('data-span', '12');
        const contentWidth = sheetWidth * (186 / 210); // A4 minus the 12 mm margins
        expect((await itemCard.boundingBox()).width).toBeLessThan(contentWidth * 0.55);
        expect(Math.abs((await overviewCard.boundingBox()).width - contentWidth)).toBeLessThan(2);

        // Zoom presets resize the sheets; 100 % is A4 at 96 dpi.
        await page.locator('[data-report-zoom="full"]').click();
        expect(await pageWidth(page)).toBeCloseTo((210 * 96) / 25.4, 0);
        await page.locator('[data-report-zoom="half"]').click();
        expect(await pageWidth(page)).toBeCloseTo((210 * 96) / 50.8, 0);
        await page.locator('[data-report-zoom="fit-page"]').click();

        // Reload: images (IndexedDB) and layout (localStorage) come back.
        await page.reload({ timeout: LOAD_TIMEOUT });
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT });
        await expect(page).toHaveURL(/#report$/);
        const cardsAfterReload = page.locator('.report-card');
        await expect(cardsAfterReload).toHaveCount(2);
        // The reordered item card is still first and half-width.
        await expect(itemCard).toHaveAttribute('data-report-order', '0');
        await expect(itemCard).toHaveAttribute('data-span', '6');
        await expect(overviewCard).toHaveAttribute('data-report-order', '1');

        // Export the arrangement as one PDF. The sheet count is read while the
        // preview still stands: writing the document clears the cart, and the
        // sheets go with it.
        const sheetCount = await page.locator('.report-sheet').count();
        const downloadPromise = page.waitForEvent('download', { timeout: CAPTURE_TIMEOUT });
        await page.locator('[data-report-action="export"]').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^tba3-en-bericht-\d{8}-\d{4}\.pdf$/);
        const { readFileSync } = await import('node:fs');
        const bytes = readFileSync(await download.path());
        expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(5_000);
        // The point of the paged preview: the document has exactly the pages the
        // sheets showed. If these ever diverge, the preview is lying.
        const pdfPages = bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
        expect(pdfPages).toBe(sheetCount);

        // The written document ends the workflow the cart was filled for, so the
        // cart goes with it — left standing it re-ticks these modules on the next
        // visit, which is the leftover selection the session gate exists to stop.
        await expect(page.locator('.report-card')).toHaveCount(0);
        await expect(page.locator('.report-notice')).toBeVisible();
        await expect(page.locator('.batch-export-toolbar')).not.toHaveClass(/visible/);
    });

    // WHY: a card's remove button is the only way a module leaves the report
    // while its own view is off screen, so it has to drop the cart entry too —
    // a card that survives the next refresh, or a cart count that keeps
    // counting it, means report and cart have drifted apart. Kept out of the
    // export test above: writing the PDF clears the cart, so that test has to
    // export both cards before anything can be removed.
    test('removing a card drops it from the cart', async ({ page }) => {
        const cart = exportCart(page);
        await page.locator('#itemViewButton').click();
        const lollipop = page.locator('#item-itemLollipop svg');
        await lollipop.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(cardOf(page.locator('#item-itemLollipop')));

        await page.locator('#overviewViewButton').click();
        const overviewSvg = page.locator('#en-overview-container svg').first();
        await overviewSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(cardOf(overviewSvg));

        await cart.toReport();
        const cards = page.locator('.report-card');
        await expect(cards).toHaveCount(2);

        await clickCardControl(cards.first(), '[data-report-card-action="remove"]');
        await expect(cards).toHaveCount(1);
        await expect(page.locator('.batch-export-toolbar .selection-count')).toContainText('1 ');
    });

    test('packs the A4 pages into as many columns as the window has room for', async ({ page }) => {
        const cart = exportCart(page);
        // Three overview charts: each is tall enough to claim a page of its own,
        // so there are several sheets to distribute.
        await page.setViewportSize({ width: 1900, height: 1000 });
        await page.locator('#overviewViewButton').click();
        const modules = page.locator('#en-overview-container .module-container');
        await modules.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        for (let i = 0; i < Math.min(3, await modules.count()); i++) {
            const module = modules.nth(i);
            if ((await tickOf(module).count()) === 0) continue;
            await cart.tick(module);
        }

        await cart.toReport();
        await page.waitForSelector('.report-sheet', { timeout: LOAD_TIMEOUT });

        const layout = () =>
            page.evaluate(() => {
                const boxes = [...document.querySelectorAll('.report-sheet')].map((s) =>
                    s.getBoundingClientRect(),
                );
                return {
                    sheets: boxes.length,
                    columns: Number(document.querySelector('.report-pages').dataset.columns),
                    rows: new Set(boxes.map((b) => Math.round(b.top))).size,
                    firstTwoShareARow:
                        boxes.length > 1 && Math.abs(boxes[0].top - boxes[1].top) < 1,
                };
            });

        // Wide window: portrait pages sit side by side instead of wasting the width.
        const wide = await layout();
        expect(wide.sheets).toBeGreaterThan(1);
        expect(wide.columns).toBeGreaterThan(1);
        expect(wide.firstTwoShareARow).toBe(true);
        expect(wide.rows).toBeLessThan(wide.sheets);

        // Narrow window: one column again, one sheet per row.
        await page.setViewportSize({ width: 760, height: 1000 });
        await expect.poll(async () => (await layout()).columns).toBe(1);
        const narrow = await layout();
        expect(narrow.sheets).toBe(wide.sheets);
        expect(narrow.rows).toBe(narrow.sheets);
        expect(narrow.firstTwoShareARow).toBe(false);
    });

    test('drops a selection whose stored image is gone, says so, and unticks the module', async ({
        page,
    }) => {
        const cart = exportCart(page);
        await page.locator('#overviewViewButton').click();
        const overviewSvg = page.locator('#en-overview-container svg').first();
        await overviewSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(cardOf(overviewSvg));

        // The image side is lost (evicted / unusable IndexedDB) while the cart in localStorage
        // survives. Reload first so the page holds no connection that would block the delete;
        // nothing on the overview opens the store.
        await page.reload({ timeout: LOAD_TIMEOUT });
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT });
        await cart.dropImageStore();
        await cart.toReport();

        const notice = page.locator('.report-notice');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('1 Element ohne gespeichertes Bild');
        await expect(page.locator('.report-card')).toHaveCount(0);
        await expect(page.locator('.batch-export-toolbar')).not.toHaveClass(/visible/);

        // The module's checkbox agrees, and re-ticking works.
        await page.locator('#overviewViewButton').click();
        await overviewSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await expect(tickOf(cardOf(overviewSvg))).toHaveAttribute('aria-checked', 'false');
        await cart.tick(cardOf(overviewSvg));
        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(1);
        await expect(page.locator('.report-notice')).toBeHidden();
    });

    // WHY: the cart is a basket for one browsing session, and a tab opened from
    // scratch is a new one — it must start empty rather than inherit ticks the
    // user made elsewhere. Discarding the cart writes the shared key, so the tab
    // that owned it has to follow without a reload; a stale in-memory copy there
    // would be written back on its next tick, resurrecting deleted images.
    test("a second tab starts its own session and empties the first tab's cart", async ({
        page,
        context,
    }) => {
        const cart = exportCart(page);
        await page.locator('#overviewViewButton').click();
        const overviewSvg = page.locator('#en-overview-container svg').first();
        await overviewSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(cardOf(overviewSvg));
        await expect(page.locator('.batch-export-toolbar .selection-count')).toContainText('1 ');

        // Tab B is a fresh session: nothing is ticked and its toolbar stays down.
        const other = await context.newPage();
        await other.goto('/en/#overview', { timeout: LOAD_TIMEOUT });
        const otherSvg = other.locator('#en-overview-container svg').first();
        await otherSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await expect(tickOf(cardOf(otherSvg))).toHaveAttribute('aria-checked', 'false');
        await expect(other.locator('.batch-export-toolbar')).not.toHaveClass(/visible/);

        // Tab A follows without a reload: toolbar hides, checkbox unticks.
        await expect(page.locator('.batch-export-toolbar')).not.toHaveClass(/visible/);
        await expect(tickOf(cardOf(overviewSvg))).toHaveAttribute('aria-checked', 'false');
        await other.close();
    });
});

/**
 * Every SL overview thumbnail opens the *same* SlDetailOverlayModule instance, so
 * the cards are only distinguishable to the export cart by the id their panels
 * are built with. When that id was the overlay's alone, all cards shared one
 * export target: the second card opened pre-ticked and its capture overwrote
 * the first, leaving one report card for two ticks.
 */
describe('SL overview cards are ticked independently', () => {
    const THUMBNAIL = '.chart-thumbnail-card';
    const OVERLAY = '.sl-detail-overlay.visible';
    const SUMMARY_ROW = '.sl-summary-view .summary-row-card';

    test.beforeEach(async ({ page }) => {
        await exportCart(page).open('/sl/');
        // Überblick is the default view; let it settle before navigating away.
        await page
            .locator(`${SUMMARY_ROW} svg`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await page.locator('#overviewViewButton').click();
        await page.waitForSelector(THUMBNAIL, { timeout: LOAD_TIMEOUT });
    });

    /** Open the nth thumbnail and return the overlay's competency chart card. */
    async function openCard(page, index) {
        await page.locator(THUMBNAIL).nth(index).click();
        const overlay = page.locator(OVERLAY);
        await overlay.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const chart = overlay.locator('.overlay-panel--main, .overlay-panel--chart').first();
        await chart.locator('svg').first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        return chart;
    }

    async function closeOverlay(page) {
        await page.keyboard.press('Escape');
        await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: LOAD_TIMEOUT });
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
        // The regression: this used to open already ticked, sharing card 1's target.
        await expect(tickOf(second)).toHaveAttribute('aria-checked', 'false');
        await cart.tick(second);
        await closeOverlay(page);

        await expect(page.locator('.batch-export-toolbar .selection-count')).toContainText('2 ');

        // Two ticks, two captures, two cards — not one overwritten by the other.
        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
    });
});

/**
 * EN item detail is one module instance that shows one item at a time. With a
 * module-wide export id, a tick on item A carried over to item B and B’s
 * capture overwrote A’s, so two ticks produced one report card.
 */
describe('EN item detail is ticked per item', () => {
    const NAME_CELL = '.tabulator-cell[tabulator-field="exercise.name"]';
    const DETAIL_CARD = '#item-detail';

    test.beforeEach(async ({ page }) => {
        await exportCart(page).open('/en/');
        await page.locator('#itemViewButton').click();
        await page
            .locator('#item-table .tabulator-row')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    });

    test('a tick follows the item on screen and both items reach the report', async ({ page }) => {
        const cart = exportCart(page);
        const detail = page.locator(DETAIL_CARD);
        const tick = tickOf(detail);
        const rows = page.locator('#item-table .tabulator-row');

        // Nothing selected: there is no item to export yet.
        await expect(tick).toHaveCount(0);

        await rows.nth(0).locator(NAME_CELL).click();
        await expect(tick).toHaveAttribute('aria-checked', 'false', { timeout: LOAD_TIMEOUT });
        await cart.tick(detail);

        // Switch to another item (deselect the first so one item shows at a time).
        await rows.nth(0).locator(NAME_CELL).click();
        await rows.nth(1).locator(NAME_CELL).click();

        // The regression: this used to stay ticked, carrying the first item's target.
        await expect(tick).toHaveAttribute('aria-checked', 'false', { timeout: LOAD_TIMEOUT });
        await cart.tick(detail);

        await expect(page.locator('.batch-export-toolbar .selection-count')).toContainText('2 ');
        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
    });
});

/**
 * The remaining shapes of the shared-id bug, one per dashboard. Each module
 * below is a single instance re-pointed at a different entity in place, so
 * before their ids carried that entity the second thing opened already ticked
 * and its capture overwrote the first.
 */

describe('EN student view is ticked per student', () => {
    test('a tick on one student leaves the next unticked and both reach the report', async ({
        page,
    }) => {
        const cart = exportCart(page);
        await cart.open('/en/');
        await page.locator('#studentViewButton').click();

        const select = page.locator('select.header-module-student-select');
        await select.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const values = await select
            .locator('option')
            .evaluateAll((options) => options.map((o) => o.value));
        expect(values.length).toBeGreaterThan(1);

        // The spider chart is one host re-pointed at whichever student is picked.
        const spider = page.locator('.module-container', { has: page.locator('#student-spider') });
        await spider.locator('svg').first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(spider);

        await select.selectOption(values[1]);
        // The regression: this used to stay ticked, carrying the first student.
        await expect(tickOf(spider)).toHaveAttribute('aria-checked', 'false', {
            timeout: LOAD_TIMEOUT,
        });
        await cart.tick(spider);

        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
    });
});

describe('MA focus chart is ticked per Leitidee', () => {
    test('a tick on one domain leaves the next unticked and both reach the report', async ({
        page,
    }) => {
        const cart = exportCart(page);
        await cart.open('/ma/');
        await clickNav(page, '#itemViewButton');

        const chartOnly = page.locator('[data-mode-switch-button="true"][data-mode="chart-only"]');
        await chartOnly.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await chartOnly.click();

        const focus = page.locator('.module-container', { has: page.locator('#ma-item-focus') });
        await focus.locator('svg').first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(focus);

        // One host serves every Leitidee — onUpdate swaps the domain in place.
        const otherDomain = page
            .locator(
                '#ma-item-taskRing-chartOnly .task-ring-chart-item--selectable[data-domain]:not(.selected):not([data-domain="overall"])',
            )
            .first();
        await otherDomain.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await otherDomain.click();

        await expect(tickOf(focus)).toHaveAttribute('aria-checked', 'false', {
            timeout: LOAD_TIMEOUT,
        });
        await cart.tick(focus);

        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
    });
});

describe('SL material is ticked per subject', () => {
    test('a tick on one subject leaves the next unticked and both reach the report', async ({
        page,
    }) => {
        const cart = exportCart(page);
        await cart.open('/sl/');
        await page.locator('#materialViewButton').click();

        const material = page.locator('.module-container', {
            has: page.locator('#sl-material-module'),
        });
        await material.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        // One module serves every subject × type; the header buttons swap its
        // content in place, with no re-render of the module shell.
        const subjects = page
            .locator('#sl-shared-header .header-module-button-group')
            .filter({ has: page.locator('button', { hasText: 'Gesamt' }) })
            .locator('button');
        await expect(subjects.first()).toBeVisible({ timeout: LOAD_TIMEOUT });
        expect(await subjects.count()).toBeGreaterThan(1);

        await cart.tick(material);

        await subjects.nth(1).click();
        await expect(tickOf(material)).toHaveAttribute('aria-checked', 'false', {
            timeout: LOAD_TIMEOUT,
        });
        await cart.tick(material);

        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
    });
});

describe('a tick belongs to the dataset it was made in', () => {
    test('switching class leaves the chart unticked, and the report names both classes', async ({
        page,
    }) => {
        const cart = exportCart(page);
        await cart.open('/en/?class=8a_mid');
        await page.locator('#overviewViewButton').click();
        const overviewSvg = page.locator('#en-overview-container svg').first();
        await overviewSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await cart.tick(cardOf(overviewSvg));

        // What the dataset selector does: set ?class= and reload
        // (classSearchParams.js assigns location.search). The cart is in
        // localStorage, so it survives that reload — which is the whole problem.
        await gotoApp(page, '/en/?class=8b_good');
        await page.locator('#overviewViewButton').click();
        await overviewSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // The regression: the chart in 8b used to inherit 8a's tick, and
        // re-ticking overwrote 8a's capture.
        await expect(tickOf(cardOf(overviewSvg))).toHaveAttribute('aria-checked', 'false', {
            timeout: LOAD_TIMEOUT,
        });
        await cart.tick(cardOf(overviewSvg));

        await cart.toReport();
        await expect(page.locator('.report-card')).toHaveCount(2);
        // Both captures survive, and each card says which class it shows.
        await expect(page.locator('.report-card-meta', { hasText: 'Klasse 8a' })).toHaveCount(1);
        await expect(page.locator('.report-card-meta', { hasText: 'Klasse 8b' })).toHaveCount(1);
    });
});

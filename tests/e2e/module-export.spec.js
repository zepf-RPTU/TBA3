/**
 * E2E test: the module export menu produces real files.
 *
 * Guards the export pipeline (src/common/export/): capture of the module card via
 * html-to-image, A4 composition via jsPDF (both lazily imported chunks), and
 * Tabulator's CSV download. Oracles are the downloaded bytes and file names.
 */

import { test, expect, seedColorScheme } from './support/test.js';
import {
    clickNav,
    dataTableToggle,
    gotoApp,
    gotoChart,
    LOAD_TIMEOUT_MS,
    menuRow,
} from './support/app.js';
import { CAPTURE_TIMEOUT_MS, cardOf } from './support/cart.js';
import { exportTriggerOf, exportVia, parseCsv } from './support/exportMenu.js';
import { fillShare, imageSrc, pixelAt } from './support/pixels.js';
import { openDomainTable } from './support/slDomainTable.js';
import { VIEWS } from './support/views.js';

const VISIBILITY_BUTTON = 'button[data-header-action-button="table-columns"]';

test.describe('Module export menu', () => {
    test.beforeEach(async ({ page }) => {
        await gotoChart(page, '/en/#item', '#item-itemLollipop');
    });

    test('chart module: PNG and PDF downloads carry the format signature and a descriptive name', async ({
        page,
    }) => {
        const trigger = await exportTriggerOf(cardOf(page.locator('#item-itemLollipop')));

        const png = await exportVia(page, trigger, 'PNG');
        expect(png.name).toMatch(/^tba3-en-aufgaben-.+-\d{8}-\d{4}\.png$/);
        expect(Array.from(png.bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
        // A real capture, not a blank stub.
        expect(png.bytes.length).toBeGreaterThan(5_000);

        const pdf = await exportVia(page, trigger, 'PDF');
        expect(pdf.name).toMatch(/^tba3-en-aufgaben-.+-\d{8}-\d{4}\.pdf$/);
        expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(pdf.bytes.length).toBeGreaterThan(5_000);

        // The capture stage never lingers in the live document.
        await expect(page.locator('.export-capture-stage')).toHaveCount(0);
    });

    test('table module: CSV reflects the visible header row (BOM + ";"), PDF is a real document', async ({
        page,
    }) => {
        const tableCard = cardOf(page.locator('.tabulator').first());
        const trigger = await exportTriggerOf(tableCard);

        const csv = await exportVia(page, trigger, 'CSV');
        expect(csv.name).toMatch(/^tba3-en-aufgaben-.+-\d{8}-\d{4}\.csv$/);
        expect(Array.from(csv.bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
        const { header } = parseCsv(csv.bytes);
        expect(header.length).toBeGreaterThan(1);
        // The export follows the columns on screen, not the definition order.
        const firstHeader = (
            await tableCard.locator('.tabulator-col-title:visible').first().innerText()
        ).trim();
        expect(header[0]).toBe(firstHeader);

        const pdf = await exportVia(page, trigger, 'PDF');
        expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(pdf.bytes.length).toBeGreaterThan(5_000);
    });

    // Tabulator builds download rows from raw field values and never runs a cell
    // formatter for csv/json, so a column whose cell is a bar, a chip or an icon
    // would export empty or as a JSON dump.
    test('table module: every visual column exports real data, split into numeric columns', async ({
        page,
    }) => {
        const trigger = await exportTriggerOf(cardOf(page.locator('.tabulator').first()));

        const { header, rows } = parseCsv((await exportVia(page, trigger, 'CSV')).bytes);
        expect(rows.length).toBeGreaterThan(0);

        // The bar and the Pilotierung cell are replaced by their numbers.
        for (const title of [
            'Richtig (Anzahl)',
            'Falsch (Anzahl)',
            'Unbearbeitet (Anzahl)',
            'Richtig (%)',
            'Falsch (%)',
            'Unbearbeitet (%)',
            'Pilotierung (%)',
            'Stile',
        ]) {
            expect(header, `missing column ${title}`).toContain(title);
        }
        // The visual columns themselves opted out rather than exporting blanks.
        expect(header).not.toContain('Verteilung');

        // No cell carries a JSON dump of a Set/array/object, or raw cell markup.
        for (const row of rows) {
            for (const cell of row) {
                expect(cell.startsWith('[') || cell.startsWith('{'), `JSON leaked: ${cell}`).toBe(
                    false,
                );
                expect(cell).not.toContain('<span');
            }
        }

        // The count and percent columns carry parseable numbers, and the German
        // decimal comma is what German Excel needs to read a % cell as a number.
        /**
         * @param {string[]} row - One CSV body row.
         * @returns {string}
         */
        const countCell = (row) => row[header.indexOf('Richtig (Anzahl)')];
        /**
         * @param {string[]} row - One CSV body row.
         * @returns {string}
         */
        const percentCell = (row) => row[header.indexOf('Richtig (%)')];
        expect(rows.some((row) => /^\d+$/.test(countCell(row)))).toBe(true);
        for (const row of rows) {
            expect(countCell(row)).toMatch(/^\d*$/);
            expect(percentCell(row)).toMatch(/^(\d+(,\d)?)?$/);
        }
    });

    test('table module: the column menu shows every hidden column again in one step', async ({
        page,
    }) => {
        const tableCard = cardOf(page.locator('.tabulator').first());
        const visibilityButton = tableCard.locator(VISIBILITY_BUTTON).first();
        await visibilityButton.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const menu = page
            .locator(
                '.header-action-dropdown-wrapper:has(> [data-header-action-button="table-columns"])',
            )
            .first();
        const showAll = menu.locator('button[data-menu-item-id="show-all"]');
        const column = page.locator('.tabulator-col[tabulator-field="percentageCombined"]').first();

        await visibilityButton.click();
        await menuRow(menu, 'percentageCombined').click();
        await expect(column).toBeHidden();
        await expect(showAll).toBeEnabled();

        await showAll.click();

        await expect(column).toBeVisible();
        await expect(showAll).toBeDisabled();
    });
});

test.describe('Overview chart export', () => {
    // html-to-image deep-clones <svg> subtrees without inlining computed styles, so
    // paint that comes from CSS (`fill: var(--competence-level-band-color)`) survives
    // only because the capture stage resolves it onto the elements first.
    // Oracle: the live bar colour occurs in the exported pixels.
    test('competence-level-distribution chart: CSS-painted bars keep their colour in the PNG (no black fallback)', async ({
        page,
    }) => {
        await gotoApp(page, '/en/#overview');
        const chartCard = cardOf(page.locator('#en-overview-container rect.bar-segment').first());
        await chartCard
            .locator('rect.bar-segment')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const liveFill = await chartCard
            .locator('rect.bar-segment')
            .first()
            .evaluate((rect) => getComputedStyle(rect).fill);
        expect(liveFill).toMatch(/^rgb\(/);
        expect(liveFill).not.toBe('rgb(0, 0, 0)');

        const png = await exportVia(page, await exportTriggerOf(chartCard), 'PNG');
        const stats = await fillShare(page, imageSrc(png.bytes), liveFill);

        // The band colour covers a visible share of the card; black is text/axes only.
        expect(stats.matching / stats.total).toBeGreaterThan(0.01);
        expect(stats.black / stats.total).toBeLessThan(0.05);
    });

    test('competence-level-distribution chart: CSV and JSON carry the bars drawn, typed', async ({
        page,
    }) => {
        await gotoApp(page, '/en/#overview');
        const chartCard = cardOf(page.locator('#en-overview-container rect.bar-segment').first());
        const trigger = await exportTriggerOf(chartCard);

        const { header, rows } = parseCsv((await exportVia(page, trigger, 'CSV')).bytes);
        expect(header.slice(0, 2)).toEqual(['Gruppe', 'Anzahl Schüler:innen']);
        expect(header.some((title) => title.endsWith(' Anteil (%)'))).toBe(true);
        expect(rows.length).toBeGreaterThan(0);
        // The Anzahl column holds whole numbers, or nothing where a group has none.
        expect(rows.every((row) => /^(\d+)?$/.test(row[1]))).toBe(true);

        const json = JSON.parse((await exportVia(page, trigger, 'JSON')).bytes.toString('utf8'));
        expect(json).toHaveLength(rows.length);
        for (const record of json) {
            for (const [field, value] of Object.entries(record)) {
                if (field === 'Gruppe') continue;
                // A number, or null where the source has none: never a string.
                expect(value === null || typeof value === 'number').toBe(true);
            }
        }
    });

    test('competence-level-distribution chart: a PNG taken while its table shows captures the chart', async ({
        page,
    }) => {
        await gotoApp(page, '/en/#overview');
        const chartCard = cardOf(page.locator('#en-overview-container rect.bar-segment').first());
        const liveFill = await chartCard
            .locator('rect.bar-segment')
            .first()
            .evaluate((rect) => getComputedStyle(rect).fill);
        await dataTableToggle(chartCard).click();
        await expect(chartCard.locator('.chart-data-table')).toBeVisible();

        const png = await exportVia(page, await exportTriggerOf(chartCard), 'PNG');
        const stats = await fillShare(page, imageSrc(png.bytes), liveFill);

        expect(stats.matching / stats.total).toBeGreaterThan(0.01);
        // The table is back once the capture is taken.
        await expect(chartCard.locator('.chart-data-table')).toBeVisible();
    });
});

test.describe('Image export in dark mode', () => {
    // A PNG is for the screen and keeps its scheme; only the report and PDFs go onto
    // paper, and light.
    test('a PNG keeps the dark card surface', async ({ context, page }) => {
        await seedColorScheme(context, 'dark');
        await gotoApp(page, '/en/#overview');
        const chartCard = cardOf(page.locator('#en-overview-container rect.bar-segment').first());
        const surface = await chartCard.evaluate((card) => getComputedStyle(card).backgroundColor);

        const png = await exportVia(page, await exportTriggerOf(chartCard), 'PNG');

        expect(await pixelAt(page, imageSrc(png.bytes), 8, 8)).toBe(surface);
    });
});

test.describe('MA group table export', () => {
    // The Richtig column and the bar's count column would both read `correctCount`;
    // Tabulator resolves a field to one column, so the table exports the count once.
    test('exports the correct count once, as a number', async ({ page }) => {
        await gotoApp(page, '/ma/#group');
        const table = page.locator('#ma-group-table .tabulator');
        await table.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const trigger = await exportTriggerOf(cardOf(table));

        const { header, rows } = parseCsv((await exportVia(page, trigger, 'CSV')).bytes);
        expect(rows.length).toBeGreaterThan(0);

        expect(header.filter((title) => title.startsWith('Richtig'))).toEqual([
            'Richtig',
            'Richtig (%)',
        ]);
        for (const title of ['Falsch (Anzahl)', 'Unbearbeitet (Anzahl)']) {
            expect(header, `missing column ${title}`).toContain(title);
        }
        const countIndex = header.indexOf('Richtig');
        for (const row of rows) expect(row[countIndex]).toMatch(/^\d+$/);
    });
});

test.describe('SL domain table export', () => {
    test('carries the row-group subject/domain and one column per Kompetenzstufe', async ({
        page,
    }) => {
        const tableCard = await openDomainTable(page, '/sl/');
        const trigger = await exportTriggerOf(tableCard);
        await tableCard
            .locator('.tabulator-group')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        // Every group starts collapsed, and collapsing hides rows rather than filtering
        // them: the file still carries every one.
        const { header, rows } = parseCsv((await exportVia(page, trigger, 'CSV')).bytes);
        expect(rows.length).toBeGreaterThan(0);

        // Tabulator's CSV writer drops row-group headers, so without a column of
        // its own the exported rows would name no Fach/Domäne at all.
        const groupIndex = header.indexOf('Fach / Domäne');
        expect(groupIndex).toBeGreaterThanOrEqual(0);
        expect(rows.every((row) => row[groupIndex].length > 0)).toBe(true);

        // The bars' shares, one unit per column, as the table shows them.
        expect(header.some((title) => /^KS .+ \(%\)$/.test(title))).toBe(true);
        for (const title of ['Männlich (%)', 'Weiblich (%)', 'Divers (%)']) {
            expect(header).toContain(title);
        }

        // The Unterrichtsqualität statistics are carried per row, n included: the count
        // lives beside `statistics` on the payload entry, so a row that stored only the
        // statistics object would leave this column blank.
        const meanIndex = header.indexOf('Unterrichtsqualität – Mittelwert');
        const countIndex = header.indexOf('Unterrichtsqualität – n');
        expect(meanIndex).toBeGreaterThanOrEqual(0);
        const measured = rows.filter((row) => row[meanIndex].length > 0);
        expect(measured.length).toBeGreaterThan(0);
        expect(measured.every((row) => /^\d+$/.test(row[countIndex]))).toBe(true);
        // Rounded and German-localised, never a raw 15-digit float.
        expect(measured.every((row) => /^\d+(,\d{1,2})?$/.test(row[meanIndex]))).toBe(true);

        // The bars' shares too are rounded and localised.
        const competenceLevelIndex = header.findIndex((title) => title.startsWith('KS '));
        expect(
            rows.every(
                (row) =>
                    row[competenceLevelIndex] === '' ||
                    /^\d+(,\d)?$/.test(row[competenceLevelIndex]),
            ),
        ).toBe(true);
    });
});

test.describe('SL group table export', () => {
    test('carries the school and every Lerngruppe, collapsed as they start', async ({ page }) => {
        // The group table is one table grouped by Lerngruppe; Tabulator's CSV writer
        // drops the group headers, so a column of its own says whose each row is.
        const card = await openDomainTable(page, '/sl/', 'by_groups');
        const trigger = await exportTriggerOf(card);
        const groups = card.locator('.tabulator-group');
        await groups.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const groupCount = await groups.count();
        expect(groupCount).toBeGreaterThan(1);

        const { header, rows } = parseCsv((await exportVia(page, trigger, 'CSV')).bytes);

        const ownerIndex = header.indexOf('Lerngruppe');
        expect(ownerIndex).toBeGreaterThanOrEqual(0);
        const owners = new Set(rows.map((row) => row[ownerIndex]));
        expect(owners.has('Schule')).toBe(true);
        expect(owners.size).toBe(groupCount);
        expect(header).toContain('Fach');
    });
});

test.describe('Export target ids', () => {
    // The id is the cart key, the image key and the report-card key at once: two cards
    // of one view under one id would share a tick, and the second capture would
    // overwrite the first. A shared tick is what the user sees: ticking one card checks
    // the other, so every card must still be unticked when its own turn comes.
    for (const [app, views] of Object.entries(VIEWS)) {
        test(`no two cards of a ${app.toUpperCase()} view share one`, async ({ page }) => {
            await gotoApp(page, `/${app}/`);
            for (const view of views) {
                await clickNav(page, `#${view}ViewButton`);
                const checkboxes = page.locator(
                    `#${app}-${view}-container [data-header-action-button="batch-select"]:visible`,
                );
                const count = await checkboxes.count();
                for (let i = 0; i < count; i++) {
                    const checkbox = checkboxes.nth(i);
                    await expect(checkbox, `${view}: card ${i}`).toHaveAttribute(
                        'aria-checked',
                        'false',
                    );
                    await checkbox.click();
                    await expect(checkbox).toHaveAttribute('aria-checked', 'true', {
                        timeout: CAPTURE_TIMEOUT_MS,
                    });
                }
            }
        });
    }
});

/**
 * E2E test: the module export menu produces real files.
 *
 * Guards the export pipeline (src/common/export/): capture of the module card
 * via html-to-image, A4 composition via jsPDF, and Tabulator's CSV download —
 * html-to-image and jsPDF as lazily imported chunks. Oracles are the downloaded bytes and file
 * names (format signatures), never DOM diffs.
 */

import { test, expect, describe } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT } from './support/app.js';
import { cardOf } from './support/cart.js';

const EXPORT_TIMEOUT = 20_000;

const EXPORT_TRIGGER = '[data-header-action-button="export-trigger"]';
const MENU_ITEM = '.header-action-dropdown-option';

/**
 * Open the export menu of `wrapper` and pick the item labelled `label`.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} trigger
 * @param {string} label
 */
async function exportVia(page, trigger, label) {
    const downloadPromise = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT });
    await trigger.click();
    const item = trigger.locator('..').locator(`${MENU_ITEM}[data-menu-item-id="${label}"]`);
    await item.waitFor({ state: 'visible', timeout: 5_000 });
    await item.click();
    const download = await downloadPromise;
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

/**
 * Split an exported CSV into its header cells and body rows.
 *
 * Tabulator quotes every field, so unquoting is a plain strip.
 * @param {Buffer} bytes - The downloaded file, BOM included.
 * @returns {{header: string[], rows: string[][]}} The parsed cells.
 */
function parseCsv(bytes) {
    const unquote = (cell) => cell.replace(/^"|"$/g, '').split('""').join('"');
    const lines = bytes.subarray(3).toString('utf8').split(/\r?\n/).filter(Boolean);
    return {
        header: lines[0].split(';').map(unquote),
        rows: lines.slice(1).map((line) => line.split(';').map(unquote)),
    };
}

const VISIBILITY_BUTTON = 'button[data-header-action-button="table-columns"]';

describe('Module export menu', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/');
        await page.locator('#itemViewButton').click();
        await page
            .locator('#item-itemLollipop svg')
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    });

    test('chart module: PNG and PDF downloads carry the format signature and a descriptive name', async ({
        page,
    }) => {
        const chartCard = cardOf(page.locator('#item-itemLollipop'));
        const trigger = chartCard.locator(EXPORT_TRIGGER).first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        const png = await exportVia(page, trigger, 'PNG');
        expect(png.name).toMatch(/^tba3-en-item-.+-\d{8}-\d{4}\.png$/);
        expect(Array.from(png.bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
        // A real capture, not a blank stub.
        expect(png.bytes.length).toBeGreaterThan(5_000);

        const pdf = await exportVia(page, trigger, 'PDF');
        expect(pdf.name).toMatch(/^tba3-en-item-.+-\d{8}-\d{4}\.pdf$/);
        expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(pdf.bytes.length).toBeGreaterThan(5_000);

        // The capture stage never lingers in the live document.
        await expect(page.locator('.export-capture-stage')).toHaveCount(0);
    });

    // html-to-image deep-clones <svg> subtrees without inlining computed styles,
    // so paint that comes from CSS (competence bands: `fill: var(--ks-band-color)`)
    // only survives because the capture stage resolves it onto the elements first.
    // Oracle: the live bar colour occurs in the exported pixels.
    test('KS-distribution chart: CSS-painted bars keep their colour in the PNG (no black fallback)', async ({
        page,
    }) => {
        await page.locator('#overviewViewButton').click();
        const chartCard = cardOf(page.locator('#en-overview-container rect.bar-segment').first());
        await chartCard
            .locator('rect.bar-segment')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const liveFill = await chartCard
            .locator('rect.bar-segment')
            .first()
            .evaluate((rect) => getComputedStyle(rect).fill);
        expect(liveFill).toMatch(/^rgb\(/);
        expect(liveFill).not.toBe('rgb(0, 0, 0)');

        const trigger = chartCard.locator(EXPORT_TRIGGER).first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const png = await exportVia(page, trigger, 'PNG');

        const stats = await page.evaluate(
            async ({ base64, fill }) => {
                const image = new Image();
                image.src = `data:image/png;base64,${base64}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
                const [r, g, b] = fill.match(/\d+/g).map(Number);
                let matching = 0;
                let black = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] === r && data[i + 1] === g && data[i + 2] === b) matching += 1;
                    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) black += 1;
                }
                return { total: data.length / 4, matching, black };
            },
            { base64: png.bytes.toString('base64'), fill: liveFill },
        );

        // The band colour covers a visible share of the card; black is text/axes only.
        expect(stats.matching / stats.total).toBeGreaterThan(0.01);
        expect(stats.black / stats.total).toBeLessThan(0.05);
    });

    test('table module: CSV reflects the visible header row (BOM + ";"), PDF is a real document', async ({
        page,
    }) => {
        const tableCard = cardOf(page.locator('.tabulator').first());
        const trigger = tableCard.locator(EXPORT_TRIGGER).first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        const csv = await exportVia(page, trigger, 'CSV');
        expect(csv.name).toMatch(/^tba3-en-item-.+-\d{8}-\d{4}\.csv$/);
        expect(Array.from(csv.bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
        const headerLine = csv.bytes.subarray(3).toString('utf8').split(/\r?\n/)[0];
        expect(headerLine).toContain(';');
        // The first *visible* Tabulator header must be the first CSV column — hidden
        // columns (the item table's iqbId, display:none) must not leak into the file.
        const firstHeader = (
            await tableCard.locator('.tabulator-col-title:visible').first().innerText()
        ).trim();
        expect(headerLine.split(';')[0].replace(/^"|"$/g, '')).toBe(firstHeader);
        expect(headerLine).not.toContain('"ID"');

        const pdf = await exportVia(page, trigger, 'PDF');
        expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(pdf.bytes.length).toBeGreaterThan(5_000);
    });

    // The columns whose cell is a bar, a chip or an icon used to export empty or
    // as a JSON dump, because Tabulator builds download rows from raw field
    // values and never runs a cell formatter for csv/json.
    test('table module: every visual column exports real data, split into numeric columns', async ({
        page,
    }) => {
        const tableCard = cardOf(page.locator('.tabulator').first());
        const trigger = tableCard.locator(EXPORT_TRIGGER).first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

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
        expect(header.some((title) => title.startsWith('Verteilung:'))).toBe(false);

        // One blanket oracle for the whole class of bugs: no cell may carry a
        // JSON dump of a Set/array/object, and none may carry raw cell markup.
        for (const row of rows) {
            for (const cell of row) {
                expect(cell.startsWith('[') || cell.startsWith('{'), `JSON leaked: ${cell}`).toBe(
                    false,
                );
                expect(cell).not.toContain('<span');
            }
        }

        // The formerly-empty columns now carry parseable numbers, and the German
        // decimal comma is what German Excel needs to read a % cell as a number.
        const countCell = (row) => row[header.indexOf('Richtig (Anzahl)')];
        const percentCell = (row) => row[header.indexOf('Richtig (%)')];
        expect(rows.some((row) => /^\d+$/.test(countCell(row)))).toBe(true);
        for (const row of rows) {
            expect(countCell(row)).toMatch(/^\d*$/);
            expect(percentCell(row)).toMatch(/^(\d+(,\d)?)?$/);
        }
    });

    // The numeric columns belong to the bar they were split out of, so hiding it
    // must take them with it — otherwise the CSV stops matching the table.
    test('table module: hiding the distribution column drops its numeric columns from the CSV', async ({
        page,
    }) => {
        const tableCard = cardOf(page.locator('.tabulator').first());
        const trigger = tableCard.locator(EXPORT_TRIGGER).first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        expect(parseCsv((await exportVia(page, trigger, 'CSV')).bytes).header).toContain(
            'Richtig (Anzahl)',
        );

        const visibilityButton = tableCard.locator(VISIBILITY_BUTTON).first();
        await visibilityButton.click();
        const option = page
            .locator(
                '[data-header-action-control="table-columns"] button.header-action-checkbox-option[data-menu-item-id="percentageCombined"]',
            )
            .first();
        await option.waitFor({ state: 'visible', timeout: 5_000 });
        await option.click();
        await expect(
            page.locator('.tabulator-col[tabulator-field="percentageCombined"]').first(),
        ).toBeHidden({ timeout: 5_000 });

        const { header } = parseCsv((await exportVia(page, trigger, 'CSV')).bytes);
        expect(header).not.toContain('Richtig (Anzahl)');
        expect(header).not.toContain('Richtig (%)');
        // The export-only columns are never offered in the menu themselves.
        await visibilityButton.click();
        const labels = await page
            .locator(
                '[data-header-action-control="table-columns"] button.header-action-checkbox-option',
            )
            .allInnerTexts();
        expect(labels.some((label) => label.includes('(Anzahl)'))).toBe(false);
    });
});

describe('SL domain table export', () => {
    test('carries the row-group subject/domain and one column per Kompetenzstufe', async ({
        page,
    }) => {
        // The domain table lives in the overview, grouped by subject, in table
        // mode — same path as sl-domain-table-comparisons.spec.js.
        await gotoApp(page, '/sl/');
        await page
            .locator('.sl-summary-view svg')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await clickNav(page, '#overviewViewButton');
        await page
            .locator('.sl-overview-view')
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        for (const mode of ['by_subjects', 'table']) {
            const button = page
                .locator(`[data-mode-switch-button="true"][data-mode="${mode}"]`)
                .first();
            await button.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
            if (!(await button.isDisabled())) await button.click();
        }

        const tableCard = page.locator('#overview-domain-table-wrapper');
        await expect(tableCard).toBeVisible({ timeout: LOAD_TIMEOUT });
        const trigger = tableCard.locator(EXPORT_TRIGGER).first();
        await trigger.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // Expand a group first: the export's 'active' range is Tabulator's display
        // list, which holds only group rows while every group is collapsed — and
        // its CSV writer drops those, so a collapsed table exports a header alone
        // and every row assertion below would pass vacuously.
        const group = tableCard.locator('.tabulator-group').first();
        await group.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await group.click();

        const { header, rows } = parseCsv((await exportVia(page, trigger, 'CSV')).bytes);
        expect(rows.length).toBeGreaterThan(0);

        // Tabulator's CSV writer drops row-group headers, so without a column of
        // its own the exported rows would name no Fach/Domäne at all.
        const groupIndex = header.indexOf('Fach / Domäne');
        expect(groupIndex).toBeGreaterThanOrEqual(0);
        expect(rows.every((row) => row[groupIndex].length > 0)).toBe(true);

        expect(header.some((title) => title.startsWith('KS '))).toBe(true);
        for (const title of ['Männlich', 'Weiblich', 'Divers']) {
            expect(header).toContain(title);
        }

        // The Unterrichtsqualität statistics are carried per row, n included —
        // its count lives beside `statistics` on the payload entry, so a row that
        // stored only the statistics object left this column permanently blank.
        const meanIndex = header.indexOf('Unterrichtsqualität – Mittelwert');
        const countIndex = header.indexOf('Unterrichtsqualität – n');
        expect(meanIndex).toBeGreaterThanOrEqual(0);
        const measured = rows.filter((row) => row[meanIndex].length > 0);
        expect(measured.length).toBeGreaterThan(0);
        expect(measured.every((row) => /^\d+$/.test(row[countIndex]))).toBe(true);
        // Rounded and German-localised, never a raw 15-digit float.
        expect(measured.every((row) => /^\d+(,\d{1,2})?$/.test(row[meanIndex]))).toBe(true);

        // The comparison rows carry percentages in the KS columns; they must be
        // rounded and localised too, not dumped at full float precision.
        const ksIndex = header.findIndex((title) => title.startsWith('KS '));
        expect(rows.every((row) => row[ksIndex] === '' || /^\d+(,\d)?$/.test(row[ksIndex]))).toBe(
            true,
        );
    });
});

describe('SL class table section export', () => {
    test('mounts an export button in each nested section header, not only on the card', async ({
        page,
    }) => {
        // The SL class table is the only module that mounts export buttons inside
        // *nested* section headers rather than through the ContentModule shell. It
        // resolves the export service from the module runtime the host registers, so
        // an unregistered runtime silently yields no button at all — this is the only
        // assertion in the suite that would notice.
        await gotoApp(page, '/sl/');
        await page
            .locator('.sl-summary-view svg')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await clickNav(page, '#overviewViewButton');
        await page
            .locator('.sl-overview-view')
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        for (const mode of ['by_classes', 'table']) {
            const button = page
                .locator(`[data-mode-switch-button="true"][data-mode="${mode}"]`)
                .first();
            await button.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
            if (!(await button.isDisabled())) await button.click();
        }

        const card = page.locator('#overview-class-table-wrapper');
        await expect(card).toBeVisible({ timeout: LOAD_TIMEOUT });

        // Every class gets its own section, and every section its own button. The
        // sections start collapsed, and a collapsed header hides its actions, so
        // count the buttons in the DOM rather than on screen.
        const sections = card.locator('.table-section');
        const sectionCount = await sections.count();
        expect(sectionCount).toBeGreaterThan(1);
        expect(await card.locator(`.table-section ${EXPORT_TRIGGER}`).count()).toBe(sectionCount);

        const schoolSection = card.locator('.table-section.school-overview').first();
        await schoolSection.locator('.content-module-header.collapsible').first().click();

        const trigger = schoolSection.locator(EXPORT_TRIGGER).first();
        await expect(trigger).toBeVisible({ timeout: LOAD_TIMEOUT });

        // The real service builds a table menu; the runtime's no-op default builds
        // nothing, so opening it proves which one answered.
        await trigger.click();
        const csvItem = trigger.locator('..').locator(`${MENU_ITEM}[data-menu-item-id="CSV"]`);
        await expect(csvItem).toBeVisible({ timeout: 5_000 });
    });
});

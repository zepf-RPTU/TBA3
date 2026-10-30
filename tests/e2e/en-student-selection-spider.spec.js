/**
 * E2E test: EN student view spider chart updates on student selection.
 *
 * The selector writes `currentStudentId`; the style chart host shares that signal as its
 * `studentId` state and the spider redraws (the immutable style aggregation is held from
 * mount, so only the selected student changes).
 *
 * The spider's legend carries the selected student's display name ("Name, Vorname"),
 * so the name is the oracle: "the text changed" would pass for any re-render.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';

// ContentModule transfers the container id to the body, which styleStudentChartConfig
// draws the spider into.
const SPIDER_HOST = '#student-spider';

test.describe('EN student view – spider chart syncs on student selection', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/#student');
    });

    test('selecting a different student re-renders the spider chart', async ({ page }) => {
        const spider = page.locator(`${SPIDER_HOST} svg.chart-root`);
        await spider.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        const host = page.locator(SPIDER_HOST);

        const studentSelect = page.locator('select.control-select').first();
        await studentSelect.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        const { current, currentName, other, otherName } = await studentSelect.evaluate((el) => {
            const select = /** @type {HTMLSelectElement} */ (el);
            const options = Array.from(select.options).filter((option) => option.value);
            const currentValue = select.value;
            const chosen = options.find((option) => option.value !== currentValue);
            return {
                current: currentValue,
                currentName:
                    options.find((option) => option.value === currentValue)?.label.trim() ?? '',
                other: chosen?.value ?? '',
                otherName: chosen?.label.trim() ?? '',
            };
        });
        expect(other).not.toBe('');
        expect(otherName).not.toBe(currentName);
        // The baseline is read once the legend names the student, not mid-render.
        await expect(host).toContainText(currentName);
        const initialText = (await host.textContent())?.trim() ?? '';

        await studentSelect.selectOption(other);

        await expect(host).toContainText(otherName);
        await expect(host).not.toContainText(currentName);

        await studentSelect.selectOption(current);
        await expect.poll(async () => (await host.textContent())?.trim() ?? '').toBe(initialText);

        await expect(spider).toBeVisible();
    });

    test('folding the chart card gives the item detail the column, unfolding restores it', async ({
        page,
    }) => {
        // Side by side: stacked (`--stacked-layout`), each card keeps a fixed height.
        await page.setViewportSize({ width: 1600, height: 900 });
        await page
            .locator(`${SPIDER_HOST} svg.chart-root`)
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const toggle = page.locator('.en-student-view .chart-section .content-module-toggle');
        const detail = page.locator('.en-student-view .detail-section');
        const detailHeight = async () => (await detail.boundingBox())?.height ?? 0;
        await page.evaluate(() => document.fonts.ready);
        const before = await detailHeight();

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect.poll(detailHeight).toBeGreaterThan(before + 100);

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect.poll(detailHeight).toBe(before);
    });
});

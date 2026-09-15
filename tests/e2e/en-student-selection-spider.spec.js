/**
 * E2E test: EN student view spider chart updates on student selection.
 *
 * Regression guard for moving the spider chart off a direct
 * `module.update({ studentData, studentId })` push: the selector writes
 * `currentStudentId`, the view observes it and calls the style chart host's
 * `setStudent` verb (the immutable style aggregation is held from mount, so
 * only the selected student changes).
 *
 * The spider chart renders the selected student's display name ("Name, Vorname")
 * in its legend, so the chart host's text content changes when the student
 * selection changes.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const UPDATE_TIMEOUT = 5_000;

// Spider chart host id: ContentModule transfers the container id to the body,
// and styleChartConfig mounts the spider in a `${id}-styleSpider` child host.
const SPIDER_HOST = '#student-spider-styleSpider';

describe('EN student view – spider chart syncs on student selection', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/');
    });

    test('selecting a different student re-renders the spider chart', async ({ page }) => {
        await page.locator('#studentViewButton').click();

        // Spider chart renders for the initial student
        const spider = page.locator(`${SPIDER_HOST} svg`);
        await spider.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // The legend carries the selected student's display name, so the name is the
        // oracle — "the text changed" would pass for any re-render, including a wrong one.
        const host = page.locator(SPIDER_HOST);
        const initialText = (await host.textContent())?.trim() ?? '';

        // The header student selector is a <select> of students
        const studentSelect = page.locator('select.control-select').first();
        await studentSelect.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // Pick a different student than the currently selected one
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
        expect(other).not.toBe(current);
        expect(otherName).not.toBe(currentName);
        expect(initialText).toContain(currentName);

        await studentSelect.selectOption(other);

        // The spider must re-render for the student that was actually selected.
        await expect(host).toContainText(otherName, { timeout: UPDATE_TIMEOUT });
        await expect(host).not.toContainText(currentName);

        // Back again, and the legend returns to exactly what it started as.
        await studentSelect.selectOption(current);
        await expect
            .poll(async () => (await host.textContent())?.trim() ?? '', { timeout: UPDATE_TIMEOUT })
            .toBe(initialText);

        // And the chart is still present (no teardown/error)
        await expect(spider).toBeVisible();
    });
});

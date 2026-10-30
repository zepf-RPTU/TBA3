/**
 * Forced colours: the SVG marks whose colour carries the data keep it, and stay apart.
 *
 * A mark family that differs by fill alone opts out of the forced palette
 * (`forced-color-adjust: none`) and, under forced colours, is edged in the system text
 * colour so neighbouring marks part in any palette. Chromium leaves SVG fills alone under
 * forced colours either way (its UA sheet gives SVG `preserve-parent-color`), so this
 * pins the edge. A mark with `stroke: none` still reports a 1px `stroke-width`, so the
 * stroke colour is the discriminating check. The fill is read with and without forced
 * colours and must not differ: the edge must not come with a repaint.
 *
 * One view per mark family, plus the keyboard focus ring.
 */

import { test, expect } from './support/test.js';
import { dataTableToggle, filterMenuButton, gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';

/** How many marks of a family are sampled: enough to cover several colours. */
const SAMPLE = 12;

/**
 * The computed paint of the first marks `selector` matches.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @returns {Promise<{fill: string, stroke: string, strokeWidth: number, adjust: string}[]>} One entry per sampled mark.
 */
function paintOf(page, selector) {
    return page.$$eval(
        selector,
        (nodes, sample) =>
            nodes.slice(0, sample).map((node) => {
                const style = getComputedStyle(node);
                return {
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: Number.parseFloat(style.strokeWidth),
                    adjust: style.forcedColorAdjust,
                };
            }),
        SAMPLE,
    );
}

/**
 * Assert that every sampled mark has opted out and has a visible edge under forced
 * colours, and the same fill once forced colours are off. Leaves the page with forced colours off.
 * @param {import('@playwright/test').Page} page - The page, with forced colours active.
 * @param {string} selector
 */
async function expectEdgedKeepingFill(page, selector) {
    await page.locator(selector).first().waitFor({ state: 'attached', timeout: LOAD_TIMEOUT_MS });
    // A stroke can transition in (the scatter points ease theirs), so poll for it.
    await expect
        .poll(async () =>
            (await paintOf(page, selector)).every(
                ({ stroke, strokeWidth }) => stroke !== 'none' && strokeWidth >= 1,
            ),
        )
        .toBe(true);
    const forced = await paintOf(page, selector);
    expect(forced.length).toBeGreaterThan(0);
    // The opt-out reaches the mark, whatever its own engine would force.
    expect(forced.every(({ adjust }) => adjust === 'none')).toBe(true);

    await page.emulateMedia({ forcedColors: 'none' });
    const authored = await paintOf(page, selector);
    expect(forced.map(({ fill }) => fill)).toEqual(authored.map(({ fill }) => fill));
    await page.emulateMedia({ forcedColors: 'active' });
}

test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
});

test.describe('SVG marks under forced colours', () => {
    test('MA item ring: the level and outer arcs', async ({ page }) => {
        // The item view's split grid: it shows the inner ring by default, which the
        // overview starts with hidden.
        await gotoApp(page, '/ma/#item');
        await expectEdgedKeepingFill(page, '#ma-item-itemRing .item-ring-level-arc');
        await expectEdgedKeepingFill(page, '#ma-item-itemRing .item-ring-outer-arc');
    });

    test('EN item lollipop: the heads', async ({ page }) => {
        // Its Niveau key is a swatch list, whose chips are HTML, not SVG symbols.
        await gotoApp(page, '/en/#item');
        await expectEdgedKeepingFill(page, '#item-itemLollipop .lollipop-circle');
    });

    test('EN scatterplot: the student points', async ({ page }) => {
        await gotoApp(page, '/en/#overview');
        await expectEdgedKeepingFill(page, '#en-overview-scatterplot .student-point');
    });

    test('SL Längsschnitt: the timeline dots and the box plot', async ({ page }) => {
        await gotoApp(page, '/sl/#longitudinal');
        await expectEdgedKeepingFill(page, '.series-dots .dot');

        await page.locator('button[data-mode="boxplot"]').click();
        await page
            .locator('.longitudinal-chart-body .y-axis-teaching')
            .waitFor({ timeout: LOAD_TIMEOUT_MS });
        // The box keeps its own outline in the group colour; no system edge replaces it.
        await expectEdgedKeepingFill(page, '#sl-long-box-plot .box-figure rect.box');
    });
});

test.describe('Focus ring under forced colours', () => {
    test('hit targets stay transparent over the marks, hovered or not', async ({ page }) => {
        // A forced palette may paint a transparent rect or wedge solid, covering the
        // marks under it. Every hit target opts out, and a hovered band only tints.
        await gotoApp(page, '/sl/#longitudinal');
        const hits = page.locator('.chart-hit');
        await hits.first().waitFor({ state: 'attached', timeout: LOAD_TIMEOUT_MS });
        await hits.first().hover({ force: true });
        const paints = await paintOf(page, '.chart-hit');
        expect(paints.length).toBeGreaterThan(0);
        for (const { fill, adjust } of paints) {
            expect(adjust).toBe('none');
            // Transparent, none, or a colour with alpha below 1 — never an opaque fill.
            expect(fill).toMatch(
                /^(none|transparent|rgba\(.*,\s*0(\.\d+)?\)|color\(.*\/\s*0(\.\d+)?\))$/,
            );
        }
    });

    test('a chart data table keeps its rules, and its toggle tells it is pressed', async ({
        page,
    }) => {
        await gotoApp(page, '/ma/#overview');
        const card = page.locator('.overview-competence-level-chart-container');
        const toggle = dataTableToggle(card);
        await toggle.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        // Whether the toggle is filled apart from the Canvas behind it. A forced palette
        // keeps the author's alpha, so a transparent button and a Canvas-filled one
        // compute different colours while looking the same.
        const filledApart = () =>
            toggle.evaluate((button) => {
                const probe = document.createElement('i');
                probe.style.backgroundColor = 'Canvas';
                document.body.append(probe);
                const canvas = getComputedStyle(probe).backgroundColor;
                probe.remove();
                /** @param {string} color */
                const channels = (color) => (color.match(/[\d.]+/g) ?? []).map(Number);
                const [r, g, b, alpha = 1] = channels(getComputedStyle(button).backgroundColor);
                return alpha > 0 && [r, g, b].join() !== channels(canvas).slice(0, 3).join();
            });
        expect(await filledApart()).toBe(false);

        await toggle.click();

        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(filledApart).toBe(true);
        const rule = await card
            .locator('.chart-data-table td')
            .first()
            .evaluate((cell) => {
                const style = getComputedStyle(cell);
                return {
                    width: Number.parseFloat(style.borderBottomWidth),
                    color: style.borderBottomColor,
                };
            });
        expect(rule.width).toBeGreaterThanOrEqual(1);
        expect(rule.color).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('a toolbar button and a sortable header keep a visible ring', async ({ page }) => {
        // Forced colours drop box-shadow, so a ring drawn as one vanishes; the ring is an
        // outline (--focus-ring), which the system colours keep.
        await gotoApp(page, '/en/#item');
        const header = page.locator('#item-table .tabulator-col.tabulator-sortable').first();
        await header.waitFor({ timeout: LOAD_TIMEOUT_MS });

        for (const target of [filterMenuButton(page, '#item-table'), header]) {
            // A key press first, so the programmatic focus that follows is focus-visible.
            await page.keyboard.press('Shift');
            await target.evaluate((element) => /** @type {HTMLElement} */ (element).focus());
            const outline = await target.evaluate((element) => {
                const style = getComputedStyle(element);
                return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
            });
            expect(outline.style).not.toBe('none');
            expect(outline.width).toBeGreaterThanOrEqual(3);
        }
    });
});

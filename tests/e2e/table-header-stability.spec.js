/**
 * E2E tests: a table's column-header geometry — its height AND its column width
 * floors — depends only on the current viewport, never on the sequence of resizes
 * that led to it.
 *
 * Both bugs guarded here share one root cause: a measurement taken once, against a
 * fluid root font size (`clamp()` in responsive.css), and then never re-taken.
 *
 * ── Header height ───────────────────────────────────────────────────────────
 * WHY THIS MATTERS: Tabulator measures header heights *before* it re-lays out the
 * columns — `ColumnManager.redraw()` runs `verticalAlignHeaders()` (which pins the
 * tallest header height as an inline style on `.tabulator-headers` and every
 * `.tabulator-col`) and only then calls `layoutRefresh()` to assign the new
 * `fitColumns` widths. Our headers wrap (table-header-layout.css) and the root
 * font-size is fluid (responsive.css), so that measurement pass sees the NEW font
 * size inside the OLD column widths. A title that wraps in that transient state
 * pins an extra line of height that nothing clears, and the header keeps a height
 * belonging to the *previous* viewport width. Users see the same window size
 * render different header padding depending on how they got there.
 *
 * TableHeaderGeometry#observe (packages/modules/src/common/tables/internal/tableHeaderGeometry.js) is what
 * closes the loop, with a debounced non-forced redraw once the resize settles.
 * This test fails if that correction is removed, debounced too short to land
 * after Tabulator's own resize redraw, or switched to `redraw(true)` (which
 * would reset the body scroll — asserted below).
 *
 * The assertion is deliberately about path-independence rather than an absolute
 * pixel count: the correct height legitimately changes with the fluid font size,
 * but it must never depend on history.
 *
 * ── Column minWidth floors ──────────────────────────────────────────────────
 * TableModule#processColumns derives each column's `minWidth` from its header
 * text (createHeaderFloorPass in tableHeaderGeometry.js). That measurement is in
 * px but every input is relative — a rem font size and rem padding, both resolved
 * against the fluid root font size — so a floor measured at build time is wrong
 * at every other viewport width. Floors only bind
 * on a squeezed table, and then they bind hard: the EN class table built at 1900px
 * and viewed at 900px carried 902px of floors into an 805px holder (97px of
 * phantom horizontal scroll), where the same table built at 900px needs 812px.
 *
 * TableHeaderGeometry#refresh re-derives them whenever the root font size
 * moves. The test below fails if that refresh stops running, stops being wired
 * into the resize path, or starts touching caller-supplied floors.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

/** Wider and narrower than the probe width, both inside the fluid clamp range. */
const WIDE = 1900;
const NARROW = 900;
const PROBE = 1400;
const VIEWPORT_HEIGHT = 900;

/** Comfortably longer than the 150ms realign debounce in tableHeaderGeometry.js. */
const SETTLE_MS = 700;

async function setViewport(page, width) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await page.waitForTimeout(SETTLE_MS);
}

/** Header geometry plus the root font size the height should be a function of. */
async function readHeaderMetrics(page) {
    return page.evaluate(() => {
        const header = document.querySelector('.tabulator .tabulator-header');
        if (!header) throw new Error('No Tabulator header found');

        const cols = [...header.querySelectorAll('.tabulator-col:not(.tabulator-col-group)')];
        if (cols.length === 0) throw new Error('No leaf columns in the Tabulator header');

        return {
            headerHeight: Math.round(header.getBoundingClientRect().height),
            // The inline height verticalAlignHeaders() pinned — the actual carrier
            // of the staleness, asserted directly so a CSS change that merely
            // masks the symptom cannot make this test pass.
            pinnedColumnHeights: [...new Set(cols.map((col) => col.style.height))].sort(),
            rootFontSize: getComputedStyle(document.documentElement).fontSize,
        };
    });
}

async function openItemView(page) {
    await gotoApp(page, '/en/');
    await page.locator('#itemViewButton').click();
    // The item view's table and chart build together; the chart is the later of
    // the two, so its SVG is a good "view has rendered" signal.
    await page
        .locator('#item-itemLollipop svg')
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    // Wait on the header itself, not its first column: the leading columns can be
    // toggled off (display:none), so `.tabulator-col` first() may never be visible.
    await page
        .locator('.tabulator .tabulator-header')
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await page.waitForTimeout(SETTLE_MS);
}

describe('Table column-header height stability across resizes', () => {
    test('header height at a given width is the same whether reached from a wider or narrower window', async ({
        page,
    }) => {
        await openItemView(page);

        // Arrive at PROBE from above.
        await setViewport(page, WIDE);
        await setViewport(page, PROBE);
        const fromWide = await readHeaderMetrics(page);

        // Arrive at PROBE from below.
        await setViewport(page, NARROW);
        await setViewport(page, PROBE);
        const fromNarrow = await readHeaderMetrics(page);

        // Sanity: the comparison is only meaningful if both readings are at the
        // same font size, i.e. the height really is expected to match.
        expect(fromNarrow.rootFontSize).toBe(fromWide.rootFontSize);

        expect(fromNarrow.headerHeight).toBe(fromWide.headerHeight);
        expect(fromNarrow.pinnedColumnHeights).toEqual(fromWide.pinnedColumnHeights);

        // Returning from above a second time must land on that same height too,
        // so a pass cannot come from both paths being equally wrong.
        await setViewport(page, WIDE);
        await setViewport(page, PROBE);
        const fromWideAgain = await readHeaderMetrics(page);
        expect(fromWideAgain.headerHeight).toBe(fromWide.headerHeight);
    });

    test('the post-resize realign does not scroll the table body back to the top', async ({
        page,
    }) => {
        // Deliberately the class view, not the item view: the item view's chart
        // reflows so much on a width change that its table holder's height halves
        // and the browser zeroes the scroll on its own. That happens with or
        // without the realign, so it cannot tell us anything about the realign.
        // The class view is a plain full-height table whose scroll survives a
        // resize, which is what makes the assertion below meaningful.
        await gotoApp(page, '/en/');
        await page.setViewportSize({ width: PROBE, height: VIEWPORT_HEIGHT });
        await page.locator('#classViewButton').click();
        await page
            .locator('.tabulator .tabulator-header')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await page.waitForTimeout(SETTLE_MS * 2);

        const tableHolder = page.locator('.tabulator .tabulator-tableholder').first();
        // Worthless without real overflow — fail loudly rather than pass silently.
        expect(
            await tableHolder.evaluate((el) => el.scrollHeight > el.clientHeight + 200),
            'class table must overflow for the scroll assertion to mean anything',
        ).toBe(true);

        await tableHolder.evaluate((el) => {
            el.scrollTop = 100;
        });
        await page.waitForTimeout(200);
        expect(await tableHolder.evaluate((el) => Math.round(el.scrollTop))).toBeGreaterThan(0);

        // Resizing must correct the header height WITHOUT resetting scroll:
        // `table.redraw(true)` calls rowManager.resetScroll() and drives this to
        // exactly 0. Row heights legitimately change with column width, so the
        // browser may clamp the offset by a few pixels — hence a floor rather
        // than equality. A forced redraw fails this; the non-forced one does not.
        await setViewport(page, 1100);

        expect(await tableHolder.evaluate((el) => Math.round(el.scrollTop))).toBeGreaterThan(50);
    });

    test('a header title wraps to at most --table-header-max-lines lines', async ({ page }) => {
        await openItemView(page);
        // Narrow viewport = narrowest columns = the most wrapping pressure.
        await setViewport(page, NARROW);

        // No shipped German title is long enough to reach the cap on its own, so
        // asserting over the real titles would pass whether or not the clamp
        // exists. Force the condition instead: overwrite one title with text that
        // cannot possibly fit, and require the CLAMP to be what bounds it.
        const result = await page.evaluate(() => {
            const maxLines = Number.parseInt(
                getComputedStyle(document.documentElement).getPropertyValue(
                    '--table-header-max-lines',
                ),
                10,
            );
            if (!Number.isFinite(maxLines) || maxLines < 1) {
                throw new Error('--table-header-max-lines is not a usable line count');
            }

            const title = [
                ...document.querySelectorAll(
                    '.tabulator .tabulator-header .tabulator-col:not(.tabulator-col-group) .tabulator-col-title',
                ),
            ].find((el) => el.getBoundingClientRect().width > 0);
            if (!title) throw new Error('No laid-out column title found');

            const style = getComputedStyle(title);
            // The title carries vertical padding (--table-col-title-padding), so the
            // line count has to come from the content box, not the border box.
            const verticalPadding =
                Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);

            const lineHeight =
                Number.parseFloat(style.lineHeight) ||
                // `normal` computes to a keyword, not a length — fall back to the
                // font size's usual ~1.2 ratio rather than yielding NaN.
                Number.parseFloat(style.fontSize) * 1.2;

            const measureLines = () => {
                void title.offsetHeight; // flush layout before reading
                const contentHeight = title.getBoundingClientRect().height - verticalPadding;
                return Math.round(contentHeight / lineHeight);
            };

            title.textContent =
                'Kompetenzstufenverteilung Aufgabenniveau Domäne Hörverstehen Leseverstehen Schülerinnen';
            const lines = measureLines();

            // How tall the same text would be with the clamp lifted. This is the
            // control: it proves the text really does want more than the cap, so a
            // pass means the clamp bounded it rather than the text simply fitting.
            const clampProperty = style.webkitLineClamp;
            title.style.webkitLineClamp = 'none';
            const unclampedLines = measureLines();
            title.style.webkitLineClamp = '';

            return { maxLines, lines, unclampedLines, lineHeight, clampProperty };
        });

        expect(result.lineHeight).toBeGreaterThan(0);
        // The clamp must actually be declared — not merely inherited as `none`.
        expect(result.clampProperty).toBe(String(result.maxLines));
        // Control: without the clamp this text overflows the cap, so a pass below
        // means the clamp bounded it rather than the text happening to fit.
        expect(
            result.unclampedLines,
            'injected title must want more lines than the cap for this test to mean anything',
        ).toBeGreaterThan(result.maxLines);

        expect(
            result.lines,
            `title rendered ${result.lines} lines, cap is ${result.maxLines}`,
        ).toBeLessThanOrEqual(result.maxLines);
    });

    test('column minWidth floors at a given width do not depend on the width the table was built at', async ({
        page,
    }) => {
        // The EN class table is the right subject: it is dense enough that the sum
        // of its floors exceeds the holder at NARROW, so the floors actually bind
        // and a stale one shows up as horizontal scroll rather than being absorbed
        // by spare width.
        const openClassViewAt = async (width) => {
            await gotoApp(page, '/en/');
            await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
            await page.locator('#classViewButton').click();
            await page
                .locator('.tabulator .tabulator-header')
                .first()
                .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
            await page.waitForTimeout(SETTLE_MS * 2);
        };

        const readFloors = () =>
            page.evaluate(() => {
                const holder = document.querySelector('.tabulator .tabulator-tableholder');
                if (!holder) throw new Error('No Tabulator table holder found');

                const cols = [
                    ...document.querySelectorAll(
                        '.tabulator .tabulator-header .tabulator-col:not(.tabulator-col-group)',
                    ),
                ].filter((col) => col.getBoundingClientRect().width > 0);
                if (cols.length === 0) throw new Error('No laid-out leaf columns found');

                return {
                    rootFontSize: getComputedStyle(document.documentElement).fontSize,
                    columns: cols.length,
                    sumMinWidth: Math.round(
                        cols.reduce(
                            (acc, col) =>
                                acc + (Number.parseFloat(getComputedStyle(col).minWidth) || 0),
                            0,
                        ),
                    ),
                    overflowPx: holder.scrollWidth - holder.clientWidth,
                    byField: Object.fromEntries(
                        cols.map((col) => [
                            col.getAttribute('tabulator-field'),
                            Math.round(Number.parseFloat(getComputedStyle(col).minWidth) || 0),
                        ]),
                    ),
                };
            });

        // Build wide (floors measured at a large root font size), then narrow.
        await openClassViewAt(WIDE);
        const builtWide = await readFloors();
        await setViewport(page, NARROW);
        const wideThenNarrow = await readFloors();

        // Reference: the same view built fresh at NARROW, i.e. floors that were
        // never stale. This is the value the resized table has to agree with.
        await openClassViewAt(NARROW);
        const builtNarrow = await readFloors();

        // Sanity: the two build widths must really sit at different root font
        // sizes, or there is no staleness for this test to detect.
        expect(
            builtWide.rootFontSize,
            'WIDE and NARROW must fall on different root font sizes',
        ).not.toBe(builtNarrow.rootFontSize);
        expect(wideThenNarrow.rootFontSize).toBe(builtNarrow.rootFontSize);
        expect(wideThenNarrow.columns).toBe(builtNarrow.columns);
        // Sanity: the floors must actually bind here, otherwise spare width would
        // absorb a stale floor and the assertions below would prove nothing.
        expect(
            builtNarrow.overflowPx,
            'the table must be squeezed at NARROW for its floors to be observable',
        ).toBeGreaterThan(0);

        expect(wideThenNarrow.sumMinWidth).toBe(builtNarrow.sumMinWidth);
        // The user-visible consequence: stale floors drag a phantom horizontal
        // scrollbar into a table that should barely overflow.
        expect(wideThenNarrow.overflowPx).toBe(builtNarrow.overflowPx);

        // A header-derived floor must track the font size...
        const headerDerived = 'lastName';
        expect(
            builtWide.byField[headerDerived],
            `${headerDerived} is the header-derived floor this test tracks`,
        ).toBeGreaterThan(0);
        expect(builtWide.byField[headerDerived]).not.toBe(builtNarrow.byField[headerDerived]);

        // ...while a caller-supplied floor must not: the progress-bar columns pin
        // VISUAL_COLUMN_MIN_WIDTHS.progressBar (columnWidthConstants.js) because
        // their content is graphical and has nothing to do with the header text.
        // Re-deriving those from the title would silently shrink them.
        const PROGRESS_BAR_MIN_WIDTH = 104;
        for (const field of ['d0Percentages', 'd1Percentages']) {
            expect(builtNarrow.byField[field], `${field} must still be a column`).toBe(
                PROGRESS_BAR_MIN_WIDTH,
            );
            expect(builtWide.byField[field]).toBe(PROGRESS_BAR_MIN_WIDTH);
            expect(wideThenNarrow.byField[field]).toBe(PROGRESS_BAR_MIN_WIDTH);
        }
    });
});

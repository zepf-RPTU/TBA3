/**
 * E2E: the touch paths of the dashboards, driven by real taps.
 *
 * Runs on a `TABLET` context (see ./support/test.js). The touch behaviour lives
 * inside `@media (hover: none)` / `(pointer: coarse)` blocks, so a context that lost the
 * emulation fails the touch-gated tests below.
 */

import { test, expect, TABLET } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { cardOf, expectReportPlace, exportCart, reportCardFor } from './support/cart.js';
import {
    expandSidebar,
    openNotes,
    openReportWithTwoCards,
    openScatterplotFilter,
} from './support/nav.js';
import { waitForSettled } from './support/settle.js';
import { required } from '../../packages/modules/test/support/required.js';

test.use(TABLET);

/**
 * The fingertip floor, `--touch-target-min` in module-base's tokens.css: absolute,
 * because the root font-size is under 16px (responsive.css) and a rem-based
 * target would shrink with it.
 */
const TOUCH_TARGET_MIN_PX = 44;

/**
 * Rounded to a tenth before comparing: under mobile emulation the device pixel
 * ratio makes getBoundingClientRect report an exact 44px box as 43.99998.
 * @param {number} value
 * @returns {number}
 */
const round = (value) => Math.round(value * 10) / 10;

/**
 * The sidebar rail's rendered width. Read it through `expect.poll`: the width
 * transition (sidebarModule.css) runs longer than the labels' delayed fade, so a
 * single read right after an opacity assertion can land mid-transition.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
const railWidth = (page) =>
    page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);

/**
 * Dispatch one real touch event through CDP. Synthesised pointer events
 * (dispatchEvent()) bypass the browser's gesture arbitration, which `touch-action`
 * takes part in, so they pass with or without it.
 * @param {import('@playwright/test').CDPSession} cdp
 * @param {'touchStart'|'touchMove'|'touchEnd'} type
 * @param {{x: number, y: number}} point - Viewport position of the touch point.
 * @returns {Promise<object>} The CDP reply, sent once the page has handled the event.
 */
const touch = (cdp, type, point) =>
    cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [point],
    });

test.describe('report view on touch', () => {
    test('the card toolbar is usable without ever hovering', async ({ page }) => {
        await openReportWithTwoCards(page);
        const itemCard = reportCardFor(page, 'Ansicht Aufgaben');

        // Without a hovering pointer the toolbar is asked for by tapping the card.
        await itemCard.locator('.report-card-image').tap();

        // It must accept the tap, not only be painted: `opacity: 1` with
        // `pointer-events: none` looks identical.
        await expect(itemCard.locator('.report-card-toolbar')).toHaveCSS('pointer-events', 'auto');

        // Round-trip with no hover step: with the reveal gated wrongly, the image takes
        // the tap and the order never moves.
        await expectReportPlace(itemCard, 'last');
        await itemCard.locator('[data-report-card-action="up"]').tap();
        await expectReportPlace(itemCard, 'first');
        await itemCard.locator('[data-report-card-action="down"]').tap();
        await expectReportPlace(itemCard, 'last');

        // The drag handle sits behind the same gate, and has no keyboard fallback.
        await expect(itemCard.locator('.report-card-handle')).toHaveCSS('touch-action', 'none');
        await expect(itemCard.locator('.report-card-handle')).toBeVisible();
    });

    test('only the tapped card offers its toolbar', async ({ page }) => {
        // The toolbar is wider than a card and overhangs its neighbours, and its last
        // control removes a card from the report: with two live at once, a tap can
        // delete the wrong card.
        await openReportWithTwoCards(page);
        const itemCard = reportCardFor(page, 'Ansicht Aufgaben');
        const overviewCard = reportCardFor(page, 'Übersicht');

        await itemCard.locator('.report-card-image').tap();
        await expect(itemCard.locator('.report-card-toolbar')).toHaveCSS('pointer-events', 'auto');
        await expect(overviewCard.locator('.report-card-toolbar')).toHaveCSS(
            'pointer-events',
            'none',
        );

        // The exact inverse, so neither state is a coincidence of ordering.
        await overviewCard.locator('.report-card-image').tap();
        await expect(overviewCard.locator('.report-card-toolbar')).toHaveCSS(
            'pointer-events',
            'auto',
        );
        await expect(itemCard.locator('.report-card-toolbar')).toHaveCSS('pointer-events', 'none');
    });
});

test.describe('sidebar disclosure on touch', () => {
    test('a tap on the rail reveals the nav labels, a tap outside hides them', async ({ page }) => {
        await gotoApp(page, '/en/');

        const sidebar = page.locator('.sidebar');
        const navText = page.locator('.sidebar-nav-text').first();
        const logo = page.locator('.sidebar-logo');

        // Collapsed: the labels and the logo are painted but invisible.
        await expect(sidebar).not.toHaveClass(/\bis-expanded\b/);
        await expect(navText).toHaveCSS('opacity', '0');

        await page.locator('.sidebar-header').tap();

        await expect(sidebar).toHaveClass(/\bis-expanded\b/);
        await expect(navText).toHaveCSS('opacity', '1');
        await expect(logo).toHaveCSS('opacity', '1');
        // The rail widens too: the class alone would pass without the ungated
        // `.is-expanded` width rule.
        await expect.poll(() => railWidth(page)).toBeGreaterThan(200);

        await page.locator('.main-content').tap();
        await expect(sidebar).not.toHaveClass(/\bis-expanded\b/);
        await expect(navText).toHaveCSS('opacity', '0');
        await expect.poll(() => railWidth(page)).toBeLessThan(100);
    });

    test('a nav tap switches the view and closes the rail', async ({ page }) => {
        await gotoApp(page, '/en/');
        await expandSidebar(page);

        await page.locator('#itemViewButton').tap();

        await expect(page.locator('#itemViewButton')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('.sidebar')).not.toHaveClass(/\bis-expanded\b/);
        // Width, not just the class: the tapped button keeps focus, so a
        // `:focus-within` reveal would hold the 250px rail over the view.
        await expect(page.locator('.sidebar-nav-text').first()).toHaveCSS('opacity', '0');
        await expect.poll(() => railWidth(page)).toBeLessThan(100);
    });
});

test.describe('sidebar disclosure by keyboard', () => {
    test('tabbing into the rail expands it', async ({ page }) => {
        await gotoApp(page, '/en/');

        const navText = page.locator('.sidebar-nav-text').first();
        await expect(navText).toHaveCSS('opacity', '0');

        // The first sidebar nav button is the page's first focusable element.
        await page.locator('.sidebar-nav-button').first().focus();

        await expect(navText).toHaveCSS('opacity', '1');
        await expect.poll(() => railWidth(page)).toBeGreaterThan(200);
        // No class involved: :has(:focus-visible) is a pure CSS path and must stay
        // outside the (hover: hover) gate. `:focus-visible` rather than
        // `:focus-within`, so a clicked nav button does not hold the rail open.
        await expect(page.locator('.sidebar')).not.toHaveClass(/\bis-expanded\b/);
    });
});

test.describe('glossary popups on touch', () => {
    // SL's Überblick is the only landing view whose copy carries marked-up terms.
    test('a term opens on tap and the close button dismisses it', async ({ page }) => {
        await gotoApp(page, '/sl/');

        const term = page.locator('.glossary-term').first();
        await term.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        await expect(page.locator('.glossary-popup:popover-open')).toHaveCount(0);

        await term.tap();

        await expect(page.locator('.glossary-popup:popover-open')).toHaveCount(1);

        // A tablet has no Escape key and no cursor to move away, so the popup carries
        // its own way out.
        const close = page.locator('.glossary-popup:popover-open .glossary-popup-close');
        await expect(close).toBeVisible();
        const box = required(await close.boundingBox());
        expect(round(box.width)).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX);
        expect(round(box.height)).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX);

        await close.tap();
        await expect(page.locator('.glossary-popup:popover-open')).toHaveCount(0);
    });

    test('an icon-only button names itself on tap', async ({ page }) => {
        await gotoApp(page, '/en/');

        const iconButton = page.locator('.btn--icon[data-tooltip-text]').first();
        await iconButton.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const label = await iconButton.getAttribute('data-tooltip-text');
        expect(label).toBeTruthy();

        await iconButton.tap();

        const tooltip = page.locator('#tooltip-delegated');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText(required(label));
    });
});

test.describe('notes drawer on touch', () => {
    test('the resize grip claims the touch gesture', async ({ page }) => {
        await gotoApp(page, '/en/');
        await openNotes(page);

        // It uses setPointerCapture; without `touch-action: none` the browser pans the
        // page instead, and a pan fires pointercancel. The drag header has the same
        // need, proven by the real drag below.
        await expect(page.locator('.notes-drawer-resize-handle')).toHaveCSS('touch-action', 'none');
    });

    test('the drawer actually moves when dragged by a finger', async ({ page, context }) => {
        await gotoApp(page, '/en/');
        await openNotes(page);

        const drawer = page.locator('.notes-drawer:popover-open');
        const before = required(await drawer.boundingBox());
        // On the title: the header's buttons take no drag.
        const header = required(await page.locator('.notes-drawer-title').boundingBox());
        const x = header.x + header.width / 2;
        const y = header.y + header.height / 2;

        const cdp = await context.newCDPSession(page);
        await touch(cdp, 'touchStart', { x, y });
        await touch(cdp, 'touchMove', { x: x - 60, y: y + 40 });
        await touch(cdp, 'touchMove', { x: x - 120, y: y + 80 });
        await touch(cdp, 'touchEnd', { x: x - 120, y: y + 80 });

        const after = required(await drawer.boundingBox());
        expect(Math.round(after.x - before.x)).toBe(-120);
        expect(Math.round(after.y - before.y)).toBe(80);
    });
});

test.describe('coarse-pointer hit targets', () => {
    /** The controls a finger has to hit. */
    const TARGETS = [
        '.btn--icon',
        '.btn--size-control',
        '.sidebar-nav-button',
        '.sidebar-settings-trigger',
        '.notes-drawer-tab',
        '.notes-drawer-tab-add',
        '.notes-drawer-tab-rename',
        '.notes-drawer .notes-link-control>.btn',
        '.tabulator .tabulator-header .tabulator-col.tabulator-sortable',
    ];

    /**
     * Smallest rendered box per selector, or null when nothing is on screen.
     *
     * The page is settled first: `.btn:not(:disabled):active` scales to `--press-scale`
     * and eases back over `--motion-duration-fast` (module-base styles/buttons.css), so a
     * box read straight after the tap that opened the drawer is a couple of percent short
     * of the control's layout size and fails the floor.
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<Record<string, {w: number, h: number} | null>>}
     */
    const measure = async (page) => {
        await waitForSettled(page);

        return page.evaluate((selectors) => {
            /** @type {Record<string, {w: number, h: number} | null>} */
            const out = {};
            for (const selector of selectors) {
                const boxes = [...document.querySelectorAll(selector)]
                    .filter((el) => el.getClientRects().length > 0)
                    .map((el) => el.getBoundingClientRect());
                out[selector] = boxes.length
                    ? {
                          w: Math.min(...boxes.map((b) => b.width)),
                          h: Math.min(...boxes.map((b) => b.height)),
                      }
                    : null;
            }
            return out;
        }, TARGETS);
    };

    // Landscape only: portrait (820px) is below the 1024px shell minimum and shows
    // the same layout, scrolled sideways.
    test('every control clears 44px', async ({ page }) => {
        // The item view carries the tables, the drawer the densest cluster of controls,
        // and a ticked card brings up the export toolbar's buttons.
        await gotoApp(page, '/en/#item');
        await exportCart(page, { touch: true }).tick(cardOf(page.locator('#item-itemLollipop')));
        await openNotes(page);

        const sizes = await measure(page);
        const tooSmall = Object.entries(sizes)
            .filter(
                ([, box]) =>
                    box &&
                    (round(box.w) < TOUCH_TARGET_MIN_PX || round(box.h) < TOUCH_TARGET_MIN_PX),
            )
            .map(([sel, box]) => `${sel} ${round(required(box).w)}x${round(required(box).h)}`);
        expect(tooSmall).toEqual([]);

        // A selector that matches nothing would pass the check above.
        const missing = Object.entries(sizes)
            .filter(([, box]) => box === null)
            .map(([sel]) => sel);
        expect(missing).toEqual([]);
    });
});

test.describe('scatterplot marquee on touch', () => {
    test('the armed-mode toggle round-trips and gates touch-action with it', async ({ page }) => {
        await openScatterplotFilter(page);

        const toggle = page.locator('[data-scatterplot-filter-action="arm-selection"]');
        const chart = page.locator('.scatterplot-filter-chart svg.chart-root');

        // Off by default: an unarmed drag over the chart scrolls the page.
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(chart).not.toHaveClass(/\bselection-armed\b/);
        await expect(chart).toHaveCSS('touch-action', 'auto');

        await toggle.tap();

        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(chart).toHaveClass(/\bselection-armed\b/);
        await expect(chart).toHaveCSS('touch-action', 'none');

        await toggle.tap();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(chart).not.toHaveClass(/\bselection-armed\b/);
        await expect(chart).toHaveCSS('touch-action', 'auto');
    });

    test('a real touch drag selects only once armed', async ({ page, context }) => {
        await openScatterplotFilter(page);
        // The modal's open transition and the points' entry have run out, so the box
        // below is where the swipe lands.
        await page.locator('.scatterplot-filter-chart .student-point').first().waitFor();
        await waitForSettled(page);

        const box = required(
            await page.locator('.scatterplot-filter-chart svg.chart-root').boundingBox(),
        );
        const cdp = await context.newCDPSession(page);
        const swipe = async () => {
            /**
             * @param {number} fx - Fraction of the chart's width.
             * @param {number} fy - Fraction of the chart's height.
             * @returns {{x: number, y: number}} The viewport point.
             */
            const point = (fx, fy) => ({
                x: box.x + box.width * fx,
                y: box.y + box.height * fy,
            });
            await touch(cdp, 'touchStart', point(0.2, 0.2));
            await touch(cdp, 'touchMove', point(0.5, 0.5));
            await touch(cdp, 'touchMove', point(0.8, 0.8));
            await touch(cdp, 'touchEnd', point(0.8, 0.8));
        };
        const selected = page.locator('.student-point.selected');

        // CDP acknowledges a touch event only once the page has handled it, and the
        // marquee applies on pointerup, so a wrongly selecting drag has already marked
        // its points here.
        await swipe();
        expect(await selected.count()).toBe(0);

        await page.locator('[data-scatterplot-filter-action="arm-selection"]').tap();
        await swipe();

        await expect.poll(() => selected.count()).toBeGreaterThan(0);
    });

    test('the tap label leaves with the modal the tap closed', async ({ page }) => {
        await openScatterplotFilter(page);

        const tooltip = page.locator('#tooltip-delegated');

        // The button carries a description the tap shows. The overlay fades out over
        // 0.3s, so the label has to be dropped when that transition ends; otherwise it
        // hangs over the group view until the next tap.
        await page.locator('[data-scatterplot-filter-action="cancel"]').tap();

        await expect(page.locator('.scatterplot-filter-overlay[open]')).toHaveCount(0);
        await expect(tooltip).toBeHidden();
    });
});

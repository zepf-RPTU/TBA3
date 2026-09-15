/**
 * E2E: the touch paths of the dashboards, driven by real taps.
 *
 * Runs on the one context in the suite with `test.override('touchDevice', true)`
 * (see ./support/test.js). Every later assertion here depends on the first test:
 * the touch behaviour lives inside `@media (hover: none)` / `(pointer: coarse)`
 * blocks, and Chromium only reports those once the context is emulating a mobile
 * device — there is no `page.emulateMedia()` option for either feature. If the
 * modality probe fails, nothing else in this file means what it claims to.
 *
 * Viewport is iPad-landscape-sized: the dashboards' 1024px breakpoint is the
 * tablet tier the assessment targets.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';
import {
    openDashboard,
    openNotes,
    openReportWithTwoCards,
    openScatterplotFilter,
} from './support/nav.js';

test.override('touchDevice', true);
test.override('viewport', { width: 1180, height: 820 });

describe('touch modality', () => {
    test('emulates a coarse, hover-less pointer', async ({ page }) => {
        await gotoApp(page, '/en/');

        const modality = await page.evaluate(() => ({
            hoverNone: matchMedia('(hover: none)').matches,
            coarse: matchMedia('(pointer: coarse)').matches,
            anyHover: matchMedia('(any-hover: hover)').matches,
        }));

        expect(modality.hoverNone).toBe(true);
        expect(modality.coarse).toBe(true);
        // No hover-capable pointer at all: a hybrid device would report
        // `any-hover: hover` and keep the gated mouse affordances alive.
        expect(modality.anyHover).toBe(false);
    });

    test('dispatches taps as touch pointer events', async ({ page }) => {
        await gotoApp(page, '/en/');

        await page.evaluate(() => {
            globalThis.__seenPointerType = null;
            document.body.addEventListener(
                'pointerdown',
                (e) => {
                    globalThis.__seenPointerType = e.pointerType;
                },
                { capture: true },
            );
        });

        await page.locator('.sidebar-nav-button').first().tap();

        // The modality signal tooltipService keys off (Phase 3). A tap that
        // arrived as `mouse` would silently take every mouse path instead.
        expect(await page.evaluate(() => globalThis.__seenPointerType)).toBe('touch');
    });
});

describe('report view on touch', () => {
    const cardFor = (page, viewLabel) =>
        page
            .locator('.report-card')
            .filter({ has: page.locator('.report-card-meta', { hasText: viewLabel }) });

    test('the card toolbar is usable without ever hovering', async ({ page }) => {
        await openReportWithTwoCards(page);
        const itemCard = cardFor(page, 'Ansicht Aufgaben');

        // Without a hovering pointer the toolbar is asked for by tapping the card.
        await itemCard.locator('.report-card-image').tap();

        // It must accept the tap, not merely be painted: `opacity: 1` with
        // `pointer-events: none` looks identical and is still dead.
        await expect(itemCard.locator('.report-card-toolbar')).toHaveCSS('pointer-events', 'auto');

        // Round-trip on the real oracle. There is no hover step anywhere here —
        // that is the whole assertion: gate the reveal wrong and the image takes
        // the tap and the order never moves.
        await expect(itemCard).toHaveAttribute('data-report-order', '1');
        await itemCard.locator('[data-report-card-action="up"]').tap();
        await expect(itemCard).toHaveAttribute('data-report-order', '0');
        await itemCard.locator('[data-report-card-action="down"]').tap();
        await expect(itemCard).toHaveAttribute('data-report-order', '1');

        // The drag handle lives in the same toolbar and was dead for the same
        // reason; it is the control with no keyboard fallback at all.
        await expect(itemCard.locator('.report-card-handle')).toHaveCSS('touch-action', 'none');
        await expect(itemCard.locator('.report-card-handle')).toBeVisible();
    });

    test('only the tapped card offers its toolbar', async ({ page }) => {
        // The toolbar is far wider than a card and overhangs its neighbours, and
        // its last control removes a card from the report — so two live at once
        // means a tap can delete the wrong card. Exactly one may be hit-testable.
        await openReportWithTwoCards(page);
        const itemCard = cardFor(page, 'Ansicht Aufgaben');
        const overviewCard = cardFor(page, 'Übersicht');

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

describe('sidebar disclosure on touch', () => {
    test('a tap on the rail reveals the nav labels, a tap outside hides them', async ({ page }) => {
        await gotoApp(page, '/en/');

        const sidebar = page.locator('.sidebar');
        const navText = page.locator('.sidebar-nav-text').first();
        const heading = page.locator('.sidebar-title');

        // Collapsed: the labels and the page's only <h1> are painted but invisible.
        await expect(sidebar).not.toHaveClass(/\bis-expanded\b/);
        await expect(navText).toHaveCSS('opacity', '0');

        await page.locator('.sidebar-header').tap();

        await expect(sidebar).toHaveClass(/\bis-expanded\b/);
        await expect(navText).toHaveCSS('opacity', '1');
        await expect(heading).toHaveCSS('opacity', '1');
        // The rail actually widens — the class alone would be decorative if the
        // ungated `.is-expanded` width rule were missing.
        expect((await sidebar.boundingBox()).width).toBeGreaterThan(200);

        // Round-trip to the exact starting state.
        await page.locator('.main-content').tap();
        await expect(sidebar).not.toHaveClass(/\bis-expanded\b/);
        await expect(navText).toHaveCSS('opacity', '0');
        expect((await sidebar.boundingBox()).width).toBeLessThan(100);
    });

    test('the settings section is readable once the rail is tapped open', async ({ page }) => {
        await gotoApp(page, '/en/');

        const settingsText = page.locator('.sidebar-settings-text').first();
        await expect(settingsText).toHaveCSS('opacity', '0');

        // Tapping the settings block's own surface (not one of its radio
        // buttons) is what a user reaching for a theme does first.
        await page.locator('.sidebar-settings-title').first().tap();

        await expect(page.locator('.sidebar')).toHaveClass(/\bis-expanded\b/);
        await expect(settingsText).toHaveCSS('opacity', '1');
    });

    test('a nav tap switches the view and closes the rail', async ({ page }) => {
        await gotoApp(page, '/en/');

        await page.locator('.sidebar-header').tap();
        await expect(page.locator('.sidebar')).toHaveClass(/\bis-expanded\b/);

        await page.locator('#itemViewButton').tap();

        await expect(page.locator('#itemViewButton')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('.sidebar')).not.toHaveClass(/\bis-expanded\b/);
        // Width, not just the class: the tapped button keeps focus, so a
        // `:focus-within` reveal would hold the 250px rail over the view the tap
        // just switched to and the class assertion alone would not notice.
        // The opacity assertion first — it outlasts the width transition (0.3s
        // against 0.3s + 0.1s delay), so the box below is never read mid-collapse.
        await expect(page.locator('.sidebar-nav-text').first()).toHaveCSS('opacity', '0');
        expect((await page.locator('.sidebar').boundingBox()).width).toBeLessThan(100);
    });
});

describe('sidebar disclosure by keyboard', () => {
    // The keyboard half of the rail disclosure: the same disclosure, reached by Tab
    // rather than by pointer. Runs in this file because it shares the restructured
    // selector groups; the mouse path is covered by sidebar-active-view.spec.js.
    test('tabbing into the rail expands it', async ({ page }) => {
        await gotoApp(page, '/en/');

        const navText = page.locator('.sidebar-nav-text').first();
        await expect(navText).toHaveCSS('opacity', '0');

        // The first sidebar nav button is the page's first focusable element.
        await page.locator('.sidebar-nav-button').first().focus();

        await expect(navText).toHaveCSS('opacity', '1');
        expect((await page.locator('.sidebar').boundingBox()).width).toBeGreaterThan(200);
        // No class involved: :has(:focus-visible) is a pure CSS path and must
        // stay outside the (hover: hover) gate. `:focus-visible` rather than
        // `:focus-within`, so a *clicked* nav button does not hold the rail open.
        await expect(page.locator('.sidebar')).not.toHaveClass(/\bis-expanded\b/);
    });
});

describe('glossary popups on touch', () => {
    // SL's welcome view is where the annotator actually marks terms up: EN and MA
    // carry none on their landing views.
    test('a term opens on tap and the close button dismisses it', async ({ page }) => {
        await gotoApp(page, '/sl/');

        const term = page.locator('.glossary-term').first();
        await term.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        await expect(page.locator('.glossary-popup.visible')).toHaveCount(0);

        await term.tap();

        // Opens on the tap itself — no 500 ms hover delay to sit through.
        await expect(page.locator('.glossary-popup.visible')).toHaveCount(1);

        // A tablet has no Escape key and no cursor to move away, so the popup
        // has to carry its own way out.
        const close = page.locator('.glossary-popup.visible .glossary-popup-close');
        await expect(close).toBeVisible();
        const box = await close.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(40);

        await close.tap();
        await expect(page.locator('.glossary-popup.visible')).toHaveCount(0);
    });

    test('an icon-only button names itself on tap', async ({ page }) => {
        await gotoApp(page, '/en/');

        const iconButton = page.locator('.btn--icon[data-tooltip-text]').first();
        await iconButton.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const label = await iconButton.getAttribute('data-tooltip-text');
        expect(label).toBeTruthy();

        await iconButton.tap();

        // The tooltip *is* the button's name: without it a touch user has no way
        // to learn what an icon-only control does.
        const tooltip = page.locator('#tooltip-delegated');
        await expect(tooltip).toHaveClass(/\bvisible\b/);
        await expect(tooltip).toContainText(label);
    });
});

describe('notes drawer on touch', () => {
    test('the drag header and resize grip claim the touch gesture', async ({ page }) => {
        await openDashboard(page);
        await openNotes(page);

        // Both already use setPointerCapture; `touch-action: none` is the whole
        // difference between a drag and the browser panning the page instead —
        // and a pan fires pointercancel, so the drawer simply never moves.
        await expect(page.locator('.notes-drawer-header')).toHaveCSS('touch-action', 'none');
        await expect(page.locator('.notes-drawer-resize-handle')).toHaveCSS('touch-action', 'none');
    });

    test('the drawer actually moves when dragged by a finger', async ({ page, context }) => {
        await openDashboard(page);
        await openNotes(page);

        const drawer = page.locator('.notes-drawer.visible');
        const before = await drawer.boundingBox();
        const header = await page.locator('.notes-drawer-header').boundingBox();
        const x = header.x + header.width / 2;
        const y = header.y + 10;

        // A real touch gesture through CDP, not synthesised pointer events:
        // dispatchEvent() bypasses the browser's gesture arbitration entirely, so
        // it would pass with or without `touch-action` and prove nothing.
        const cdp = await context.newCDPSession(page);
        const touch = (type, tx, ty) =>
            cdp.send('Input.dispatchTouchEvent', {
                type,
                touchPoints: type === 'touchEnd' ? [] : [{ x: tx, y: ty }],
            });
        await touch('touchStart', x, y);
        await touch('touchMove', x - 60, y + 40);
        await touch('touchMove', x - 120, y + 80);
        await touch('touchEnd', x - 120, y + 80);

        const after = await drawer.boundingBox();
        expect(Math.round(after.x - before.x)).toBe(-120);
        expect(Math.round(after.y - before.y)).toBe(80);
    });

    test('the rename pencil is offered instead of a double-tap', async ({ page }) => {
        await openDashboard(page);
        await openNotes(page);

        const pencil = page.locator('.notes-drawer-tab-rename');
        await expect(pencil).toBeVisible();

        await pencil.tap();

        const input = page.locator('.notes-drawer-tab-input');
        await expect(input).toBeVisible();
        await input.fill('Elternabend');
        await input.press('Enter');

        // Round-trip back to the starting label, so the assertion cannot pass on
        // a tab that merely re-rendered.
        const tab = page.locator('.notes-drawer-tab').first();
        await expect(tab).toHaveText('Elternabend');
        await page.locator('.notes-drawer-tab-rename').tap();
        await page.locator('.notes-drawer-tab-input').fill('');
        await page.locator('.notes-drawer-tab-input').press('Enter');
        await expect(tab).toHaveText('1');
    });
});

describe('coarse-pointer hit targets', () => {
    /**
     * The controls a finger has to hit, and where they live. The floor is 44px,
     * the figure `--touch-target-min` carries; note it is deliberately absolute,
     * because the root font-size is fluid with the viewport (responsive.css) and
     * a rem-based target shrinks exactly where a tablet needs it most.
     */
    const TARGETS = [
        '.btn--icon',
        '.btn--size-control',
        '.sidebar-nav-button',
        '.sidebar-settings-option',
        '.notes-drawer-tab',
        '.notes-drawer-tab-add',
        '.notes-drawer-tab-rename',
        '.notes-drawer .notes-link-control>.btn',
        '.tabulator .tabulator-header .tabulator-col.tabulator-sortable',
    ];

    /**
     * Smallest rendered box per selector, or null when nothing is on screen.
     *
     * The press transition is waited out first: `.btn:not(:disabled):active` scales to
     * `--press-scale` and eases back over `--interactive-transition-duration`
     * (foundation/buttons.css), so a box read straight after the tap that opened the
     * drawer is a couple of percent short of the control's layout size — the notes
     * toggle measured 43.87 of its 44px that way, which fails the 44px floor it in
     * fact clears. Settling takes rounds rather than one await: the press runs one
     * transition down to `--press-scale` and the release starts a second one back up,
     * so a single `finished` lands mid-way through the return.
     */
    const measure = async (page) => {
        await page.evaluate(async (selectors) => {
            const running = () =>
                selectors
                    .flatMap((selector) => [...document.querySelectorAll(selector)])
                    .flatMap((el) => el.getAnimations());
            // Bounded, and each wait is capped: a control that animates forever must
            // fail on its box, not hang the spec.
            for (let round = 0; round < 10; round += 1) {
                const pending = running();
                if (!pending.length) return;
                await Promise.all(
                    pending.map((animation) =>
                        Promise.race([
                            animation.finished.catch(() => {}),
                            new Promise((resolve) => setTimeout(resolve, 500)),
                        ]),
                    ),
                );
            }
        }, TARGETS);

        return page.evaluate((selectors) => {
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

    test('the report toolbar buttons clear 44px', async ({ page }) => {
        await gotoApp(page, '/en/#report');
        await page.locator('.report-zoom .btn').first().waitFor({ state: 'visible' });
        const sizes = await measure(page);
        const round = (value) => Math.round(value * 10) / 10;
        expect(round(sizes['.btn--size-control'].h)).toBeGreaterThanOrEqual(44);
    });

    for (const viewport of [
        { width: 1180, height: 820, name: 'landscape' },
        { width: 820, height: 1180, name: 'portrait' },
    ]) {
        test(`every control clears 44px in ${viewport.name}`, async ({ page }) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await gotoApp(page, '/en/');

            // The item view carries the tables; the drawer carries the densest
            // cluster in the app.
            await page.locator('#itemViewButton').tap();
            await page.locator('.tabulator .tabulator-header').first().waitFor({
                state: 'visible',
                timeout: LOAD_TIMEOUT,
            });
            await page.locator('[data-header-action-button="notes-toggle"]').tap();
            await page.waitForSelector('.notes-drawer.visible', { timeout: LOAD_TIMEOUT });

            const sizes = await measure(page);

            // Rounded to a tenth before comparing: under mobile emulation the
            // device pixel ratio makes getBoundingClientRect report an exact
            // 44px box as 43.99998, which is a measurement artefact rather than
            // a control anyone could miss.
            const round = (value) => Math.round(value * 10) / 10;
            const tooSmall = Object.entries(sizes)
                .filter(([, box]) => box && (round(box.w) < 44 || round(box.h) < 44))
                .map(([sel, box]) => `${sel} ${round(box.w)}x${round(box.h)}`);
            expect(tooSmall).toEqual([]);

            // Guard the guard: a selector that matches nothing would pass the
            // check above silently.
            const missing = Object.entries(sizes)
                .filter(([, box]) => box === null)
                .map(([sel]) => sel);
            expect(missing).toEqual([]);
        });
    }
});

describe('scatterplot marquee on touch', () => {
    test('the armed-mode toggle round-trips and gates touch-action with it', async ({ page }) => {
        await openDashboard(page);
        await openScatterplotFilter(page);

        const toggle = page.locator('[data-scatterplot-filter-action="arm-selection"]');
        const chart = page.locator('.scatterplot-filter-chart svg');

        // Off by default: an unarmed drag over the chart has to scroll the page,
        // which is what a finger usually means.
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(chart).not.toHaveClass(/\bselection-armed\b/);
        await expect(chart).toHaveCSS('touch-action', 'auto');

        await toggle.tap();

        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(chart).toHaveClass(/\bselection-armed\b/);
        await expect(chart).toHaveCSS('touch-action', 'none');

        // Round-trip to the exact starting state.
        await toggle.tap();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(chart).not.toHaveClass(/\bselection-armed\b/);
        await expect(chart).toHaveCSS('touch-action', 'auto');
    });

    test('a real touch drag selects only once armed', async ({ page, context }) => {
        await openDashboard(page);
        await openScatterplotFilter(page);
        await page.waitForTimeout(1200);

        const box = await page.locator('.scatterplot-filter-chart svg').boundingBox();
        const cdp = await context.newCDPSession(page);
        // A real gesture, not synthesised pointer events: only this goes through
        // the arbitration that `touch-action` participates in.
        const swipe = async () => {
            const point = (fx, fy) => ({
                x: box.x + box.width * fx,
                y: box.y + box.height * fy,
            });
            const send = (type, p) =>
                cdp.send('Input.dispatchTouchEvent', {
                    type,
                    touchPoints: type === 'touchEnd' ? [] : [p],
                });
            await send('touchStart', point(0.2, 0.2));
            await send('touchMove', point(0.5, 0.5));
            await send('touchMove', point(0.8, 0.8));
            await send('touchEnd', point(0.8, 0.8));
            await page.waitForTimeout(300);
        };

        await swipe();
        expect(await page.locator('.student-point.selected').count()).toBe(0);

        await page.locator('[data-scatterplot-filter-action="arm-selection"]').tap();
        await swipe();

        expect(await page.locator('.student-point.selected').count()).toBeGreaterThan(0);
    });

    test('every sidebar label comes from the glossary', async ({ page }) => {
        await openDashboard(page);
        await openScatterplotFilter(page);

        const labels = await page.$$eval('.scatterplot-filter-sidebar > .btn', (els) =>
            els.map((e) => e.textContent.trim()),
        );

        expect(labels).toEqual([
            'Alle auswählen',
            'Auswahl aufheben',
            'Auswahlmodus',
            'Auswahl bestätigen',
            'Abbrechen',
        ]);
        // getRequiredEntryText renders this rather than an empty string when a
        // path does not resolve, so a broken key is visible instead of silent.
        expect(labels.join(' ')).not.toContain('Missing glossary entry');
    });

    test('the tap label leaves with the modal the tap closed', async ({ page }) => {
        await openDashboard(page);
        await openScatterplotFilter(page);

        const tooltip = page.locator('#tooltip-delegated');

        // Every use of this modal ends on one of these two buttons, and each now
        // carries a description the tap shows. The overlay fades out over 0.3s, so
        // the label has to be dropped when that transition ends, not one frame in —
        // otherwise it hangs over the class view until the next tap anywhere.
        await page.locator('[data-scatterplot-filter-action="cancel"]').tap();

        await expect(page.locator('.scatterplot-filter-overlay.visible')).toHaveCount(0);
        await expect(tooltip).not.toHaveClass(/\bvisible\b/);
    });
});

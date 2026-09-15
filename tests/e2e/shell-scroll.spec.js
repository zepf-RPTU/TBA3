/**
 * E2E test: the app shell is a fixed, non-scrolling viewport.
 *
 * WHY this matters (not just "the numbers happen to be zero"): the shell has no
 * scrollbar by design — `html`/`body` are sized to the viewport and clipped
 * (src/styles/foundation/layout-reset.css), and every scrollable region is an
 * inner container (`.view-base`, `.content-module-body`). So if the *viewport*
 * ever scrolls, the user is stranded: the view header disappears above the fold
 * and there is no scrollbar to scroll back, and the browser restores that offset
 * on reload.
 *
 * That is exactly what happened: `.tooltip` / `.glossary-popup` are appended to
 * `<body>` and hidden with `visibility` (not `display`), so with `auto` insets
 * they were laid out at their static position below the 100vh body box and made
 * the page taller than the viewport. `scrollIntoView({ block: 'center' })` — the
 * EN guided tour, the notes module-link chips — then scrolled into that gap.
 *
 * Each check therefore *attempts* to scroll the viewport before asserting. A
 * document that merely happens to sit at scrollY 0 is not good enough; the
 * viewport must be unable to scroll at all.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const DASHBOARDS = [
    { name: 'EN', path: '/en/' },
    { name: 'MA', path: '/ma/' },
    { name: 'SL', path: '/sl/' },
];

/**
 * Try to scroll the viewport, then assert it did not move and that nothing sticks
 * out below the fold.
 * @param {import('playwright').Page} page
 * @param {string} label - What was just done, for the failure message
 */
async function expectViewportCannotScroll(page, label) {
    const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        // Name the culprits before scrolling — a scroll moves them back into view.
        const offenders = Array.from(document.body.children)
            // 2px of slack: `height: 100%` chrome (the sidebar) ends exactly at the
            // fold and can land a subpixel past it.
            .filter((el) => el.getBoundingClientRect().bottom > window.innerHeight + 2)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className || '(no class)'}`);

        window.scrollTo(0, 10_000);
        return {
            offenders,
            scrollY: window.scrollY,
            overflow: root.scrollHeight - root.clientHeight,
        };
    });

    const detail =
        `after ${label} — body children below the fold: ` +
        (metrics.offenders.join(', ') || 'none');

    expect(metrics.scrollY, `viewport scrolled ${detail}`).toBe(0);
    expect(metrics.overflow, `page is taller than the viewport ${detail}`).toBeLessThanOrEqual(0);
}

for (const dashboard of DASHBOARDS) {
    describe(`${dashboard.name} shell – viewport never scrolls`, () => {
        test('stays unscrollable on load and through every view', async ({ page }) => {
            await gotoApp(page, dashboard.path);

            await expectViewportCannotScroll(page, 'load');

            const buttonIds = await page.$$eval('.sidebar-nav-button', (els) =>
                els.map((el) => el.id),
            );
            expect(buttonIds.length).toBeGreaterThan(1);

            for (const id of buttonIds) {
                await page.locator(`#${id}`).click();
                // The view header re-renders per view; wait for it before measuring.
                await page.waitForSelector('.header-module', { timeout: LOAD_TIMEOUT });
                await page.waitForTimeout(300);
                await expectViewportCannotScroll(page, `switching to #${id}`);
            }
        });
    });
}

describe('EN guided tour – does not strand the shell scrolled', () => {
    test('stepping through the class-view tour leaves the viewport at the top', async ({
        page,
    }) => {
        await gotoApp(page, '/en/');

        await page.locator('#classViewButton').click();

        // The info button belongs to the shared header, which renders in
        // beforeShowView() — i.e. before the view it heads. It is therefore
        // clickable while the class view is still covered, and
        // BaseAppModule#handleInfoToggled deliberately refuses to start a tour in
        // that window (steps derive from registered modules, and a view at
        // visibility: hidden would be spotlighted where the user cannot see it).
        // So wait the view out first, exactly as tests/e2e/tour.spec.js does:
        // its first module shell must exist, and its render cover must be gone.
        await page.waitForSelector('#en-class-container .module-container', {
            timeout: LOAD_TIMEOUT,
        });
        await page.waitForSelector('#en-class-container[data-view-rendering]', {
            state: 'detached',
            timeout: LOAD_TIMEOUT,
        });

        // The header info button starts the tour (BaseAppModule#handleInfoToggled).
        const infoButton = page.locator('[data-header-action-button="tour-start"]');
        await infoButton.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await infoButton.click();

        // TutorialController labels this button 'Weiter', or 'Fertig' on the last step.
        const nextButton = page.locator('.tutorial-tour-next');
        await nextButton.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // Every step calls anchor.scrollIntoView({ block: 'center' }) — the trigger
        // that used to scroll the whole shell out of view.
        for (let step = 0; step < 10; step += 1) {
            await expectViewportCannotScroll(page, `tour step ${step}`);
            if (!(await nextButton.isVisible())) break;
            const isLast = (await nextButton.textContent())?.includes('Fertig');
            await nextButton.click();
            await page.waitForTimeout(400);
            if (isLast) break;
        }

        await expectViewportCannotScroll(page, 'closing the tour');
    });
});

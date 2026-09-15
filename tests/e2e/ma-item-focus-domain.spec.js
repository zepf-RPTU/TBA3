/**
 * E2E test: MA item view focus chart updates on domain selection (reactive setState).
 *
 * Regression guard for the P2/B migration that converted TaskRingFocusChart from
 * direct chartState mutation + refresh to reactive setState: the config's onUpdate
 * pushes the new slice via setState, and the chart's _onStateChanged syncs the
 * changed keys into chartState and re-renders. The focus chart stays
 * view-orchestrated (the view legitimately combines domain + selectedStudents +
 * layout lifecycle), so this verifies the reactive mechanism end to end.
 *
 * In chart-only layout mode the task ring grid shows clickable domain rings;
 * selecting a different domain must update the focus chart.
 */

import { test, expect, describe } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT } from './support/app.js';

const UPDATE_TIMEOUT = 5_000;

const FOCUS = '#ma-item-focus';
const CHART_ONLY_GRID = '#ma-item-taskRing-chartOnly';

describe('MA item view – focus chart reacts to domain selection (reactive setState)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/ma/');
    });

    test('selecting a different domain ring updates the focus chart', async ({ page }) => {
        await clickNav(page, '#itemViewButton');

        // Switch to chart-only layout mode (shows the grid + focus chart)
        const chartOnlyBtn = page.locator(
            '[data-mode-switch-button="true"][data-mode="chart-only"]',
        );
        await chartOnlyBtn.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await chartOnlyBtn.click();

        // Focus chart renders for the default domain — verifies the reactive
        // chart's construction + initial render (getInitialState + state sync).
        const focusSvg = page.locator(`${FOCUS} svg`).first();
        await focusSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // The focus host's title *is* the selected domain's label — taskRingFocusConfig
        // sets it via host.setTitle(domain.domainLabel). That makes the title the
        // oracle for "which domain is in focus", rather than "the markup changed",
        // which would also pass if the chart re-rendered the wrong domain.
        // ContentModule transfers the container id onto its body div, so #ma-item-focus
        // is the *body* and the title is its sibling inside the .module-container.
        const focusModule = page.locator('.module-container', { has: page.locator(FOCUS) });
        const focusTitle = focusModule.locator('.content-module-title');
        const titleBefore = (await focusTitle.textContent())?.trim();
        expect(titleBefore).toBeTruthy();

        const selectedRing = page.locator(
            `${CHART_ONLY_GRID} .task-ring-chart-item--selectable.selected`,
        );
        await expect(selectedRing).toHaveCount(1);
        const originalDomain = await selectedRing.getAttribute('data-domain');

        // Click a domain ring that is NOT the currently selected one (and not the
        // 'overall' ring). This fires the host's onDomainSelected option.
        const otherDomain = page
            .locator(
                `${CHART_ONLY_GRID} .task-ring-chart-item--selectable[data-domain]:not(.selected):not([data-domain="overall"])`,
            )
            .first();
        await otherDomain.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const targetDomain = await otherDomain.getAttribute('data-domain');
        await otherDomain.click();

        // Selection state must move to the clicked ring, and only that ring.
        await expect(selectedRing).toHaveCount(1, { timeout: UPDATE_TIMEOUT });
        await expect(selectedRing).toHaveAttribute('data-domain', targetDomain);

        // ...and the focus chart must follow it.
        await expect
            .poll(async () => (await focusTitle.textContent())?.trim(), { timeout: UPDATE_TIMEOUT })
            .not.toBe(titleBefore);
        const targetTitle = (await focusTitle.textContent())?.trim();
        expect(targetTitle).toBeTruthy();

        // Round-trip back to the original domain. This is what pins the title to the
        // *specific* domain rather than merely to "something changed": if the focus
        // chart rendered an arbitrary domain, the title would not come back to the
        // exact value it started at.
        await page
            .locator(
                `${CHART_ONLY_GRID} .task-ring-chart-item--selectable[data-domain="${originalDomain}"]`,
            )
            .click();

        await expect(selectedRing).toHaveAttribute('data-domain', originalDomain, {
            timeout: UPDATE_TIMEOUT,
        });
        await expect
            .poll(async () => (await focusTitle.textContent())?.trim(), { timeout: UPDATE_TIMEOUT })
            .toBe(titleBefore);

        await expect(focusSvg).toBeVisible();
    });
});

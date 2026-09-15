/**
 * E2E test: MA item/student layout modes are CSS-owned.
 *
 * The split-view base toggles a layout-mode-* class on the content wrapper.
 * Visibility for the left table column, right chart column, and chart-only
 * panel must come from CSS, including after a view hide/show cycle.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, clickNav, LOAD_TIMEOUT } from './support/app.js';

const UPDATE_TIMEOUT = 5_000;

const VIEWS = [
    {
        name: 'item',
        button: '#itemViewButton',
        content: '.item-view-content',
        awayButton: '#overviewViewButton',
        awayContent: '.ma-overview-view',
    },
    {
        name: 'student',
        button: '#studentViewButton',
        content: '.student-view-content',
        awayButton: '#overviewViewButton',
        awayContent: '.ma-overview-view',
    },
];

const MODES = [
    {
        mode: 'both',
        display: { left: 'flex', right: 'flex', chartOnly: 'none' },
    },
    {
        mode: 'table-only',
        display: { left: 'flex', right: 'none', chartOnly: 'none' },
    },
    {
        mode: 'chart-only',
        display: { left: 'none', right: 'none', chartOnly: 'grid' },
    },
];

const modeButton = (page, mode) =>
    page.locator(`[data-mode-switch-button][data-mode="${mode}"]`).first();

async function openView(page, view) {
    await clickNav(page, view.button);
    await expect(page.locator(view.content)).toBeVisible({ timeout: LOAD_TIMEOUT });
}

async function selectMode(page, mode) {
    const button = modeButton(page, mode);
    await button.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

    if (!(await button.isDisabled())) {
        await button.click();
    }

    // The selected mode is advertised to assistive tech, not only dimmed.
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: UPDATE_TIMEOUT });
    for (const other of MODES) {
        if (other.mode !== mode) {
            await expect(modeButton(page, other.mode)).toHaveAttribute('aria-pressed', 'false');
        }
    }
}

async function readLayoutState(page, contentSelector) {
    return page.locator(contentSelector).evaluate((content) => {
        const readElement = (selector) => {
            const element = content.querySelector(selector);
            if (!element) {
                return { computed: `MISSING: ${selector}`, inline: `MISSING: ${selector}` };
            }
            const style = window.getComputedStyle(element);
            return {
                computed: style.display,
                inline: element.style.display,
            };
        };

        return {
            modeClasses: Array.from(content.classList).filter((className) =>
                className.startsWith('layout-mode-'),
            ),
            left: readElement('.left-column'),
            right: readElement('.right-column'),
            chartOnly: readElement('.ma-chart-only-content'),
        };
    });
}

async function expectLayoutMode(page, view, modeCase) {
    await expect
        .poll(
            async () => {
                const state = await readLayoutState(page, view.content);
                return {
                    modeClasses: state.modeClasses,
                    display: {
                        left: state.left.computed,
                        right: state.right.computed,
                        chartOnly: state.chartOnly.computed,
                    },
                };
            },
            { timeout: UPDATE_TIMEOUT },
        )
        .toEqual({
            modeClasses: [`layout-mode-${modeCase.mode}`],
            display: modeCase.display,
        });

    const state = await readLayoutState(page, view.content);
    expect({
        left: state.left.inline,
        right: state.right.inline,
        chartOnly: state.chartOnly.inline,
    }).toEqual({ left: '', right: '', chartOnly: '' });
}

describe('MA layout modes', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/ma/');
    });

    for (const view of VIEWS) {
        test(`${view.name} view computes each layout mode from CSS`, async ({ page }) => {
            await openView(page, view);

            for (const modeCase of MODES) {
                await selectMode(page, modeCase.mode);
                await expectLayoutMode(page, view, modeCase);
            }
        });

        test(`${view.name} view keeps layout mode after hide/show`, async ({ page }) => {
            await openView(page, view);

            for (const modeCase of MODES) {
                await selectMode(page, modeCase.mode);
                await page.locator(view.awayButton).click();
                await expect(page.locator(view.awayContent)).toBeVisible({ timeout: LOAD_TIMEOUT });
                await openView(page, view);
                await expectLayoutMode(page, view, modeCase);
            }
        });
    }
});

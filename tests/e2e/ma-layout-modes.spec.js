/**
 * E2E test: MA item/student layout modes are CSS-owned.
 *
 * The split-view base toggles a layout-mode-* class on the content wrapper.
 * Visibility for the left table column, right chart column, and chart-only
 * panel must come from CSS, including after a view hide/show cycle.
 */

import { test, expect } from './support/test.js';
import { gotoApp, clickNav, LOAD_TIMEOUT_MS } from './support/app.js';
import { modeButton, selectMode } from './support/modes.js';
import { openView } from './support/nav.js';

/**
 * @typedef {object} SplitView
 * @property {string} name - The view's key: its hash route and its name in the test titles.
 * @property {string} button - Its nav button.
 * @property {string} content - Its split-view content wrapper.
 */

/**
 * @typedef {object} LayoutModeCase
 * @property {string} mode - The layout mode's `data-mode`.
 * @property {{left: string, right: string, chartOnly: string}} display - Each column's computed `display`.
 */

/** The view each split view is left for and reopened from: its nav button and its root. */
const AWAY_BUTTON = '#overviewViewButton';
const AWAY_CONTENT = '.ma-overview-view';

/** @type {SplitView[]} */
const VIEWS = [
    {
        name: 'item',
        button: '#itemViewButton',
        content: '.item-view-content',
    },
    {
        name: 'student',
        button: '#studentViewButton',
        content: '.student-view-content',
    },
];

/** @type {LayoutModeCase[]} */
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

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} mode - The layout mode's `data-mode`.
 */
async function selectLayoutMode(page, mode) {
    await selectMode(page, mode);

    // The selected mode is advertised to assistive tech, not only dimmed.
    await expect(modeButton(page, mode)).toHaveAttribute('aria-pressed', 'true');
    for (const other of MODES) {
        if (other.mode !== mode) {
            await expect(modeButton(page, other.mode)).toHaveAttribute('aria-pressed', 'false');
        }
    }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} contentSelector - The split-view content wrapper.
 */
async function readLayoutState(page, contentSelector) {
    return page.locator(contentSelector).evaluate((content) => {
        /**
         * @param {string} selector - A column inside the wrapper.
         * @returns {string} Its computed `display`, or a marker when it is missing.
         */
        const readElement = (selector) => {
            const element = content.querySelector(selector);
            return element ? window.getComputedStyle(element).display : `MISSING: ${selector}`;
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

/**
 * @param {import('@playwright/test').Page} page
 * @param {SplitView} view - The open view.
 * @param {LayoutModeCase} modeCase - The expected mode and column displays.
 */
async function expectLayoutMode(page, view, modeCase) {
    await expect
        .poll(async () => {
            const { modeClasses, left, right, chartOnly } = await readLayoutState(
                page,
                view.content,
            );
            return { modeClasses, display: { left, right, chartOnly } };
        })
        .toEqual({
            modeClasses: [`layout-mode-${modeCase.mode}`],
            display: modeCase.display,
        });
}

test.describe('MA layout modes', () => {
    for (const view of VIEWS) {
        test(`${view.name} view computes each layout mode from CSS and keeps it after hide/show`, async ({
            page,
        }) => {
            await gotoApp(page, `/ma/#${view.name}`);

            for (const modeCase of MODES) {
                await selectLayoutMode(page, modeCase.mode);
                await expectLayoutMode(page, view, modeCase);
                await clickNav(page, AWAY_BUTTON);
                await expect(page.locator(AWAY_CONTENT)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
                await openView(page, view);
                await expectLayoutMode(page, view, modeCase);
            }
        });
    }
});

test.describe('MA item table columns', () => {
    test('show the competence columns, after the result and Leitidee columns, in table-only mode alone', async ({
        page,
    }) => {
        await gotoApp(page, '/ma/#item');
        const header = page.locator('#ma-item-table .tabulator-header');
        /** @returns {Promise<string[]>} The fields of the shown header columns, in order. */
        const shownFields = () =>
            header
                .locator('.tabulator-col[tabulator-field]:visible')
                .evaluateAll((cols) =>
                    cols.map((col) => col.getAttribute('tabulator-field') ?? ''),
                );

        await selectLayoutMode(page, 'both');
        await expect
            .poll(shownFields)
            .toEqual([
                'name',
                'exerciseName',
                'competenceLevel',
                'percentageCombined',
                'pilotSolutionFrequency',
                'domainLabel',
            ]);

        await selectLayoutMode(page, 'table-only');
        await expect
            .poll(async () => (await shownFields()).slice(5))
            .toEqual(['domainLabel', 'competenceGroup0', 'competenceGroup1']);
    });
});

test.describe('MA student table columns', () => {
    test('show the competence columns, after the Leitidee column, in table-only mode alone', async ({
        page,
    }) => {
        await gotoApp(page, '/ma/#student');
        const header = page.locator('#student-view-module .tabulator-header');
        /** @returns {Promise<string[]>} The fields of the shown header columns, in order. */
        const shownFields = () =>
            header
                .locator('.tabulator-col[tabulator-field]:visible')
                .evaluateAll((cols) =>
                    cols.map((col) => col.getAttribute('tabulator-field') ?? ''),
                );

        await selectLayoutMode(page, 'both');
        await expect.poll(async () => (await shownFields()).slice(-1)).toEqual(['domainLabel']);

        await selectLayoutMode(page, 'table-only');
        await expect
            .poll(async () => (await shownFields()).slice(-3))
            .toEqual(['domainLabel', 'competenceGroup0', 'competenceGroup1']);
    });
});

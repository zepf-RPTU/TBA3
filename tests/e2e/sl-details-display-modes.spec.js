/**
 * E2E test: SL Details wrapper visibility is CSS-owned.
 *
 * The Details view has four persistent host wrappers. JS owns only the root
 * mode attributes; CSS decides which wrapper is visible for each mode pair.
 */

import { test, expect } from './support/test.js';
import { clickNav, LOAD_TIMEOUT_MS } from './support/app.js';
import { selectMode } from './support/modes.js';
import { expandFirstGroup, openSlDetails } from './support/slDomainTable.js';

const WRAPPERS = {
    domainTable: "[data-details-section='table:by_subjects']",
    classTable: "[data-details-section='table:by_groups']",
    subjectCharts: "[data-details-section='charts:by_subjects']",
    classCharts: "[data-details-section='charts:by_groups']",
};

/**
 * @typedef {object} ModeCase
 * @property {string} detailsGrouping - The `data-mode` of the details-grouping button.
 * @property {string} displayMode - The `data-mode` of the display-mode button.
 * @property {Record<keyof typeof WRAPPERS, string>} display - Each wrapper's computed `display`.
 */

/** @type {ModeCase[]} */
const MODES = [
    {
        detailsGrouping: 'by_subjects',
        displayMode: 'charts',
        display: {
            domainTable: 'none',
            classTable: 'none',
            subjectCharts: 'flex',
            classCharts: 'none',
        },
    },
    {
        detailsGrouping: 'by_groups',
        displayMode: 'charts',
        display: {
            domainTable: 'none',
            classTable: 'none',
            subjectCharts: 'none',
            classCharts: 'flex',
        },
    },
    {
        detailsGrouping: 'by_groups',
        displayMode: 'table',
        display: {
            domainTable: 'none',
            classTable: 'flex',
            subjectCharts: 'none',
            classCharts: 'none',
        },
    },
    {
        detailsGrouping: 'by_subjects',
        displayMode: 'table',
        display: {
            domainTable: 'flex',
            classTable: 'none',
            subjectCharts: 'none',
            classCharts: 'none',
        },
    },
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {Pick<ModeCase, 'detailsGrouping' | 'displayMode'>} modes - The mode pair to select.
 */
async function selectDetailsMode(page, { detailsGrouping, displayMode }) {
    await selectMode(page, detailsGrouping);
    await selectMode(page, displayMode);
}

/** @param {import('@playwright/test').Page} page */
async function readDetailsState(page) {
    return page.evaluate((wrappers) => {
        const root = document.querySelector('.sl-details-view');
        const state = {
            displayMode: root?.getAttribute('data-display-mode') ?? null,
            detailsGrouping: root?.getAttribute('data-grouping') ?? null,
            displays: /** @type {Record<string, string | null>} */ ({}),
        };

        for (const [key, selector] of Object.entries(wrappers)) {
            const element = document.querySelector(selector);
            state.displays[key] = element ? window.getComputedStyle(element).display : null;
        }

        return state;
    }, WRAPPERS);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {ModeCase} modeCase - The expected mode pair and wrapper displays.
 */
async function expectDetailsMode(page, modeCase) {
    await expect
        .poll(() => readDetailsState(page))
        .toEqual({
            displayMode: modeCase.displayMode,
            detailsGrouping: modeCase.detailsGrouping,
            displays: modeCase.display,
        });
}

/**
 * Show the domain table with its first subject group expanded, in stacked-bar mode.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} The survey cells' SVGs: none in stacked-bar mode, one per cell in boxplot mode.
 */
async function openExpandedDomainTable(page) {
    await selectDetailsMode(page, { detailsGrouping: 'by_subjects', displayMode: 'table' });
    const table = page.locator(WRAPPERS.domainTable);
    // The survey cells live on the rows inside the first subject group.
    await expandFirstGroup(table);
    const surveySvgs = table.locator('.tabulator-cell svg');
    await expect(surveySvgs).toHaveCount(0);
    return surveySvgs;
}

test.describe('SL Details display modes', () => {
    test.beforeEach(async ({ page }) => {
        await openSlDetails(page);
    });

    test('computes all wrapper visibility from root CSS state and keeps it after hide/show', async ({
        page,
    }) => {
        for (const modeCase of MODES) {
            await selectDetailsMode(page, modeCase);
            await expectDetailsMode(page, modeCase);
            await clickNav(page, '#summaryViewButton');
            await page
                .locator('.sl-summary-view')
                .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
            await clickNav(page, '#detailsViewButton');
            await page
                .locator('.sl-details-view')
                .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
            await expectDetailsMode(page, modeCase);
        }
    });

    test('the Balken/Boxplot switch re-renders the survey cells of the shown table, and back', async ({
        page,
    }) => {
        // The switch writes the app-state key `vizMode`; the Details view observes it
        // and pushes it to its tables. Boxplot cells are SVG, stacked bars are DOM, so
        // the SVG count inside the domain table is the oracle, round-tripped.
        const surveySvgs = await openExpandedDomainTable(page);

        await selectMode(page, 'boxplot');
        await expect.poll(() => surveySvgs.count()).toBeGreaterThan(0);

        await selectMode(page, 'stacked_bar');
        await expect(surveySvgs).toHaveCount(0);
    });

    test('a table hidden by the view mode shows a Balken/Boxplot switch made meanwhile once it is back', async ({
        page,
    }) => {
        // CSS hides the domain table while the group table shows; the switch reaches the
        // hidden table only as a deferred redraw, which runs when the section is shown.
        const surveySvgs = await openExpandedDomainTable(page);

        await selectMode(page, 'by_groups');
        await selectMode(page, 'boxplot');
        await selectMode(page, 'by_subjects');
        await expect.poll(() => surveySvgs.count()).toBeGreaterThan(0);

        await selectMode(page, 'by_groups');
        await selectMode(page, 'stacked_bar');
        await selectMode(page, 'by_subjects');
        await expect(surveySvgs).toHaveCount(0);
    });
});

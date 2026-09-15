/**
 * E2E test: SL overview wrapper visibility is CSS-owned.
 *
 * The overview view has four persistent host wrappers. JS owns only the root
 * mode attributes; CSS decides which wrapper is visible for each mode pair.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, clickNav, LOAD_TIMEOUT } from './support/app.js';

const UPDATE_TIMEOUT = 5_000;

const WRAPPERS = {
    domainTable: '#overview-domain-table-wrapper',
    classTable: '#overview-class-table-wrapper',
    subjectCharts: '#overview-subject-charts-wrapper',
    classCharts: '#overview-class-charts-wrapper',
};

const MODES = [
    {
        viewMode: 'by_subjects',
        displayMode: 'charts',
        display: {
            domainTable: 'none',
            classTable: 'none',
            subjectCharts: 'flex',
            classCharts: 'none',
        },
    },
    {
        viewMode: 'by_classes',
        displayMode: 'charts',
        display: {
            domainTable: 'none',
            classTable: 'none',
            subjectCharts: 'none',
            classCharts: 'flex',
        },
    },
    {
        viewMode: 'by_classes',
        displayMode: 'table',
        display: {
            domainTable: 'none',
            classTable: 'flex',
            subjectCharts: 'none',
            classCharts: 'none',
        },
    },
    {
        viewMode: 'by_subjects',
        displayMode: 'table',
        display: {
            domainTable: 'flex',
            classTable: 'none',
            subjectCharts: 'none',
            classCharts: 'none',
        },
    },
];

const modeButton = (page, mode) =>
    page.locator(`[data-mode-switch-button="true"][data-mode="${mode}"]`).first();

async function openOverview(page) {
    await gotoApp(page, '/sl/');
    await page
        .locator('.sl-summary-view svg')
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await clickNav(page, '#overviewViewButton');
    await page.locator('.sl-overview-view').waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
}

async function selectMode(page, mode) {
    const button = modeButton(page, mode);
    await button.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

    if (!(await button.isDisabled())) {
        await button.click();
    }
}

async function selectOverviewMode(page, { viewMode, displayMode }) {
    await selectMode(page, viewMode);
    await selectMode(page, displayMode);
}

async function readOverviewState(page) {
    return page.evaluate((wrappers) => {
        const root = document.querySelector('.sl-overview-view');
        const state = {
            displayMode: root?.getAttribute('data-display-mode') ?? null,
            viewMode: root?.getAttribute('data-view-mode') ?? null,
            displays: {},
            inlineDisplays: {},
        };

        for (const [key, selector] of Object.entries(wrappers)) {
            const element = document.querySelector(selector);
            state.displays[key] = element ? window.getComputedStyle(element).display : null;
            state.inlineDisplays[key] =
                element instanceof HTMLElement ? element.style.display : null;
        }

        return state;
    }, WRAPPERS);
}

async function expectOverviewMode(page, modeCase) {
    await expect
        .poll(
            async () => {
                const state = await readOverviewState(page);
                return {
                    displayMode: state.displayMode,
                    viewMode: state.viewMode,
                    displays: state.displays,
                };
            },
            { timeout: UPDATE_TIMEOUT },
        )
        .toEqual({
            displayMode: modeCase.displayMode,
            viewMode: modeCase.viewMode,
            displays: modeCase.display,
        });

    const state = await readOverviewState(page);
    expect(state.inlineDisplays).toEqual({
        domainTable: '',
        classTable: '',
        subjectCharts: '',
        classCharts: '',
    });
}

describe('SL overview display modes', () => {
    test.beforeEach(async ({ page }) => {
        await openOverview(page);
    });

    test('computes all wrapper visibility from root CSS state', async ({ page }) => {
        for (const modeCase of MODES) {
            await selectOverviewMode(page, modeCase);
            await expectOverviewMode(page, modeCase);
        }
    });

    test('keeps wrapper visibility after hide/show', async ({ page }) => {
        for (const modeCase of MODES) {
            await selectOverviewMode(page, modeCase);
            await clickNav(page, '#summaryViewButton');
            await page
                .locator('.sl-summary-view')
                .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
            await clickNav(page, '#overviewViewButton');
            await page
                .locator('.sl-overview-view')
                .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
            await expectOverviewMode(page, modeCase);
        }
    });

    test('the Balken/Boxplot switch re-renders the survey cells of the shown table, and back', async ({
        page,
    }) => {
        // The switch writes the app-state key `vizMode`; the overview view observes
        // it and pushes it to its tables. Boxplot cells are SVG, stacked bars are
        // DOM — so the SVG count inside the domain table is the oracle, round-tripped.
        await selectOverviewMode(page, { viewMode: 'by_subjects', displayMode: 'table' });
        const surveySvgs = page.locator(`${WRAPPERS.domainTable} .tabulator-cell svg`);
        // Subject groups start collapsed; the survey cells live on the rows inside.
        const firstGroup = page.locator(`${WRAPPERS.domainTable} .tabulator-group`).first();
        await firstGroup.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await firstGroup.click();
        const rows = page.locator(`${WRAPPERS.domainTable} .tabulator-row:not(.tabulator-group)`);
        await expect.poll(() => rows.count(), { timeout: UPDATE_TIMEOUT }).toBeGreaterThan(0);
        await expect(surveySvgs).toHaveCount(0);

        await selectMode(page, 'boxplot');
        await expect.poll(() => surveySvgs.count(), { timeout: UPDATE_TIMEOUT }).toBeGreaterThan(0);

        await selectMode(page, 'stacked_bar');
        await expect(surveySvgs).toHaveCount(0, { timeout: UPDATE_TIMEOUT });
    });
});

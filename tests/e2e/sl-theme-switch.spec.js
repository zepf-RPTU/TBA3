/**
 * E2E test: competence-level color-theme switch guard (SL Gesamtbild, EN overview, MA overview bands).
 *
 * Changing the "Farbschema" (competence-level color theme) in the sidebar repaints the
 * charts in place through the published palette tokens, with no redraw and no view
 * teardown: no view is left hidden, and no chart is replaced with the red "Fehler beim
 * Laden der Grafik." box.
 *
 * Each test cycles through every theme and asserts that the target charts stay rendered
 * and that no chart-render or theme-refresh error is logged. The sequence ends on the
 * default, the theme active on load, so every click is a real change: clicking the
 * active theme is a no-op.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { COMPETENCE_LEVEL_SEGMENT, MATRIX_CHART, gotoMatrix } from './support/slCompetenceChart.js';
import { collectErrors, assertNoChartErrors } from './support/pageErrors.js';
import { openSidebarSetting, pickSidebarSetting } from './support/nav.js';

const THEME_SEQUENCE = ['grayscale', 'default'];

// The themed color vars, by family. Each theme switch must re-point every family, which
// proves the data-competence-level-theme overrides (competence-levels.css) are wired to
// them. A family counts as re-pointed when any of its vars changes:
// some keep a value across themes.
const THEMED_FAMILIES = {
    sl: ['--sl-teaching-quality', '--sl-self-efficacy'],
    result: ['--result-correct', '--result-incorrect', '--result-not-attempted'],
    gender: ['--gender-male-color', '--gender-female-color', '--gender-diverse-color'],
    // EN domain colors paint the scatterplot's axis lines and labels.
    domain: ['--chart-domain0-color', '--chart-domain1-color'],
    // The four average markers co-occur on one chart.
    chartAverages: [
        '--group-average-color',
        '--student-performance-color',
        '--state-average-color',
        '--school-average-color',
    ],
};

/* Every themed color var, for the grayscale shade budget: under "Graustufen" these
   collapse onto the five --gray-N steps, and families that never render against each
   other reuse a step.

   The competence-level ramp is generated per scale rather than declared as CSS
   vars, so the test samples it off the painted band elements (readBandRamp) and folds it
   into the same budget. The SL rating bands are the ramp's own stops (getRatingStops),
   published only once a rating chart draws. */
const ALL_THEMED_COLOR_VARS = Object.values(THEMED_FAMILIES).flat();
const GRAYSCALE_SHADE_BUDGET = 5;

/**
 * Read a computed CSS custom property off <html>, resolved to `rgb(r, g, b)` ('' when unset).
 * @param {import('@playwright/test').Page} page
 * @param {string} name - The custom property, e.g. `--sl-self-efficacy`.
 * @returns {Promise<string>}
 */
function readCssVar(page, name) {
    return page.evaluate((n) => {
        const value = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
        if (!value) return '';
        const probe = document.createElement('i');
        probe.style.color = value;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
    }, name);
}

/**
 * The generated competence-level ramp, read off the competence-level bar segments on the
 * page (painted through `--competence-level-band-color`) as each segment's fill,
 * `rgb(r, g, b)`.
 * The level count is data-driven, so there is no fixed set of CSS variables to enumerate.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The distinct band colours ('' for a segment painted none).
 */
function readBandRamp(page) {
    return page.evaluate((segment) => {
        const colors = [...document.querySelectorAll(segment)].map((el) => {
            const fill = getComputedStyle(el).fill;
            return fill.startsWith('rgb') ? fill : '';
        });
        return [...new Set(colors)];
    }, COMPETENCE_LEVEL_SEGMENT);
}

/**
 * Snapshot the given themed families now; the returned per-theme check asserts every
 * family resolves to set values and was re-pointed since the previous snapshot.
 * @param {import('@playwright/test').Page} page
 * @param {Array<keyof typeof THEMED_FAMILIES>} familyNames - The families the page styles.
 * @returns {Promise<(theme: string) => Promise<void>>} The check for `cycleThemesKeepingChart`.
 */
async function trackThemedFamilies(page, familyNames) {
    const read = () =>
        Promise.all(
            familyNames.map((family) =>
                Promise.all(THEMED_FAMILIES[family].map((name) => readCssVar(page, name))),
            ),
        );
    let previous = await read();
    return async (theme) => {
        const current = await read();
        familyNames.forEach((family, i) => {
            expect(current[i], `${family} vars are set @ ${theme}`).not.toContain('');
            expect(current[i], `${family} re-pointed @ ${theme}`).not.toEqual(previous[i]);
        });
        previous = current;
    };
}

/**
 * Pick a competence-level theme in the sidebar and wait until the page has it.
 * @param {import('@playwright/test').Page} page
 * @param {string} theme - The theme's id.
 */
async function selectTheme(page, theme) {
    await pickSidebarSetting(page, 'competence-level-theme', theme, { touch: false });
    await expect(page.locator('html')).toHaveAttribute('data-competence-level-theme', theme);
}

/**
 * Click through every theme; after each switch assert the attribute + picker state
 * flipped and the chart's svg survived the in-place refresh (present + non-empty).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} chart
 * @param {(theme: string) => Promise<void>} [perThemeCheck]
 */
async function cycleThemesKeepingChart(page, chart, perThemeCheck) {
    for (const theme of THEME_SEQUENCE) {
        await selectTheme(page, theme);
        const menu = await openSidebarSetting(page, 'competence-level-theme', { touch: false });
        await expect(menu.locator(`[data-menu-item-id="${theme}"]`)).toHaveAttribute(
            'aria-checked',
            'true',
        );
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();

        // Not replaced by the "Fehler…" div, not left blank.
        await chart
            .locator('svg.chart-root')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        expect((await chart.locator('svg.chart-root').first().innerHTML()).length).toBeGreaterThan(
            0,
        );

        if (perThemeCheck) await perThemeCheck(theme);
    }
}

test.describe('competence-level color-theme switch', () => {
    test('SL Gesamtbild chart survives every theme switch', async ({ page }) => {
        const errors = collectErrors(page);
        await gotoMatrix(page);

        const chart = page.locator(MATRIX_CHART);

        // SL renders both a richtig/falsch and a gender stacked bar.
        const checkFamilies = await trackThemedFamilies(page, ['sl', 'result', 'gender']);
        // SL sets its own --group-average-color in a plain :root, specificity (0,1,0).
        // The shared html[data-competence-level-theme=…] override is (0,1,1), so it wins
        // in every other theme regardless of @import order.
        const slGroupAverage = await readCssVar(page, '--group-average-color');
        await cycleThemesKeepingChart(page, chart, async (theme) => {
            await checkFamilies(theme);
            const groupAvg = await readCssVar(page, '--group-average-color');
            if (theme === 'default') {
                expect(groupAvg, 'SL keeps its own group-average colour in default').toBe(
                    slGroupAverage,
                );
            } else {
                expect(groupAvg, `shared override beats SL's value @ ${theme}`).not.toBe(
                    slGroupAverage,
                );
            }
        });
        await expect(
            chart.locator(`svg ${COMPETENCE_LEVEL_SEGMENT}`).filter({ visible: true }).first(),
        ).toBeVisible();
        assertNoChartErrors(errors);
    });

    test('grayscale theme stays within its shade budget', async ({ page }) => {
        await gotoApp(page, '/sl/');
        await selectTheme(page, 'grayscale');

        // SL is the only dashboard that defines every var in the list.
        const resolved = await Promise.all(
            ALL_THEMED_COLOR_VARS.map(async (name) => [name, await readCssVar(page, name)]),
        );

        const unresolved = resolved.filter(([, value]) => !value);
        expect(
            unresolved.map(([n]) => n),
            'every themed var must resolve',
        ).toEqual([]);

        // The ramp is sampled off the MA overview's competence-level bars; the theme
        // choice persists across pages.
        await gotoApp(page, '/ma/#overview');
        await expect(page.locator('html')).toHaveAttribute(
            'data-competence-level-theme',
            'grayscale',
        );
        await page
            .locator(COMPETENCE_LEVEL_SEGMENT)
            .first()
            .waitFor({ state: 'attached', timeout: LOAD_TIMEOUT_MS });
        const bandRamp = await readBandRamp(page);
        expect(bandRamp.length, 'the leading scale registered its bands').toBeGreaterThan(0);
        expect(
            bandRamp.filter((c) => !c),
            'every band resolves a color',
        ).toEqual([]);

        const shades = new Set([...resolved.map(([, value]) => value), ...bandRamp]);
        expect(
            shades.size,
            `Grayscale must use at most ${GRAYSCALE_SHADE_BUDGET} shades (--gray-1…5). ` +
                `Got ${shades.size}: ${[...shades].sort().join(', ')}. Reuse an existing step for a ` +
                'family that never renders against the one you are adding.',
        ).toBeLessThanOrEqual(GRAYSCALE_SHADE_BUDGET);
    });

    test('competence bands repaint on a theme switch, without a reload', async ({ page }) => {
        // Bands repaint only through the published band tokens: a band painted with a
        // literal would keep the previous theme until the next page load.
        await gotoApp(page, '/ma/#overview');
        await page
            .locator(COMPETENCE_LEVEL_SEGMENT)
            .first()
            .waitFor({ state: 'attached', timeout: LOAD_TIMEOUT_MS });

        const beforeRamp = await readBandRamp(page);
        expect(beforeRamp.length, 'the leading scale registered its bands').toBeGreaterThan(0);

        await selectTheme(page, 'grayscale');
        await expect
            .poll(() => readBandRamp(page), { timeout: LOAD_TIMEOUT_MS })
            .not.toEqual(beforeRamp);

        await selectTheme(page, 'default');
        await expect
            .poll(() => readBandRamp(page), { timeout: LOAD_TIMEOUT_MS })
            .toEqual(beforeRamp);
    });

    test('competence bands repaint on a colour-scheme switch, with no republish', async ({
        page,
    }) => {
        // The published band tokens are light-dark() pairs: the scheme stamp alone must
        // repaint them, through the cascade.
        await gotoApp(page, '/ma/#overview');
        await page
            .locator(COMPETENCE_LEVEL_SEGMENT)
            .first()
            .waitFor({ state: 'attached', timeout: LOAD_TIMEOUT_MS });
        await pickSidebarSetting(page, 'color-scheme', 'light', { touch: false });
        await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
        const lightRamp = await readBandRamp(page);

        await pickSidebarSetting(page, 'color-scheme', 'dark', { touch: false });
        await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
        await expect
            .poll(() => readBandRamp(page), { timeout: LOAD_TIMEOUT_MS })
            .not.toEqual(lightRamp);

        await pickSidebarSetting(page, 'color-scheme', 'light', { touch: false });
        await expect
            .poll(() => readBandRamp(page), { timeout: LOAD_TIMEOUT_MS })
            .toEqual(lightRamp);
    });

    test('EN overview scatterplot survives every theme switch', async ({ page }) => {
        const errors = collectErrors(page);
        await gotoApp(page, '/en/#overview');
        const chart = page.locator('#en-overview-scatterplot');
        await chart
            .locator('svg.chart-root')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        await cycleThemesKeepingChart(
            page,
            chart,
            await trackThemedFamilies(page, ['domain', 'chartAverages']),
        );
        assertNoChartErrors(errors);
    });
});

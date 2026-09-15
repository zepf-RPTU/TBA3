/**
 * E2E test: KS color-theme switch guard (SL summary + welcome, EN/MA overviews).
 *
 * Regression guard for the theme-switch bug: changing the "Farbschema" (KS color
 * theme) in the sidebar used to destroy and recreate the whole active view, which
 * could throw during teardown and leave the view hidden (charts gone) or replace a
 * chart with the red "Fehler beim Laden der Grafik." box. The fix refreshes charts
 * in place (ChartHostModule.rerender via a THEME_CHANGED broadcast) with no view
 * teardown, and moves per-chart color reads to render time.
 *
 * Each test cycles through every KS theme and asserts the target chart(s) stay
 * rendered (svg present + non-empty, never blanked or error-boxed) and that no
 * chart-render or theme-refresh errors are logged. The theme sequence starts from
 * the default (active on load) so every click is a real change — clicking the
 * already-active theme is a no-op by design.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';
import { collectErrors, assertNoChartErrors } from './support/pageErrors.js';

const THEME_SEQUENCE = ['grayscale', 'colorblind', 'default'];

// Teilaufgaben in the demo fixture, all Domaenen (see
// tests/e2e/en-item-domain-switch.spec.js, which owns the full domain matrix).
const EN_ALL_ITEMS = 79;

// Expected computed value of a few SL semantic color vars per theme — proves the
// data-ks-theme overrides in src/sl/variables.css are wired to these families.
const SL_EXPECTED_VARS = {
    grayscale: {
        '--sl-teaching-quality': '#595959',
        '--sl-self-efficacy': '#a6a6a6',
        '--sl-rating-low': '#cccccc',
    },
    colorblind: {
        '--sl-teaching-quality': '#cc79a7',
        '--sl-self-efficacy': '#0072b2',
        '--sl-rating-low': '#d55e00',
    },
    default: {
        '--sl-teaching-quality': '#9b59b6',
        '--sl-self-efficacy': '#5b8dee',
        '--sl-rating-low': '#e74c3c',
    },
};

// richtig/falsch is the pair colorblind mode exists for: a plain green/red until
// these overrides landed. Grayscale reads ink ∝ engagement (unattempted lightest).
const RESULT_EXPECTED_VARS = {
    grayscale: {
        '--result-correct': '#333333',
        '--result-incorrect': '#808080',
        '--result-not-attempted': '#cccccc',
    },
    colorblind: {
        '--result-correct': '#009e73',
        '--result-incorrect': '#d55e00',
        '--result-not-attempted': '#9e9e9e',
    },
    default: {
        '--result-correct': '#4caf50',
        '--result-incorrect': '#f44336',
        '--result-not-attempted': '#9e9e9e',
    },
};

// Gender reuses the result steps in grayscale — the two never share a bar.
const GENDER_EXPECTED_VARS = {
    grayscale: {
        '--gender-male-color': '#333333',
        '--gender-female-color': '#808080',
        '--gender-diverse-color': '#cccccc',
    },
    colorblind: {
        '--gender-male-color': '#009e73',
        '--gender-female-color': '#0072b2',
        '--gender-diverse-color': '#e69f00',
    },
    default: {
        '--gender-male-color': '#4caf50',
        '--gender-female-color': '#2196f3',
        '--gender-diverse-color': '#ff9800',
    },
};

// EN domain colors paint the scatterplot's axis lines and labels.
const DOMAIN_EXPECTED_VARS = {
    grayscale: { '--chart-domain0-color': '#808080', '--chart-domain1-color': '#333333' },
    colorblind: { '--chart-domain0-color': '#e69f00', '--chart-domain1-color': '#0072b2' },
    default: { '--chart-domain0-color': '#e69138', '--chart-domain1-color': '#4b89dc' },
};

// The four average markers co-occur on one chart, so they interleave across the
// ramp's dark half; school/state stay achromatic in default + colorblind.
// NB --class-average-color is asserted on the EN page. SL aliases it to its own
// --success-color (#10b981) in default mode, so the default row is EN-specific;
// the grayscale/colorblind rows hold on both pages, which is the point of the
// dedicated SL assertion below.
const CHART_AVG_EXPECTED_VARS = {
    grayscale: {
        '--class-average-color': '#333333',
        '--student-performance-color': '#595959',
        '--state-average-color': '#808080',
        '--school-average-color': '#000000',
    },
    colorblind: {
        '--class-average-color': '#009e73',
        '--student-performance-color': '#d55e00',
        '--state-average-color': '#888888',
        '--school-average-color': '#000000',
    },
    default: {
        // Ink and accent, not hues: the class mark is told apart by shape and fill,
        // the student by the accent (variables.css).
        '--class-average-color': '#333333',
        '--student-performance-color': '#1d4ed8',
        '--state-average-color': '#888888',
        '--school-average-color': '#000000',
    },
};

/* Every themed color var, used for the grayscale shade-budget assertion. Under
   "Graustufen" these must collapse onto the five --gray-N steps plus #000000 for
   the school-average marker. Families that never render against each other reuse
   a step deliberately; the budget is what stops a sixth shade drifting in.

   The competence-level ramp is not in this list: it is generated per band count rather
   than declared as CSS vars, so the test samples it off the painted band elements (see
   readBandRamp) and folds it into the same budget as the hand-written CSS families. */
const ALL_THEMED_COLOR_VARS = [
    ...Object.keys(RESULT_EXPECTED_VARS.grayscale),
    ...Object.keys(GENDER_EXPECTED_VARS.grayscale),
    ...Object.keys(DOMAIN_EXPECTED_VARS.grayscale),
    ...Object.keys(CHART_AVG_EXPECTED_VARS.grayscale),
    '--sl-teaching-quality',
    '--sl-self-efficacy',
    '--sl-group-1',
    '--sl-group-2',
    '--sl-rating-low',
    '--sl-rating-medium',
    '--sl-rating-good',
    '--sl-rating-excellent',
];
const GRAYSCALE_SHADE_BUDGET = 6;

/**
 * `#rrggbb` → the `rgb(r, g, b)` form the browser reports, so a comparison does not
 * depend on how the stylesheet spelled the color (the build shortens `#cccccc` to
 * `#ccc` and `#808080` to `gray`).
 * @param {string} hex - six-digit hex color
 * @returns {string} `rgb(r, g, b)`
 */
function rgb(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `rgb(${r}, ${g}, ${b})`;
}

/** Read a computed CSS custom property off <html>, resolved to `rgb(r, g, b)` ('' when unset). */
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
 * The generated competence-level ramp, one color per band of the leading scale — read
 * off the nav-card thumbnails (bandThumbnail.js paints exactly `getLeadingScaleBandLevels`
 * through `--ks-band-color`) and resolved to `rgb(r, g, b)`. Sampled from the DOM because
 * the band count is data-driven, so there is no fixed set of CSS variables to enumerate;
 * the ramp is generated per band count, so every five-band scale paints the same five
 * grayscale steps.
 */
function readBandRamp(page) {
    return page.evaluate(() => {
        const probe = document.createElement('i');
        document.body.append(probe);
        const colors = [...document.querySelectorAll('.band-thumbnail-segment')].map((el) => {
            const value = getComputedStyle(el).getPropertyValue('--ks-band-color').trim();
            if (!value) return '';
            probe.style.color = value;
            return getComputedStyle(probe).color;
        });
        probe.remove();
        return [...new Set(colors)];
    });
}

/** Assert every var in `expected[theme]` resolves to its listed value. */
async function assertVars(page, expected, theme) {
    for (const [name, hex] of Object.entries(expected[theme])) {
        expect(await readCssVar(page, name), `${name} @ ${theme}`).toBe(rgb(hex));
    }
}

/**
 * Click through every theme; after each switch assert the attribute + picker state
 * flipped and the chart's svg survived the in-place refresh (present + non-empty).
 * @param {import('playwright').Locator} chart - the chart host locator
 * @param {(theme: string) => Promise<void>} [perThemeCheck] - extra per-theme assertions
 */
async function cycleThemesKeepingChart(page, chart, perThemeCheck) {
    for (const theme of THEME_SEQUENCE) {
        await page.locator(`button[data-ks-theme-option="${theme}"]`).click();

        await expect(page.locator('html')).toHaveAttribute('data-ks-theme', theme);
        await expect(page.locator(`button[data-ks-theme-option="${theme}"]`)).toHaveClass(
            /is-active/,
        );

        // Never replaced by the "Fehler…" div, never left blank.
        await chart.locator('svg').first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        expect((await chart.locator('svg').first().innerHTML()).length).toBeGreaterThan(0);

        if (perThemeCheck) await perThemeCheck(theme);
    }
}

describe('KS color-theme switch', () => {
    test('SL welcome chart survives every theme switch', async ({ page }) => {
        const errors = collectErrors(page);
        await gotoApp(page, '/sl/');

        // Überblick (summary) is the default view; let it settle, then navigate to
        // the welcome view — the app rejects a switch mid-transition.
        await page
            .locator('.sl-summary-view .summary-row-card svg')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await page.locator('#welcomeViewButton').click();

        const chart = page.locator('#sl-welcome-chart');
        await chart
            .locator('svg .bar-segment.competency-level')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // Each switch must also re-point the SL semantic colors (teaching quality,
        // self-efficacy, rating bands) and the result/gender families — SL renders
        // both a richtig/falsch and a gender stacked bar.
        await cycleThemesKeepingChart(page, chart, async (theme) => {
            await assertVars(page, SL_EXPECTED_VARS, theme);
            await assertVars(page, RESULT_EXPECTED_VARS, theme);
            await assertVars(page, GENDER_EXPECTED_VARS, theme);

            // SL aliases --class-average-color to var(--success-color) in a plain
            // :root, specificity (0,1,0). The shared html[data-ks-theme=…] override
            // is (0,1,1), so it must win here regardless of @import order. Guards the
            // one piece of cascade reasoning the theme extension rests on.
            const classAvg = await readCssVar(page, '--class-average-color');
            if (theme === 'default') {
                expect(classAvg, 'SL keeps its --success-color alias in default').toBe(
                    rgb('#10b981'),
                );
            } else {
                expect(classAvg, `shared override beats SL's alias @ ${theme}`).toBe(
                    rgb(CHART_AVG_EXPECTED_VARS[theme]['--class-average-color']),
                );
            }
        });
        // The competency segments must still paint after the final switch.
        await expect(chart.locator('svg .bar-segment.competency-level').first()).toBeVisible();
        assertNoChartErrors(errors);
    });

    test('SL summary chart keeps its selected metric across theme switches', async ({ page }) => {
        // A theme switch rebuilds each chart from its ChartHostModule's own data
        // (rerender(this.getData())). The metric dropdown only refreshed the
        // renderer, so switching the theme silently resurrected the metric that
        // was selected when the host was first hydrated — the bars changed under
        // the user while the dropdown still read the metric they had picked.
        const errors = collectErrors(page);
        await gotoApp(page, '/sl/');

        const chart = page.locator('.sl-summary-view .summary-row-card').first();
        await chart
            .locator('svg .deviation-bar')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        const captionText = async () =>
            ((await chart.locator('.school-value-caption').textContent()) ?? '').trim();
        const defaultCaption = await captionText();

        // Switch away from the default metric, then read what the chart now shows.
        // `.nth(1)`: the shared header carries the school selector first and the metric
        // select second, so the bare selector picks the wrong control.
        await page
            .locator('#sl-shared-header .header-module-select select')
            .nth(1)
            .selectOption('optimal_standard');
        const schoolValue = chart.locator('.school-value');
        await expect(schoolValue).toHaveText('18 %');

        // The caption names the Kompetenzstufe the metric's rank resolves to on this
        // dataset's ladders, not the KMK standard behind it — which Kompetenzstufe meets a
        // standard depends on the Schulabschluss, and the payload does not carry it — so it
        // is compared against itself rather than a hardcoded word. It must differ from the default metric's caption, or the
        // round-trip below would pass on a chart that silently reverted.
        const caption = await captionText();
        expect(caption, 'the caption names no KMK standard').not.toMatch(/Optimalstandard/i);
        expect(caption, 'the caption followed the metric change').not.toBe(defaultCaption);

        await cycleThemesKeepingChart(page, chart, async (theme) => {
            await expect(schoolValue, `metric survives the switch to ${theme}`).toHaveText('18 %');
            expect(await captionText(), `caption survives the switch to ${theme}`).toBe(caption);
        });

        // Colour still encodes better/worse than the school, in the active theme.
        const fills = await chart
            .locator('.deviation-bar')
            .evaluateAll((bars) => bars.map((bar) => bar.getAttribute('fill')));
        expect(new Set(fills).size, 'both a favourable and an unfavourable bar are present').toBe(
            2,
        );
        assertNoChartErrors(errors);
    });

    test('grayscale theme stays within its shade budget', async ({ page }) => {
        await gotoApp(page, '/sl/');
        await page.locator('button[data-ks-theme-option="grayscale"]').click();
        await expect(page.locator('html')).toHaveAttribute('data-ks-theme', 'grayscale');

        // SL is the only dashboard that defines every var in the list.
        const resolved = await Promise.all(
            ALL_THEMED_COLOR_VARS.map(async (name) => [name, await readCssVar(page, name)]),
        );

        const unresolved = resolved.filter(([, value]) => !value);
        expect(
            unresolved.map(([n]) => n),
            'every themed var must resolve',
        ).toEqual([]);

        // The ramp is sampled off the MA welcome nav cards, the thumbnails that paint
        // every band of the leading scale; the theme choice persists across pages.
        await gotoApp(page, '/ma/');
        await expect(page.locator('html')).toHaveAttribute('data-ks-theme', 'grayscale');
        await page
            .locator('.band-thumbnail-segment')
            .first()
            .waitFor({ state: 'attached', timeout: LOAD_TIMEOUT });
        const bandRamp = await readBandRamp(page);
        expect(bandRamp.length, 'the leading scale registered its bands').toBeGreaterThan(0);
        expect(
            bandRamp.filter((c) => !c),
            'every band resolves a color',
        ).toEqual([]);

        const shades = new Set([...resolved.map(([, value]) => value), ...bandRamp]);
        expect(
            shades.size,
            `Grayscale must use at most ${GRAYSCALE_SHADE_BUDGET} shades (--gray-1…5 + black). ` +
                `Got ${shades.size}: ${[...shades].sort().join(', ')}. Reuse an existing step for a ` +
                'family that never renders against the one you are adding.',
        ).toBeLessThanOrEqual(GRAYSCALE_SHADE_BUDGET);
    });

    test('band thumbnails repaint on a theme switch, without a reload', async ({ page }) => {
        // The thumbnails sit in the sidebar and the welcome nav cards — outside every
        // view tree, so the onThemeChanged() cascade never reaches them. They repaint
        // only because the host registered a repaint with the palette services, and a
        // host that registers none leaves them painted in the previous theme until the
        // next page load. Nothing else in the suite switches a theme with thumbnails
        // already on screen, so nothing else can see that.
        await gotoApp(page, '/ma/');
        await page
            .locator('.band-thumbnail-segment')
            .first()
            .waitFor({ state: 'attached', timeout: LOAD_TIMEOUT });

        const beforeRamp = await readBandRamp(page);
        expect(beforeRamp.length, 'the leading scale registered its bands').toBeGreaterThan(0);

        await page.locator('button[data-ks-theme-option="grayscale"]').click();
        await expect(page.locator('html')).toHaveAttribute('data-ks-theme', 'grayscale');
        await expect
            .poll(() => readBandRamp(page), { timeout: LOAD_TIMEOUT })
            .not.toEqual(beforeRamp);

        // Back to where it started — the exact colours, not merely different ones.
        await page.locator('button[data-ks-theme-option="default"]').click();
        await expect(page.locator('html')).toHaveAttribute('data-ks-theme', 'default');
        await expect.poll(() => readBandRamp(page), { timeout: LOAD_TIMEOUT }).toEqual(beforeRamp);
    });

    test('EN overview scatterplot survives every theme switch', async ({ page }) => {
        const errors = collectErrors(page);
        await gotoApp(page, '/en/');

        // Overview is not the default view (welcome is); navigate to it.
        await page.locator('#overviewViewButton').click();
        const chart = page.locator('#en-overview-scatterplot');
        await chart.locator('svg').first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // The scatterplot consumes both families: domain colors paint its axis lines
        // and labels, the average markers its plot-area shapes.
        await cycleThemesKeepingChart(page, chart, async (theme) => {
            await assertVars(page, DOMAIN_EXPECTED_VARS, theme);
            await assertVars(page, CHART_AVG_EXPECTED_VARS, theme);
        });
        assertNoChartErrors(errors);
    });

    test('the Landesvorgabe theme is hidden for a payload without colors', async ({ page }) => {
        await gotoApp(page, '/en/?class=8a_mid');

        await expect(page.locator('button[data-ks-theme-option="default"]')).toHaveCount(1);
        await expect(page.locator('button[data-ks-theme-option="data"]')).toHaveCount(0);
    });

    test('EN item lollipop survives every theme switch', async ({ page }) => {
        // This card creates no renderer on its first pass — it waits for the item
        // table's first `applySync`. A theme switch re-runs createRenderer, which
        // deferred a second time and left the host with no chart at all: the card
        // went blank and stayed blank until the table happened to fire again.
        const errors = collectErrors(page);
        await gotoApp(page, '/en/');

        await page.locator('#itemViewButton').click();
        const chart = page.locator('#item-itemLollipop');
        // Counted, not waited on for visibility: an SVG <line> has a zero-width box,
        // which Playwright never reports as visible.
        const markers = chart.locator('svg .lollipop-line');
        await expect.poll(() => markers.count(), { timeout: LOAD_TIMEOUT }).toBeGreaterThan(0);
        const drawnBefore = await markers.count();

        await cycleThemesKeepingChart(page, chart);

        // The card must still hold a drawn chart, over exactly the items the table
        // last synced — a rebuild that re-adopted the mount payload instead would
        // plot the unfiltered set and change the count.
        await expect.poll(() => markers.count(), { timeout: LOAD_TIMEOUT }).toBe(drawnBefore);
        assertNoChartErrors(errors);
    });

    test('EN item lollipop survives a table sync landing inside a theme rebuild', async ({
        page,
    }) => {
        // The card's host installs the renderer it built for the new theme and then
        // awaits the layout settle (fonts, then at least three frames) before creating
        // it. A table sync arriving in that window reaches the renderer through
        // `host.chart`: it used to render there, latching the last-rendered
        // dimensions, and the pending create() then cleared the container and skipped
        // its own render at the tolerance guard — a blank card with no error.
        //
        // Selecting a row is the trigger that lands inside it reliably:
        // rowSelectionChanged syncs with no debounce, so it arrives within a frame or
        // two of the theme click, while the earliest the rebuild can create is three
        // frames. (The dataFiltered sync a Domaene switch produces is debounced 150 ms
        // and races the rebuild's tail, which made it miss the bug about half the time.)
        const errors = collectErrors(page);
        await gotoApp(page, '/en/');

        await page.locator('#itemViewButton').click();
        const chart = page.locator('#item-itemLollipop');
        const heads = chart.locator('svg .lollipop-circle');
        await expect.poll(() => heads.count(), { timeout: LOAD_TIMEOUT }).toBe(EN_ALL_ITEMS);

        // Back to back on purpose: the sync has to land mid-rebuild. dispatchEvent
        // rather than click() because click() waits for the hover-expanded sidebar to
        // collapse off the theme button first, and the rebuild finishes in that time.
        await page.locator('button[data-ks-theme-option="grayscale"]').click();
        await page.locator('#item-table .tabulator-row').first().dispatchEvent('click');

        // The one selected Teilaufgabe, drawn — not the blank card the skipped
        // create() left, and not the unfiltered set the sync replaced.
        await expect.poll(() => heads.count(), { timeout: LOAD_TIMEOUT }).toBe(1);
        assertNoChartErrors(errors);
    });

    test('MA overview charts survive every theme switch', async ({ page }) => {
        const errors = collectErrors(page);
        await gotoApp(page, '/ma/');

        await page.locator('#overviewViewButton').click();
        const ksChart = page.locator('#ma-overview-ksDistribution');
        const taskRing = page.locator('#ma-overview-taskRing');
        await ksChart
            .locator('.bar-segment')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await taskRing.locator('svg').first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // The ring's marks are the oracle: a theme repaints them, it does not add or drop
        // any. The old check was "innerHTML is non-empty", which a half-drawn ring passes.
        const ringMarks = taskRing.locator('svg path, svg circle');
        const marksBefore = await ringMarks.count();
        expect(marksBefore).toBeGreaterThan(0);

        await cycleThemesKeepingChart(page, ksChart);
        // The task ring (constructor-baked niveauColors) must also survive the refresh.
        await expect(taskRing.locator('svg').first()).toBeVisible();
        await expect(ringMarks).toHaveCount(marksBefore);
        assertNoChartErrors(errors);
    });
});

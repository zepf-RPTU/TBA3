/**
 * The shared axe contract: which views are scanned, and how a scan is run and reported.
 *
 * No rule is disabled: an exemption here would be an exemption for every pass.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, seedColorScheme } from './test.js';
import { dataTableToggle, gotoApp } from './app.js';
import { VIEWS } from './views.js';

/** Impacts that fail a run; everything below is logged for the record. */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** BITV 2.0 is WCAG 2.1 AA, so that is where the tag list stops. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * One line per violation: rule, impact, how many nodes, and the first offending selector.
 * @param {import('axe-core').Result} violation
 * @returns {string}
 */
function describeViolation(violation) {
    const first = violation.nodes[0]?.target?.join(' ') ?? '';
    return `${violation.id} [${violation.impact}] ×${violation.nodes.length} — ${violation.help} (${first})`;
}

/**
 * Run axe and split what it found by impact.
 *
 * `include` scopes the scan to one subtree: a surface opened over a rendered view would
 * otherwise re-report that view's findings, which the view sweeps own.
 * @param {import('@playwright/test').Page} page
 * @param {{include?: string}} [options]
 * @returns {Promise<{blocking: string[], advisory: string[]}>} Violation summaries by severity.
 */
export async function runAxe(page, { include } = {}) {
    let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
    if (include) builder = builder.include(include);

    const { violations } = await builder.analyze();

    return {
        blocking: violations
            .filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''))
            .map(describeViolation),
        advisory: violations
            .filter((v) => !BLOCKING_IMPACTS.has(v.impact ?? ''))
            .map(describeViolation),
    };
}

/**
 * The visible SVG text that still paints in the SVG default black. axe's colour-contrast
 * rule skips SVG, so on the dark surface a `<text>` that never received a fill would pass
 * the scan while being unreadable.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The offending labels' text content.
 */
function blackSvgText(page) {
    return page.$$eval('svg text', (nodes) =>
        nodes
            .filter((el) => {
                const style = getComputedStyle(el);
                const box = el.getBoundingClientRect();
                return (
                    style.fill === 'rgb(0, 0, 0)' &&
                    style.visibility !== 'hidden' &&
                    Number(style.opacity) > 0 &&
                    box.width > 0 &&
                    el.textContent?.trim()
                );
            })
            .map((el) => el.textContent?.trim() ?? ''),
    );
}

/**
 * Show every chart's data table in place of its plot: each data-table toggle on screen,
 * pressed once.
 * @param {import('@playwright/test').Page} page
 */
async function showChartTables(page) {
    const toggles = dataTableToggle(page).filter({ visible: true });
    for (const toggle of await toggles.all()) await toggle.click();
    // The last click leaves the pointer on its toggle, whose tooltip would be scanned
    // mid-fade over the card: park the pointer on the view title (not `parkPointer`: the
    // top-left corner hover-expands the sidebar rail).
    await page.locator('h1.header-module-title').hover();
    await expect(page.locator('#tooltip-delegated')).toBeHidden();
    await expect(toggles.and(page.locator('[aria-pressed="false"]'))).toHaveCount(0);
}

/**
 * Register one axe test per dashboard view. The passes differ only in their context
 * overrides, so a change to the readiness wait reaches all of them.
 * @param {typeof import('./test.js').test} test - The spec file's own test function, so the tests register against it.
 * @param {{label?: string, views?: {[app: string]: string[]}, scheme?: 'light'|'dark', chartTables?: boolean}} [options] -
 *     `label` distinguishes the pass in test titles and console output; `views` narrows the
 *     sweep to a subset of `VIEWS`; `scheme` seeds the colour-scheme preference
 *     so the pass runs on that surface; `chartTables` scans every chart with its data
 *     table showing in place of the plot.
 */
export function sweepViews(
    test,
    { label = '', views: sweptViews = VIEWS, scheme, chartTables = false } = {},
) {
    const suffix = label ? ` on ${label}` : '';
    const tag = label ? `axe ${label}` : 'axe';

    for (const [app, views] of Object.entries(sweptViews)) {
        for (const view of views) {
            test(`${app} ${view} view has no serious or critical axe violations${suffix}`, async ({
                context,
                page,
            }) => {
                if (scheme) await seedColorScheme(context, scheme);
                // gotoApp waits out the cold-start shell's fade: scanned mid-fade, its
                // status line is measured against a blended background.
                await gotoApp(page, `/${app}/#${view}`);
                if (chartTables) await showChartTables(page);

                const { blocking, advisory } = await runAxe(page);
                if (advisory.length) {
                    console.log(`[${tag}] ${app}/${view} advisory:\n  ${advisory.join('\n  ')}`);
                }
                expect(blocking, `${app}/${view}${suffix}`).toEqual([]);
                if (scheme === 'dark') {
                    expect(await blackSvgText(page), `${app}/${view}${suffix}`).toEqual([]);
                }
            });
        }
    }
}

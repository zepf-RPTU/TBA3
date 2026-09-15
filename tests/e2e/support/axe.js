/**
 * The shared axe contract: which views are scanned, and how a scan is run and reported.
 *
 * Three specs use it — the desktop view sweep (accessibility.spec.js), the same sweep on a
 * touch context (accessibility-touch.spec.js), and the interaction-gated surfaces
 * (accessibility-surfaces.spec.js). No rule is disabled: an exemption here would be an
 * exemption for every pass, which is what let a `role="tablist"` with no tabs sit unseen
 * behind Tabulator's grid roles until packages/modules/src/common/tables/internal/tabulatorAria.js put
 * those right.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect } from './test.js';
import { gotoApp, LOAD_TIMEOUT } from './app.js';
import { VIEWS } from './views.js';

/** Impacts that fail a run; everything below is logged for the record. */
export const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** BITV 2.0 is WCAG 2.1 AA, so that is where the tag list stops. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * One line per violation: rule, impact, how many nodes, and the first offending selector.
 * @param {import('axe-core').Result} violation - An axe violation.
 * @returns {string} The summary line.
 */
export function describeViolation(violation) {
    const first = violation.nodes[0]?.target?.join(' ') ?? '';
    return `${violation.id} [${violation.impact}] ×${violation.nodes.length} — ${violation.help} (${first})`;
}

/**
 * Run axe and split what it found by impact.
 *
 * `include` scopes the scan to one subtree. The surfaces spec needs it: every one of its
 * tests opens a drawer or a modal over a fully-rendered view, and an unscoped scan would
 * re-report that view's findings once per surface, burying the thing under test.
 * @param {import('playwright').Page} page - The page to scan.
 * @param {{include?: string}} [options] - `include` scopes the scan to a selector's subtree.
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
 * Register one axe test per dashboard view.
 *
 * The desktop and touch passes differ only in their context overrides, so the sweep itself
 * — what counts as rendered, what is scanned, what is reported — lives here with the rule
 * list rather than being written out once per modality. A change to the readiness wait then
 * reaches both passes instead of leaving one scanning a half-drawn view.
 * @param {import('./test.js').test} test - The spec file's own test function, so the tests register against it.
 * @param {{label?: string, views?: {[app: string]: string[]}, scheme?: 'light'|'dark'}} [options] -
 *     `label` distinguishes the pass in test titles and console output; `views` narrows the
 *     sweep to a subset of `VIEWS`; `scheme` seeds the colour-scheme preference
 *     (`colorSchemeService.js` reads it before first paint) so the pass runs on that surface.
 */
export function sweepViews(test, { label = '', views: sweptViews = VIEWS, scheme } = {}) {
    const suffix = label ? ` on ${label}` : '';
    const tag = label ? `axe ${label}` : 'axe';

    for (const [app, views] of Object.entries(sweptViews)) {
        for (const view of views) {
            test(`${app} ${view} view has no serious or critical axe violations${suffix}`, async ({
                context,
                page,
            }) => {
                if (scheme) {
                    await context.addInitScript(
                        (value) => localStorage.setItem('tba3_color_scheme', value),
                        scheme,
                    );
                }
                await gotoApp(page, `/${app}/#${view}`);
                await page
                    .locator('.view-base')
                    .first()
                    .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
                // The cold-start shell fades over the first view and is removed once
                // the view has painted; a scan that catches it mid-fade measures its
                // status line against a blended background.
                await page
                    .locator('#app-skeleton')
                    .waitFor({ state: 'detached', timeout: LOAD_TIMEOUT });

                const { blocking, advisory } = await runAxe(page);
                if (advisory.length) {
                    console.log(`[${tag}] ${app}/${view} advisory:\n  ${advisory.join('\n  ')}`);
                }
                expect(blocking, `${app}/${view}${suffix}`).toEqual([]);
            });
        }
    }
}

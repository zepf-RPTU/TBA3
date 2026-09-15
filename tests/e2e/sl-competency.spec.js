/**
 * E2E test: SL competency chart — behavior-preservation guard.
 *
 * The SL competency chart is the heaviest chart code in the repo and has no other
 * automated coverage. This spec guards the rendered behavior of BOTH renderers
 * across a refactor (dead-code removal, shared-helper dedup, and decomposition of
 * the detail renderer):
 *
 *   1. Welcome view — CompetencyOverviewRenderer: distribution bars render and the
 *      interactive HTML legend (subject toggle + Kompetenzstufen toggle) mutates the
 *      chart (subject groups hide / KS segments re-stack via animated transitions).
 *   2. Overview grids — CompetencyDetailRenderer (compact previews): the thumbnail
 *      cards paint competency bars (multi-domain grouping + teaching-quality geometry).
 *   3. Detail overlay — CompetencyDetailRenderer (full mode): clicking a competency
 *      card opens the overlay with a full chart (bars + axes + HTML legend pills).

 *
 * Note: the boxplot teaching-quality path is reached only when vizMode is 'boxplot'
 * (default is 'stacked_bar') and the viz-mode control is hidden in the overview
 * charts view, so that path stays under manual smoke coverage, not this spec.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';
import {
    UPDATE_TIMEOUT,
    WELCOME_CHART,
    SUMMARY_ROW,
    KS_SEGMENT,
    COMPETENCY_CARD,
    OVERLAY,
    gotoOverviewCharts,
    gotoWelcome,
    dismissGlossaryPopup,
    expectPillHidesAndRestores,
} from './support/slCompetencyChart.js';

describe('SL competency chart', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/sl/');
        // Überblick (summary) is the default view; let it finish transitioning
        // before any test interacts or navigates away.
        await page
            .locator(`${SUMMARY_ROW} svg`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    });

    test('welcome distribution chart renders and legend toggles mutate it', async ({ page }) => {
        await gotoWelcome(page);

        const chart = page.locator(WELCOME_CHART);
        await chart
            .locator(KS_SEGMENT)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        const segments = chart.locator(KS_SEGMENT);

        // Toggling a subject legend pill hides its domain group(s), and restores them.
        await expectPillHidesAndRestores(
            page.locator('.legend-pill[data-type="subject"]').first(),
            segments,
        );

        // Toggling a Kompetenzstufen pill drops that level's segments and re-stacks
        // the remainder; toggling back must restore exactly what was there.
        await expectPillHidesAndRestores(
            page.locator('.legend-pill[data-type="competency-level"]').first(),
            segments,
        );
    });

    test('overview thumbnail previews render competency bars', async ({ page }) => {
        await gotoOverviewCharts(page);

        // Default overview state is by_subjects + charts → compact CompetencyDetailRenderer
        // previews behind the thumbnail cards. At least one must paint competency bars.
        const previewSegments = page.locator(`${COMPETENCY_CARD} ${KS_SEGMENT}`);
        await previewSegments.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        expect(await previewSegments.count()).toBeGreaterThan(0);
    });

    test('clicking a competency card opens the detail overlay with a full chart', async ({
        page,
    }) => {
        await gotoOverviewCharts(page);

        // Pick a card whose preview is a competency chart (skips the self-efficacy card).
        const card = page.locator(COMPETENCY_CARD, { has: page.locator(KS_SEGMENT) }).first();
        await card.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await card.click();

        // Full-mode detail renderer: overlay opens with bars + an HTML legend.
        const overlay = page.locator(OVERLAY);
        await overlay.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        // The chart svg is the one containing competency bars (not the overlay's icon svgs).
        const chartSvg = overlay.locator('svg:has(.bar-segment.competency-level)').first();
        await chartSvg
            .locator(KS_SEGMENT)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        expect(await overlay.locator('.legend-pill').count()).toBeGreaterThan(0);

        // Both legend groups, not one or the other. They are separate handlers
        // over separate state: domain pills redistribute whole bars, KS pills
        // re-stack segments *within* every bar. This used to pick the domain pill
        // whenever one existed and only fall back to a KS pill in single-domain
        // overlays, so on this dataset the detail renderer's KS path was never
        // reached at all.
        //
        // Note this fixture cannot catch a KS regression on its own — see the
        // no-Unterrichtsqualität test below for why.
        const segments = chartSvg.locator(KS_SEGMENT);

        if ((await overlay.locator('.legend-pill[data-type="domain"]').count()) > 0) {
            await expectPillHidesAndRestores(
                overlay.locator('.legend-pill[data-type="domain"]').first(),
                segments,
            );
        }

        await expectPillHidesAndRestores(
            overlay.locator('.legend-pill[data-type="competency-level"]').first(),
            segments,
        );
    });

    test('detail overlay legend pills fit their labels', async ({ page }) => {
        await gotoOverviewCharts(page);
        await page
            .locator(COMPETENCY_CARD, { has: page.locator(KS_SEGMENT) })
            .first()
            .click();
        const overlay = page.locator(OVERLAY);
        await overlay
            .locator('.legend-pill')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // Pill labels never wrap, so the panel has to grow to the widest one; a fixed
        // overlay width once clipped `RE = Rechtschreibung` at both ends.
        const clipped = await overlay
            .locator('.legend-pill')
            .evaluateAll((pills) =>
                pills
                    .filter((pill) => pill.scrollWidth > pill.clientWidth)
                    .map((pill) => pill.textContent),
            );
        expect(clipped).toEqual([]);
    });

    test('a hidden Kompetenzstufe takes its segment labels with it', async ({ page }) => {
        await gotoOverviewCharts(page);
        await page
            .locator(COMPETENCY_CARD, { has: page.locator(KS_SEGMENT) })
            .first()
            .click();
        const overlay = page.locator(OVERLAY);
        const labelledSegment = overlay.locator('.bar-segment-group:has(text.bar-label)');
        await labelledSegment.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        const levelClass = await labelledSegment
            .first()
            .locator(KS_SEGMENT)
            .evaluate((rect) => [...rect.classList].find((name) => name.startsWith('level-')));
        const pill = overlay.locator(
            `.legend-pill[data-type="competency-level"][data-value="${levelClass.slice('level-'.length)}"]`,
        );

        /** Per labelled segment: collapsed → label gone; drawn → label shown inside it. */
        const labelState = () =>
            overlay.locator('.bar-segment-group:has(text.bar-label)').evaluateAll((groups) =>
                groups.map((group) => {
                    const rect = group.querySelector('rect.bar-segment');
                    const label = group.querySelector('text.bar-label');
                    const opacity = getComputedStyle(label).opacity;
                    if (Number(rect.getAttribute('height')) === 0) return opacity === '0';
                    const segmentBox = rect.getBoundingClientRect();
                    const labelBox = label.getBoundingClientRect();
                    const labelCentre = labelBox.top + labelBox.height / 2;
                    return (
                        opacity === '1' &&
                        labelCentre >= segmentBox.top &&
                        labelCentre <= segmentBox.bottom
                    );
                }),
            );

        await dismissGlossaryPopup(page);
        await pill.click();
        await expect(pill).toHaveAttribute('aria-pressed', 'false', { timeout: UPDATE_TIMEOUT });
        await expect
            .poll(async () => (await labelState()).every(Boolean), { timeout: UPDATE_TIMEOUT })
            .toBe(true);
    });

    test('a Selbstwirksamkeit row pill hides its row and restores it', async ({ page }) => {
        await gotoOverviewCharts(page);

        // Card 0 is Selbstwirksamkeit; its overlay is the horizontal stacked bar
        // whose HTML legend carries one `row` pill per class. This is the third
        // chart on the shared HtmlLegendController and had no coverage before.
        await page.locator(COMPETENCY_CARD).nth(0).click();
        const overlay = page.locator(OVERLAY);
        await overlay.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const rowPill = overlay.locator('.legend-pill[data-type="row"]').first();
        await rowPill.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const chartSvg = overlay.locator('svg:has(.bar-segment)').first();

        // Hiding a row re-bands the remaining rows taller; restoring must return
        // every segment to its exact starting size.
        await expectPillHidesAndRestores(rowPill, chartSvg.locator('.bar-segment'));
    });

    /**
     * Legend state outlives the render. A resize rebuilds the SVG and the panel;
     * before the controller, the overview re-seeded everything visible on every
     * render, so a viewer's toggles vanished on the first window resize.
     */
    test('a hidden Fach stays hidden across a resize re-render', async ({ page }) => {
        await gotoWelcome(page);
        const chart = page.locator(WELCOME_CHART);
        await chart
            .locator(KS_SEGMENT)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        const pill = page.locator('.legend-pill[data-type="subject"]').first();
        const subject = await pill.getAttribute('data-value');
        await dismissGlossaryPopup(page);
        await pill.click();
        await expect(pill).toHaveAttribute('aria-pressed', 'false', { timeout: UPDATE_TIMEOUT });

        const widthBefore = (await chart.locator('svg').first().boundingBox())?.width;
        await page.setViewportSize({ width: 960, height: 900 });
        // The chart sizes off its container: a new SVG width proves the re-render ran.
        await expect
            .poll(async () => (await chart.locator('svg').first().boundingBox())?.width, {
                timeout: UPDATE_TIMEOUT,
            })
            .not.toBe(widthBefore);

        const rebuiltPill = page.locator(
            `.legend-pill[data-type="subject"][data-value="${subject}"]`,
        );
        await expect(rebuiltPill).toHaveAttribute('aria-pressed', 'false', {
            timeout: UPDATE_TIMEOUT,
        });
        // ...and the fresh SVG honours it: that Fach's domain groups are not drawn.
        await expect
            .poll(
                () =>
                    chart.locator('.domain-group').evaluateAll((groups, hidden) => {
                        const own = groups.filter(
                            (group) => /** @type {any} */ (group).__data__?.subject === hidden,
                        );
                        return (
                            own.length > 0 &&
                            own.every((group) => getComputedStyle(group).display === 'none')
                        );
                    }, subject),
                { timeout: UPDATE_TIMEOUT },
            )
            .toBe(true);
    });
});

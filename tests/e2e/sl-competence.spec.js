/**
 * E2E test: SL competence chart — the rendered behaviour of both renderers.
 *
 *   1. Gesamtbild view (CompetenceOverviewRenderer): the distribution bars and their
 *      HTML legend's toggles.
 *   2. Detail overlay (CompetenceDetailRenderer, full mode): the chart a competence
 *      thumbnail card opens, with its legend pills and its box-plot mode.
 */

import { test, expect } from './support/test.js';
import { LOAD_TIMEOUT_MS } from './support/app.js';
import {
    MATRIX_CHART,
    COMPETENCE_LEVEL_SEGMENT,
    COMPETENCE_CARD,
    OVERLAY,
    gotoDetailsCharts,
    gotoMatrix,
    openCompetenceOverlay,
    openGroupsCardOverlay,
    clickLegendPill,
    domainLegendPills,
    expectPillHidesAndRestores,
    legendSectionPills,
} from './support/slCompetenceChart.js';
import { selectMode } from './support/modes.js';
import { waitForSettled } from './support/settle.js';

test.describe('SL competence chart', () => {
    test('Gesamtbild distribution chart renders and legend toggles mutate it', async ({ page }) => {
        await gotoMatrix(page);

        const segments = page.locator(MATRIX_CHART).locator(COMPETENCE_LEVEL_SEGMENT);
        const legend = page.locator('body');
        const comparisonPills = legendSectionPills(legend, 'Vergleich');

        await expect(comparisonPills.filter({ hasText: 'Schulschnitt' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        const offPills = comparisonPills
            .filter({ hasNotText: 'Schulschnitt' })
            .or(legendSectionPills(legend, 'Lerngruppen'));
        expect(await offPills.count()).toBeGreaterThan(0);
        await expect(offPills.and(page.locator('[aria-pressed="true"]'))).toHaveCount(0);

        // A Lerngruppe's own pill, not the block's master pill.
        await expectPillHidesAndRestores(
            legendSectionPills(legend, 'Lerngruppen')
                .and(page.locator(':not([data-toggle-section])'))
                .first(),
            segments,
            { startsPressed: false },
        );

        await expectPillHidesAndRestores(legendSectionPills(legend, 'Fächer').first(), segments);

        await expectPillHidesAndRestores(
            legendSectionPills(legend, 'Kompetenzstufen').first(),
            segments,
        );
    });

    test('clicking a competence card opens the detail overlay with a full chart', async ({
        page,
    }) => {
        const overlay = await openCompetenceOverlay(page);
        await overlay.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        // The svg holding competence bars, not one of the overlay's icon svgs.
        const chartSvg = overlay.locator(`svg:has(${COMPETENCE_LEVEL_SEGMENT})`).first();
        await chartSvg
            .locator(COMPETENCE_LEVEL_SEGMENT)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        // Both legend groups: they are separate handlers over separate state. Domain
        // pills redistribute whole bars, competence-level pills re-stack segments within
        // every bar.
        const segments = chartSvg.locator(COMPETENCE_LEVEL_SEGMENT);

        await expect(domainLegendPills(overlay).first()).toBeVisible();
        await expectPillHidesAndRestores(domainLegendPills(overlay).first(), segments);

        await expectPillHidesAndRestores(
            legendSectionPills(overlay, 'Kompetenzstufen').first(),
            segments,
        );
    });

    test('a hidden Kompetenzstufe takes its segment labels with it', async ({ page }) => {
        const overlay = await openCompetenceOverlay(page);
        // Every segment carries a label; a labelled one has text in it.
        const labelledSegment = overlay.locator(
            '.bar-segment-group:has(text.value-label:not(:empty))',
        );
        await labelledSegment.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        // The segment's Kompetenzstufe, matched to its pill as a reader does: by the band
        // colour the segment and the pill's swatch share.
        const bandColor = await labelledSegment
            .first()
            .locator(COMPETENCE_LEVEL_SEGMENT)
            .evaluate((rect) =>
                /** @type {SVGElement} */ (rect).style.getPropertyValue(
                    '--competence-level-band-color',
                ),
            );
        expect(bandColor).not.toBe('');
        const levelPills = legendSectionPills(overlay, 'Kompetenzstufen');
        const pillIndex = await levelPills.evaluateAll(
            (pills, color) =>
                pills.findIndex(
                    (pill) =>
                        /** @type {HTMLElement|null} */ (
                            pill.querySelector('.legend-swatch')
                        )?.style.getPropertyValue('--competence-level-band-color') === color,
                ),
            bandColor,
        );
        expect(pillIndex).toBeGreaterThanOrEqual(0);
        const pill = levelPills.nth(pillIndex);

        /** Per labelled segment: collapsed → label gone; drawn → label shown inside it. */
        const labelState = () =>
            overlay
                .locator('.bar-segment-group:has(text.value-label:not(:empty))')
                .evaluateAll((groups) =>
                    groups.map((group) => {
                        // Both are there: the locator matched the group by its label, and
                        // every segment group draws its rect.
                        const rect = /** @type {Element} */ (
                            group.querySelector('rect.bar-segment')
                        );
                        const label = /** @type {Element} */ (
                            group.querySelector('text.value-label')
                        );
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

        await clickLegendPill(pill);
        await expect(pill).toHaveAttribute('aria-pressed', 'false');
        await expect.poll(async () => (await labelState()).every(Boolean)).toBe(true);
    });

    test('a legend toggle keeps the Unterrichtsqualität column half its slot and centred', async ({
        page,
    }) => {
        const overlay = await openCompetenceOverlay(page);
        const slots = overlay.locator('.sub-bar-teachingQuality:has(.tq-bars)');
        await slots.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        // Per slot, from the attributes the toggle transitions: the `Q` tag sits at the
        // slot centre, so the column must be as wide as that offset (half the slot)
        // and centred on it. The slot width itself is the rounded `Q` offset.
        const slotGeometry = () =>
            slots.evaluateAll((nodes) =>
                nodes.map((slot) => {
                    // The slot was matched by its `.tq-bars`, which draws the `Q` tag,
                    // the bar and its translate.
                    const centre = Number(
                        /** @type {Element} */ (
                            slot.querySelector('text.teaching-quality-label')
                        ).getAttribute('x'),
                    );
                    const width = Number(
                        /** @type {Element} */ (
                            slot.querySelector('.tq-bars rect.bar-segment')
                        ).getAttribute('width'),
                    );
                    const transform = /** @type {string} */ (
                        /** @type {Element} */ (slot.querySelector('.tq-bars')).getAttribute(
                            'transform',
                        )
                    );
                    const offset = Number(
                        /** @type {RegExpExecArray} */ (/translate\(([^,]+),/.exec(transform))[1],
                    );
                    return {
                        slot: Math.round(centre * 2),
                        halfWidth: Math.abs(width - centre) < 0.5,
                        centred: Math.abs(offset + width / 2 - centre) < 0.5,
                    };
                }),
            );
        /**
         * @param {Array<{slot: number, halfWidth: boolean, centred: boolean}>} geometry
         */
        const expectHalfAndCentred = (geometry) => {
            expect(geometry.length).toBeGreaterThan(0);
            for (const { halfWidth, centred } of geometry) {
                expect(halfWidth).toBe(true);
                expect(centred).toBe(true);
            }
        };

        const before = await slotGeometry();
        expectHalfAndCentred(before);

        const domainPill = domainLegendPills(overlay).first();
        const pill =
            (await domainPill.count()) > 0
                ? domainPill
                : legendSectionPills(overlay, 'Vergleich').first();
        await clickLegendPill(pill);
        await expect(pill).toHaveAttribute('aria-pressed', 'false');

        // Hiding a bar widens the rest, the Unterrichtsqualität slot included.
        await expect
            .poll(async () => (await slotGeometry())[0].slot)
            .toBeGreaterThan(before[0].slot);
        const hidden = await slotGeometry();
        expectHalfAndCentred(hidden);

        // Restoring narrows it again — not to the exact starting width, because the
        // chart can re-render at a slightly different size between the two clicks.
        await pill.click();
        await expect.poll(async () => (await slotGeometry())[0].slot).toBeLessThan(hidden[0].slot);
        expectHalfAndCentred(await slotGeometry());
    });

    test('a Selbstwirksamkeit row pill hides its row and restores it', async ({ page }) => {
        await gotoDetailsCharts(page);

        // Card 0 is Selbstwirksamkeit; its overlay is the horizontal stacked bar whose
        // HTML legend carries one `row` pill per group.
        await page.locator(COMPETENCE_CARD).nth(0).click();
        const overlay = page.locator(OVERLAY);
        await overlay.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const rowPill = legendSectionPills(overlay, 'Lerngruppen').first();
        await rowPill.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const chartSvg = overlay.locator('svg:has(.bar-segment)').first();

        // Hiding a row re-bands the remaining rows taller.
        await expectPillHidesAndRestores(rowPill, chartSvg.locator('.bar-segment'));
    });

    test('the group labels below the axis do not run into each other', async ({ page }) => {
        // The school card groups its bars by Fach and draws each Fach's name unfitted under
        // its group, so even a one-Domäne Fach needs a group as wide as its name.
        await gotoDetailsCharts(page);
        const overlay = await openGroupsCardOverlay(page);
        const labels = overlay.locator('.x-axis-custom text.axis-tick-label');
        await labels.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        /** Per neighbouring pair of shown labels: the horizontal gap between their boxes. */
        const gaps = () =>
            labels.evaluateAll((nodes) => {
                const boxes = nodes
                    .filter((node) => getComputedStyle(node).opacity !== '0')
                    .map((node) => node.getBoundingClientRect())
                    .sort((a, b) => a.left - b.left);
                return boxes.slice(1).map((box, i) => box.left - boxes[i].right);
            });

        // Some pair shown, all clear: `Math.min()` of no gaps is Infinity, which would pass.
        const labelsClear = async () => {
            const shown = await gaps();
            return shown.length > 0 && Math.min(...shown) > 0;
        };
        await waitForSettled(page);
        await expect.poll(labelsClear).toBe(true);

        // A toggle lays the bars out again, and the labels must still clear.
        // The comparisons start off there, so the first pill's toggle shows them.
        const pill = legendSectionPills(overlay, 'Vergleich').first();
        await expect(pill).toHaveAttribute('aria-pressed', 'false');
        await clickLegendPill(pill);
        await expect(pill).toHaveAttribute('aria-pressed', 'true');
        await waitForSettled(page);
        await expect.poll(labelsClear).toBe(true);
    });

    test('a Fach pill hides its group when the bars group by Fach', async ({ page }) => {
        // The by-groups cards each show one Lerngruppe (or the school) across its Fächer.
        await gotoDetailsCharts(page);
        const overlay = await openGroupsCardOverlay(page);
        const shownGroups = () =>
            overlay
                .locator('.x-axis-custom text.axis-tick-label')
                .evaluateAll(
                    (nodes) =>
                        nodes.filter((node) => getComputedStyle(node).opacity !== '0').length,
                );
        await expect.poll(shownGroups).toBeGreaterThan(1);
        const before = await shownGroups();

        const pill = legendSectionPills(overlay, 'Fächer').first();
        await clickLegendPill(pill);
        await expect(pill).toHaveAttribute('aria-pressed', 'false');
        await expect.poll(shownGroups).toBe(before - 1);

        await pill.click();
        await expect.poll(shownGroups).toBe(before);
    });

    test('the Balken/Boxplot switch is offered on the charts grid and the overlay draws box plots', async ({
        page,
    }) => {
        // Switched on the charts grid itself, not through the tables: the overlay's
        // Unterrichtsqualität draws box figures, and its Selbstwirksamkeit strip takes
        // the box plot's height.
        await gotoDetailsCharts(page);
        await selectMode(page, 'boxplot');
        const overlay = await openGroupsCardOverlay(page);

        await expect(overlay.locator('g.box-figure').first()).toBeAttached({
            timeout: LOAD_TIMEOUT_MS,
        });
        // The box plot's strip height, not the bar's.
        const strip = overlay.locator('.overlay-panel--sp');
        await expect
            .poll(() =>
                strip.evaluate(
                    (node) =>
                        parseFloat(getComputedStyle(node).height) /
                        parseFloat(getComputedStyle(document.documentElement).fontSize),
                ),
            )
            .toBe(13.5);
    });

    // A resize rebuilds the SVG and the legend panel.
    test('a hidden Fach stays hidden across a resize re-render', async ({ page }) => {
        await gotoMatrix(page);
        const chart = page.locator(MATRIX_CHART);

        const subjectPills = legendSectionPills(page.locator('body'), 'Fächer');
        const pill = subjectPills.first();
        // A Fach pill is labelled with the Fach.
        const subject = (await pill.textContent())?.trim();
        await clickLegendPill(pill);
        await expect(pill).toHaveAttribute('aria-pressed', 'false');

        const widthBefore = (await chart.locator('svg.chart-root').first().boundingBox())?.width;
        await page.setViewportSize({ width: 1024, height: 900 });
        // The chart sizes off its container: a new SVG width proves the re-render ran.
        await expect
            .poll(async () => (await chart.locator('svg.chart-root').first().boundingBox())?.width)
            .not.toBe(widthBefore);

        const rebuiltPill = subjectPills.filter({ hasText: new RegExp(`^\\s*${subject}\\s*$`) });
        await expect(rebuiltPill).toHaveAttribute('aria-pressed', 'false');
        // The fresh SVG honours it: that Fach's domain groups are not drawn.
        await expect
            .poll(() =>
                chart.locator('.domain-group').evaluateAll((groups, hidden) => {
                    const own = groups.filter(
                        (group) =>
                            // d3 keeps a node's bound datum on `__data__`.
                            /** @type {Element & {__data__?: {subject?: string}}} */ (group)
                                .__data__?.subject === hidden,
                    );
                    return (
                        own.length > 0 &&
                        own.every((group) => getComputedStyle(group).display === 'none')
                    );
                }, subject),
            )
            .toBe(true);
        // The re-applied toggle rebuilds the axis labels without animation; they must
        // come back opaque — one per Fach/Domäne still drawn — not stuck at a fade's start.
        const labelOpacities = () =>
            chart
                .locator('.x-axis-custom .overview-axis-label')
                .evaluateAll((labels) => labels.map((label) => getComputedStyle(label).opacity));
        await expect.poll(async () => (await labelOpacities()).length).toBeGreaterThan(0);
        expect(new Set(await labelOpacities())).toEqual(new Set(['1']));
    });
});

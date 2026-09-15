// @vitest-browser

/**
 * SL competency detail — what a legend toggle does to the drawn bars.
 *
 * `applyDetailLegendState` reads the SVG the render left behind: the wrapper `g`'s datum
 * for the bar pitch, `data-sub-key` on every sub-bar, and each bar group's distribution.
 * These tests build exactly that much SVG and pin which bars a hidden Domäne, a hidden
 * comparison track and a hidden Kompetenzstufe collapse — and that turning the pill back
 * on restores them. Real d3 transitions, so every assertion waits for them to land.
 */

import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { applyDetailLegendState } from '@tba3/modules/sl/modules/charts/competency/detail/competencyDetailVisibility.js';

const BY_DOMAIN = { groupBySubject: false, groupByDomain: true };
const BY_SUBJECT = { groupBySubject: true, groupByDomain: false };

/** The pitch between bars of the single-domain fixture, in px. */
const BAR_PITCH = 60;

/** The pitch between sub-bars of the multi-domain fixture, in px. */
const SUB_BAR_PITCH = 33;

/** @type {HTMLElement|null} The fixture container, removed after each test. */
let container = null;

/**
 * Mount a container with an `svg` and the wrapper `g` the render leaves its geometry on.
 * @param {object} storedData - The datum the bar redistribution reads the pitch from.
 * @returns {{containerId: string, area: d3.Selection}} The container id and the wrapper group.
 */
function mountChart(storedData) {
    const containerId = 'detail-visibility-fixture';
    container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
    const area = d3
        .select(container)
        .append('svg')
        .append('g')
        .attr('class', 'chart-area')
        .datum(storedData);
    return { containerId, area };
}

/**
 * Let d3's timer queue run so a zero-duration transition has written its attributes.
 * @returns {Promise<void>} Resolves once the transitions have landed.
 */
function settle() {
    return new Promise((resolve) => setTimeout(resolve, 60));
}

/**
 * Apply a legend state to the fixture and wait for the transitions.
 * @param {object} renderer - The renderer stand-in (`containerId`, `chartData`).
 * @param {object} state - The legend state.
 * @param {object} context - The apply context, passed through unchanged.
 * @returns {Promise<void>} Resolves once the chart has settled.
 */
async function apply(renderer, state, context) {
    applyDetailLegendState(renderer, state, { duration: 0, ...context });
    await settle();
}

/**
 * The opacity every bar of a selection carries, in document order. Read computed rather
 * than inline: d3 skips a transition whose target equals the current value, so a bar that
 * was never hidden keeps an empty inline style while still rendering fully opaque.
 * @param {string} selector - The bar selector to read.
 * @returns {string[]} One opacity per matched element.
 */
function opacities(selector) {
    return Array.from(container.querySelectorAll(selector)).map(
        (el) => getComputedStyle(el).opacity,
    );
}

/**
 * The transform every bar of a selection carries, in document order.
 * @param {string} selector - The bar selector to read.
 * @returns {Array<string|null>} One transform attribute per matched element.
 */
function transforms(selector) {
    return Array.from(container.querySelectorAll(selector)).map((el) =>
        el.getAttribute('transform'),
    );
}

afterEach(() => {
    container?.remove();
    container = null;
});

describe('applyDetailLegendState — Domänen pills', () => {
    /**
     * Three bars of one Fach over two Domänen — the single-domain path (no `.domain-group`
     * and no `.sub-bar-group`), where each bar takes its row from `chartData` by index.
     * @returns {{renderer: object, context: object}} The stand-in and the apply context.
     */
    function mountDomainBars() {
        const chartData = [
            { type: 'class', name: '8a', subject: 'en', domainLabel: 'Hören' },
            { type: 'class', name: '8a', subject: 'en', domainLabel: 'Lesen' },
            { type: 'school', name: 'Schule', subject: 'en', domainLabel: 'Hören' },
        ];
        const { containerId, area } = mountChart({ barWidthWithPadding: BAR_PITCH });
        chartData.forEach((_row, index) => {
            area.append('g')
                .attr('class', 'bar-group')
                .attr('transform', `translate(${index * BAR_PITCH}, 0)`);
        });
        return {
            renderer: { containerId, chartData },
            context: {
                groupingConfig: BY_DOMAIN,
                ksLevelToGroup: null,
                yScale: null,
                group: 'domain',
            },
        };
    }

    it('collapses the bars of a hidden Domäne and closes the gap they leave', async () => {
        const { renderer, context } = mountDomainBars();

        await apply(renderer, { domain: { 'en|Lesen': false } }, context);

        expect(opacities('.bar-group')).toEqual(['1', '0', '1']);
        expect(transforms('.bar-group')).toEqual([
            'translate(0, 0)',
            `translate(${BAR_PITCH}, 0)`,
            'translate(90, 0)',
        ]);
    });

    it('restores every bar at its original pitch when the pill goes back on', async () => {
        const { renderer, context } = mountDomainBars();

        await apply(renderer, { domain: { 'en|Lesen': false } }, context);
        await apply(renderer, { domain: { 'en|Lesen': true } }, context);

        expect(opacities('.bar-group')).toEqual(['1', '1', '1']);
        expect(transforms('.bar-group')).toEqual([
            'translate(0, 0)',
            `translate(${BAR_PITCH}, 0)`,
            `translate(${BAR_PITCH * 2}, 0)`,
        ]);
    });
});

describe('applyDetailLegendState — Vergleich pills', () => {
    /**
     * One Fach group of three typed sub-bars — the multi-domain path, where every sub-bar
     * names itself through `data-sub-key` rather than through a row index.
     * @returns {{renderer: object, context: object}} The stand-in and the apply context.
     */
    function mountTypeBars() {
        const chartData = [
            { type: 'landesschnitt', renderKey: 'state:nw', name: 'Landesschnitt', subject: 'en' },
            { type: 'school', name: 'Schule', subject: 'en' },
            { type: 'class', name: '8a', subject: 'en' },
        ];
        const { containerId, area } = mountChart({
            uniformBarWidth: 30,
            barWidthWithPadding: SUB_BAR_PITCH,
        });
        const domainGroup = area.append('g').attr('class', 'domain-group');
        ['state:nw', 'school', '8a'].forEach((subKey, index) => {
            domainGroup
                .append('g')
                .attr('class', 'sub-bar-group')
                .attr('data-sub-key', subKey)
                .attr('transform', `translate(${index * SUB_BAR_PITCH}, 0)`)
                .append('rect');
        });
        return {
            renderer: { containerId, chartData },
            context: {
                groupingConfig: BY_SUBJECT,
                ksLevelToGroup: null,
                yScale: null,
                group: 'comparison',
            },
        };
    }

    it('collapses only the track whose pill is off', async () => {
        const { renderer, context } = mountTypeBars();

        await apply(renderer, { comparison: { school: false } }, context);

        expect(opacities('.sub-bar-group')).toEqual(['1', '0', '1']);
    });

    it('collapses a state track by its own render key', async () => {
        const { renderer, context } = mountTypeBars();

        await apply(renderer, { comparison: { 'state:nw': false } }, context);

        expect(opacities('.sub-bar-group')).toEqual(['0', '1', '1']);
    });

    it('brings the track back when its pill goes on again', async () => {
        const { renderer, context } = mountTypeBars();

        await apply(renderer, { comparison: { school: false } }, context);
        await apply(renderer, { comparison: { school: true } }, context);

        expect(opacities('.sub-bar-group')).toEqual(['1', '1', '1']);
        expect(transforms('.sub-bar-group')).toEqual([
            'translate(0, 0)',
            `translate(${SUB_BAR_PITCH}, 0)`,
            `translate(${SUB_BAR_PITCH * 2}, 0)`,
        ]);
    });
});

describe('applyDetailLegendState — Kompetenzstufen swatches', () => {
    /**
     * One stacked bar carrying its distribution as a datum and, per band, the segment
     * group the render leaves: the rect and the label at the segment's first-paint
     * centre (A1 spans 0–40 %, A2 40–100 % of a 200 px scale).
     * @returns {{renderer: object, context: object}} The stand-in and the apply context.
     */
    function mountStackedBar() {
        const { containerId, area } = mountChart({ barWidthWithPadding: BAR_PITCH });
        const bar = area
            .append('g')
            .attr('class', 'bar-group')
            .datum({ distribution: { A1: 40, A2: 60 } });
        [
            ['A1', 160],
            ['A2', 60],
        ].forEach(([level, labelY]) => {
            const segment = bar.append('g').attr('class', 'bar-segment-group');
            segment
                .append('rect')
                .attr('class', 'bar-segment competency-level')
                .attr('data-level', level);
            segment.append('text').attr('class', 'bar-label').attr('y', labelY);
        });
        return {
            renderer: { containerId, chartData: [{ type: 'class', name: '8a' }] },
            context: {
                groupingConfig: BY_DOMAIN,
                ksLevelToGroup: new Map([
                    ['A1', 'A1'],
                    ['A2', 'A2'],
                ]),
                yScale: d3.scaleLinear().domain([0, 100]).range([200, 0]),
                group: 'competency-level',
            },
        };
    }

    /**
     * The stacked segment heights, keyed by band.
     * @returns {{[level: string]: number}} Per `data-level`, the rect height in px.
     */
    function segmentHeights() {
        return Object.fromEntries(
            Array.from(container.querySelectorAll('rect.bar-segment')).map((el) => [
                el.getAttribute('data-level'),
                Number(el.getAttribute('height')),
            ]),
        );
    }

    it('flattens the segments of a hidden Kompetenzstufe and re-stacks the rest', async () => {
        const { renderer, context } = mountStackedBar();

        await apply(renderer, { 'competency-level': { A2: false } }, context);

        const heights = segmentHeights();
        expect(heights.A2).toBe(0);
        expect(heights.A1).toBeGreaterThan(0);
    });

    it('restores both segments when the swatch goes back on', async () => {
        const { renderer, context } = mountStackedBar();

        await apply(renderer, { 'competency-level': { A2: false } }, context);
        await apply(renderer, { 'competency-level': {} }, context);

        const heights = segmentHeights();
        expect(heights.A1).toBeGreaterThan(0);
        expect(heights.A2).toBeGreaterThan(0);
    });

    it('fades out the label of a hidden Kompetenzstufe and moves the rest with their segments', async () => {
        const { renderer, context } = mountStackedBar();

        await apply(renderer, { 'competency-level': { A1: false } }, context);

        // A2 re-stacks onto the baseline: its centre drops from 70 % to 30 %, 80 px.
        expect(opacities('.bar-label')).toEqual(['0', '1']);
        expect(transforms('.bar-label')[1]).toBe('translate(0, 80)');
    });

    it('puts every label back when the swatch goes on again', async () => {
        const { renderer, context } = mountStackedBar();

        await apply(renderer, { 'competency-level': { A1: false } }, context);
        await apply(renderer, { 'competency-level': {} }, context);

        expect(opacities('.bar-label')).toEqual(['1', '1']);
        expect(transforms('.bar-label')).toEqual(['translate(0, 0)', 'translate(0, 0)']);
    });
});

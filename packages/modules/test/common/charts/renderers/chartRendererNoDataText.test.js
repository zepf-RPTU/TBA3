// @vitest-browser

/**
 * Where a chart's "no data" wording comes from.
 *
 * `ChartRenderer` shows three of these: the no-data and error messages that replace the
 * chart, and the in-plot `renderNoDataOverlay`. The two whole-card ones default from the
 * glossary, so a literal there would make one card say something the glossary does not;
 * the overlay is always told why its plot is empty.
 *
 * These tests pin the entries, not the sentences: the copy is the
 * glossary's to change, the *source* is not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartRenderer } from '../../../../src/common/charts/renderers/chartRenderer.js';
import { makeVisibleChartContainer } from '../../../support/chartHarness.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';

/** @type {import('../../../../src/common/context/index.js').ModuleContext} */
let context;

/**
 * A renderer bound to a live container.
 * @template {ChartRenderer} R
 * @param {new (container: HTMLElement, options: any) => R} Renderer
 * @returns {{renderer: R, container: HTMLElement}}
 */
function makeRenderer(Renderer) {
    const container = makeVisibleChartContainer(
        `no-data-text-${Math.random().toString(36).slice(2)}`,
        { widthPx: 400, heightPx: 300 },
    );
    return { renderer: new Renderer(container, { context, autoResize: false }), container };
}

class EmptyChart extends ChartRenderer {
    /** @override */
    validateData() {
        return false;
    }
}

class FailingChart extends ChartRenderer {
    /** @override */
    validateData() {
        return true;
    }
    /** @override */
    renderChart() {
        throw new Error('probe failure');
    }
}

class OverlayChart extends ChartRenderer {
    /** Whether the next pass finds its plot empty. */
    empty = true;
    /** @override */
    validateData() {
        return true;
    }
    /** @override */
    renderChart() {
        this.initializeSVG({ left: 40, top: 10 });
        if (this.empty) this.renderNoDataOverlay('Keine Lösungsquoten für dieses Fach');
    }
}

beforeEach(() => {
    context = createTestContext('en');
});

describe('ChartRenderer no-data wording', () => {
    it('takes the HTML message from general.messages.no-data', () => {
        const { renderer, container } = makeRenderer(EmptyChart);

        renderer.create();

        expect(container.textContent).toBe(
            context.glossary.getRequiredEntryText('general.messages.no-data'),
        );
    });

    it('takes the error message from general.messages.chart-error, in the error look', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { renderer, container } = makeRenderer(FailingChart);

        renderer.create();

        const message = container.querySelector('.chart-message');
        expect(message?.textContent).toBe(
            context.glossary.getRequiredEntryText('general.messages.chart-error'),
        );
        expect(message?.classList.contains('chart-message--error')).toBe(true);
    });

    it('lays the overlay over the plot area, beside the SVG it keeps, until a pass with marks', () => {
        // WHY the geometry: the message is HTML beside the SVG, so it has to find the
        // plot through the container's padding and whatever sits above the SVG.
        const { renderer, container } = makeRenderer(OverlayChart);
        container.style.padding = '12px';

        renderer.create();

        const message = /** @type {HTMLElement} */ (
            container.querySelector('.chart-message--inline')
        );
        const svgBox = required(renderer.svg?.node()).getBoundingClientRect();
        const box = message.getBoundingClientRect();
        const { x, y, width, height } = required(renderer.layout).chart;
        expect(message.textContent).toBe('Keine Lösungsquoten für dieses Fach');
        expect(container.querySelector('svg')).not.toBeNull();
        expect([box.left - svgBox.left, box.top - svgBox.top, box.width, box.height]).toEqual([
            x,
            y,
            width,
            height,
        ]);

        renderer.empty = false;
        renderer.refresh();
        expect(container.querySelector('.chart-message')).toBeNull();
    });

    it('shows a renderer-specific reason when its data fails validation', () => {
        // The base applies `validateData()` before `renderChart()` ever runs, so the
        // reason has to come from the `noDataMessage()` hook, not from inside the render.
        class ReasonedEmptyChart extends ChartRenderer {
            /** @override */
            validateData() {
                return false;
            }
            /** @override */
            noDataMessage() {
                return 'Keine Klasse in diesem Fach';
            }
            /** @override */
            renderChart() {
                throw new Error('renderChart must not run for invalid data');
            }
        }
        const container = makeVisibleChartContainer(
            `no-data-reason-${Math.random().toString(36).slice(2)}`,
        );
        const renderer = new ReasonedEmptyChart(container, {
            context,
            autoResize: false,
            layout: { padding: {} },
        });

        renderer.create();

        expect(container.textContent).toBe('Keine Klasse in diesem Fach');
    });
});

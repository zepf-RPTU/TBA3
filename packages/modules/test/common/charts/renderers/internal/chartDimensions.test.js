// @vitest-browser
import { afterEach, describe, expect, it } from 'vitest';
import { getResponsiveChartDimensions } from '../../../../../src/common/charts/renderers/internal/chartDimensions.js';

/**
 * A 300×200 border-box container with 8px padding, its rounded client size stubbed: the
 * test browser runs without scrollbars, so a classic scrollbar's thickness (the gap
 * between `offsetHeight` and `clientHeight`) is simulated.
 * @param {{overflowX: string, scrollbarPx: number}} options
 * @returns {HTMLElement}
 */
function containerWith({ overflowX, scrollbarPx }) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        width: '300px',
        height: '200px',
        padding: '8px',
        boxSizing: 'border-box',
        overflowX,
    });
    document.body.append(container);
    Object.defineProperty(container, 'clientHeight', { value: 200 - scrollbarPx });
    return container;
}

describe('getResponsiveChartDimensions', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it('leaves the horizontal scrollbar of a chart wider than its card out of the height', () => {
        // The SVG fills the content box (`height: 100%`), which the scrollbar shrinks; a
        // plot laid out for the box without it loses its bottom edge (the x-axis title).
        const container = containerWith({ overflowX: 'auto', scrollbarPx: 15 });

        expect(getResponsiveChartDimensions(container, 640, 400)).toEqual({
            width: 284,
            height: 169,
        });
    });

    it('reads no scrollbar off a container that cannot scroll', () => {
        // Rounded client and offset sizes may disagree by a pixel without any scrollbar.
        const container = containerWith({ overflowX: 'visible', scrollbarPx: 1 });

        expect(getResponsiveChartDimensions(container, 640, 400)).toEqual({
            width: 284,
            height: 184,
        });
    });
});

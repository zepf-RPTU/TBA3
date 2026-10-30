// @vitest-browser

/**
 * Every empty or failed chart speaks through one element, so a screen reader hears
 * it (`role="status"`) and the look stays one card-wide pattern. The inline variant is the
 * sentence alone over a plot whose frame stays drawn — an icon there would sit on the axes.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { clearChartMessage, renderChartMessage } from '../../../src/common/charts/chartMessage.js';

/** @returns {HTMLElement} A live container. */
function makeContainer() {
    const container = document.createElement('div');
    container.className = 'chart-message-test';
    document.body.appendChild(container);
    return container;
}

afterEach(() => {
    document.querySelectorAll('.chart-message-test').forEach((node) => node.remove());
});

describe('renderChartMessage', () => {
    it('draws a whole-card empty state: an icon over the sentence, announced', () => {
        const container = makeContainer();

        const message = renderChartMessage(container, { text: 'Keine Daten' });

        expect(message.getAttribute('role')).toBe('status');
        expect(message.className).toBe('chart-message');
        expect(message.querySelector('svg.chart-message-icon')).not.toBeNull();
        expect(message.querySelector('p')?.textContent).toBe('Keine Daten');
    });

    it('marks a failure with the error modifier', () => {
        const container = makeContainer();

        const message = renderChartMessage(container, { text: 'Fehler', kind: 'error' });

        expect(message.classList.contains('chart-message--error')).toBe(true);
    });

    it('draws an inline message as the sentence alone, over the given box', () => {
        const container = makeContainer();

        const message = renderChartMessage(container, {
            text: 'Alles ausgeblendet',
            rect: { x: 30, y: 12, width: 200, height: 100 },
        });

        expect(message.classList.contains('chart-message--inline')).toBe(true);
        expect(message.querySelector('svg')).toBeNull();
        expect([message.style.left, message.style.top, message.style.width]).toEqual([
            '30px',
            '12px',
            '200px',
        ]);
    });

    it('replaces the message already there, and clears it', () => {
        const container = makeContainer();

        renderChartMessage(container, { text: 'Erste' });
        renderChartMessage(container, { text: 'Zweite' });
        expect(container.querySelectorAll('.chart-message')).toHaveLength(1);
        expect(container.textContent).toBe('Zweite');

        clearChartMessage(container);
        expect(container.querySelector('.chart-message')).toBeNull();
    });
});

/**
 * The look of a chart that has nothing to draw, or failed to: a centred sentence
 * in secondary ink. A whole-card message leads with an icon; an inline one is the
 * sentence alone, laid over the plot area of a chart whose frame stays drawn (every
 * series toggled off, a selection with no rows).
 */

import { createIcon } from '@tba3/module-base';
import { html, nothing, render } from 'lit';
import './chartMessage.css';

/**
 * @typedef {object} ChartMessageOptions
 * @property {string} text
 * @property {'empty'|'error'} [kind] - Nothing to draw, or the drawing failed.
 * @property {{x: number, y: number, width: number, height: number}} [rect] - The box to
 *   centre an inline message over, in px from the container's padding edge; without one
 *   the message fills the container, icon first.
 */

const ICONS = { empty: 'query_stats', error: 'warning' };

/**
 * Append a chart message to `container`, replacing any message already there.
 * @param {HTMLElement} container - The chart host (whole card) or a positioned container (inline).
 * @param {ChartMessageOptions} options
 * @returns {HTMLElement}
 */
export function renderChartMessage(container, { text, kind = 'empty', rect }) {
    clearChartMessage(container);

    const message = document.createElement('div');
    message.className = 'chart-message';
    message.classList.toggle('chart-message--error', kind === 'error');
    message.setAttribute('role', 'status');

    if (rect) {
        message.classList.add('chart-message--inline');
        Object.assign(message.style, {
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
        });
    }
    const icon = rect
        ? nothing
        : createIcon(ICONS[kind], { className: 'chart-message-icon', size: 48 });
    const sentence = html`<p>${text}</p>`;
    render(html`${icon}${sentence}`, message);

    container.append(message);
    return message;
}

/**
 * Remove the chart message `renderChartMessage` put into `container`, if any.
 * @param {HTMLElement} container
 */
export function clearChartMessage(container) {
    container.querySelector(':scope > .chart-message')?.remove();
}

/**
 * The SL two-card row: one chart card beside one text card, each a module (or an
 * empty card when there is none).
 */

import { html } from 'lit';

/**
 * @param {HTMLElement|null} chart - The chart card's module; null leaves the card empty.
 * @param {HTMLElement|null} text - The text card's module; null leaves the card empty.
 * @returns {import('lit').TemplateResult}
 */
export function chartsRowTemplate(chart, text) {
    return html`<div class="sl-charts-row">${card(chart, 'chart')}${card(text, 'text')}</div>`;
}

/**
 * One card of the row: the module with the card's classes, or an empty card.
 * @param {HTMLElement|null} module
 * @param {'chart'|'text'} kind
 * @returns {HTMLElement|import('lit').TemplateResult}
 */
function card(module, kind) {
    const classes = ['sl-charts-row-card', `sl-charts-row-card--${kind}`];
    if (!module) return html`<div class=${classes.join(' ')}></div>`;
    module.classList.add(...classes);
    return module;
}

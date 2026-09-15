// @vitest-browser

/**
 * Where a chart's "no data" wording comes from.
 *
 * `ChartRenderer` offers three of these and they used to disagree: `showNoDataMessage` and
 * `showErrorMessage` defaulted from the glossary, while `renderNoDataOverlay` — the SVG one
 * — carried the literal `'Keine Daten verfügbar'` in its options destructuring. That default
 * is reachable (`itemLollipopChart` calls it with no `message`), so one card said something
 * the glossary did not, and editing the entry moved two of the three.
 *
 * Fixed 2026-09-08. These tests pin the entries, not the sentences: the copy is the
 * glossary's to change, the *source* is not.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { ChartRenderer } from '@tba3/modules/common/charts/renderers/chartRenderer.js';
import { glossaryAnnotator } from '@tba3/modules/common/glossary/glossaryAnnotator.js';
import { initGlossaryForTests } from '../../../support/glossaryFixture.js';

/** @returns {{renderer: ChartRenderer, container: HTMLElement}} A renderer bound to a live container. */
function makeRenderer() {
    const container = document.createElement('div');
    container.id = `no-data-text-${Math.random().toString(36).slice(2)}`;
    document.body.appendChild(container);
    return { renderer: new ChartRenderer(container.id, { autoResize: false }), container };
}

beforeEach(() => initGlossaryForTests('en'));

describe('ChartRenderer no-data wording', () => {
    it('takes the HTML message from general.messages.no-data', () => {
        const { renderer, container } = makeRenderer();

        renderer.showNoDataMessage();

        expect(container.textContent).toBe(
            glossaryAnnotator.getRequiredEntryText('general.messages.no-data'),
        );
    });

    it('takes the SVG overlay from general.messages.no-data-short', () => {
        // WHY `-short` and not `no-data`: the overlay is one centred <text> node inside the
        // plot area, which the long "change the selection in the header" sentence overflows.
        const { renderer, container } = makeRenderer();
        const svg = d3.select(container).append('svg').append('g');

        renderer.renderNoDataOverlay(svg);

        expect(container.querySelector('.no-data-overlay text')?.textContent).toBe(
            glossaryAnnotator.getRequiredEntryText('general.messages.no-data-short'),
        );
    });

    it('lets a caller that knows the cause say so instead', () => {
        // The whole reason the default exists rather than the call being mandatory.
        const { renderer, container } = makeRenderer();
        const svg = d3.select(container).append('svg').append('g');

        renderer.renderNoDataOverlay(svg, { message: 'Keine Lösungsquoten für dieses Fach' });

        expect(container.querySelector('.no-data-overlay text')?.textContent).toBe(
            'Keine Lösungsquoten für dieses Fach',
        );
    });

    it('resolves both defaults, rather than reporting a missing entry', () => {
        // A renamed entry fails loud here instead of painting
        // "[Missing glossary entry: …]" into a chart.
        for (const key of ['general.messages.no-data', 'general.messages.no-data-short']) {
            expect(glossaryAnnotator.getRequiredEntryText(key)).not.toContain(
                'Missing glossary entry',
            );
        }
    });
});

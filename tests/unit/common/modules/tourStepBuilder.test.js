// @vitest-browser

import { describe, expect, it } from 'vitest';
import { html, render } from 'lit';
import { ContentModule } from '@tba3/module-base';
import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { buildTourSteps } from '../../../../src/common/modules/tutorial/tourStepBuilder.js';
import { mountModule } from '../../../../packages/modules/test/support/dom.js';
import { viewOptions } from '../../support/viewOptions.js';
import { createTestAppContext } from '../../support/glossaryFixture.js';

/**
 * A tour derived from a view anchors each card's step at the card the reader sees. The
 * page stays usable under the tour, so a layout switch can hide that card and show its
 * twin in the other mode while the step is up.
 */

const KEY = 'test.tour.card';

/** @type {import('../../../../src/common/modules/tutorial/glossaryTutorial.js').TourCopy} */
const COPY = {
    glossaryData: {
        test: {
            tour: {
                card: { title: 'Karte', tutorial: 'Erklärung' },
                domain: { title: 'Verteilung: {{Domäne}}', tutorial: 'Je Domäne' },
            },
            header: { title: '{{Fach}} VERA-8', tutorial: 'Kopf' },
        },
        general: { tour: { 'hover-help': { title: 'Hilfe', tutorial: 'Begriffe' } } },
    },
    glossary: createTestAppContext('en').glossary,
};

class Card extends ContentModule {
    /** @override */
    async _renderBody() {}
}
customElements.define('test-tour-card', Card);

/** A view holding one card's content in two layout modes, the second one hidden. */
class TwoModeView extends BaseViewModule {
    /** @override */
    async _renderView() {
        const split = Card.create('split-card', { glossaryKey: KEY });
        const chartOnly = Card.create('chart-only-card', { glossaryKey: KEY });
        chartOnly.hide();
        render(html`${split}${chartOnly}`, this);
    }
}
customElements.define('test-tour-two-mode-view', TwoModeView);

/** A view holding one entry twice, filled with a different domain each time. */
class PerDomainView extends BaseViewModule {
    /** @override */
    async _renderView() {
        const [first, second] = ['Hören', 'Lesen'].map((Domäne) =>
            Card.create(`card-${Domäne}`, {
                glossaryKey: 'test.tour.domain',
                glossaryReplacements: { Domäne },
            }),
        );
        render(html`${first}${second}`, this);
    }
}
customElements.define('test-tour-per-domain-view', PerDomainView);

/** A view whose first glossary term sits in a hidden part, the second on screen. */
class HiddenTermView extends BaseViewModule {
    /** @override */
    async _renderView() {
        render(
            html`<span hidden data-glossary-key="a">A</span><span data-glossary-key="b">B</span>`,
            this,
        );
    }
}
customElements.define('test-tour-hidden-term-view', HiddenTermView);

describe('buildTourSteps', () => {
    it('says a card shown in two modes once, and follows a mode switch to the shown one', async () => {
        const view = await mountModule(
            TwoModeView.create('view', /** @type {TwoModeView['options']} */ (viewOptions())),
        );
        const [split, chartOnly] = view.childModules;

        const steps = buildTourSteps(view, COPY, 'test.header', null).filter(
            (step) => step.title === 'Karte',
        );
        expect(steps).toHaveLength(1);
        expect(steps[0].getAnchor?.()).toBe(split);

        split.hide();
        chartOnly.show();

        expect(steps[0].getAnchor?.()).toBe(chartOnly);
        view.remove();
    });

    it('gives each card its own step when they fill one entry with different values', async () => {
        // One distribution entry serves both EN domains; the two cards are not twins.
        const view = await mountModule(
            PerDomainView.create('view', /** @type {PerDomainView['options']} */ (viewOptions())),
        );
        const [first, second] = view.childModules;

        const steps = buildTourSteps(view, COPY, 'test.header', null).filter((step) =>
            step.title.startsWith('Verteilung'),
        );

        expect(steps.map((step) => [step.title, step.getAnchor?.()])).toEqual([
            ['Verteilung: Hören', first],
            ['Verteilung: Lesen', second],
        ]);
        view.remove();
    });

    it('anchors the hover-help card at a glossary term the reader sees', async () => {
        const view = await mountModule(
            HiddenTermView.create('view', /** @type {HiddenTermView['options']} */ (viewOptions())),
        );

        const step = buildTourSteps(view, COPY, 'test.header', null).find(
            (s) => s.title === 'Hilfe',
        );

        expect(step?.getAnchor?.()?.dataset.glossaryKey).toBe('b');
        view.remove();
    });

    it("fills the app's header tokens into the header step, as the header does", async () => {
        // The welcome header names the payload's Fach; its tour card must not show the token.
        const view = await mountModule(
            HiddenTermView.create('view', /** @type {HiddenTermView['options']} */ (viewOptions())),
        );

        const [header] = buildTourSteps(view, COPY, 'test.header', { Fach: 'Englisch' });

        expect(header.title).toBe('Englisch VERA-8');
        // Before the data lands the token reads empty, and the title keeps no stray space.
        expect(buildTourSteps(view, COPY, 'test.header', {})[0].title).toBe('VERA-8');
        view.remove();
    });
});

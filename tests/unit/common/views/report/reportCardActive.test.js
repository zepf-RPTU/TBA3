// @vitest-browser

// A card's toolbar is revealed by hover on a pointer that has one; without hover a
// tap asks for it, and only one card may answer at a time. The toolbar is
// `width: max-content` at roughly twice the width of a half-span card, so two
// revealed at once overlap, and `.report-card` creates no stacking context at rest:
// which one takes a tap would come down to DOM order. The toolbar's last control
// removes the card from the report, so that is a wrong-card deletion.

import { beforeEach, describe, expect, it } from 'vitest';
import { flush, mountReportView, select } from '../../../support/reportFixture.js';
import { createTestAppOptions } from '../../../support/glossaryFixture.js';
import { queryAllHtml, queryHtml } from '../../../../../packages/modules/test/support/dom.js';
import { required } from '../../../../../packages/modules/test/support/required.js';

const appOptions = createTestAppOptions('en');
const { exportCart } = appOptions.context;

describe('report card toolbar reveal', () => {
    /** @type {import('../../../../../src/common/views/report/reportViewModule.js').ReportViewModule} */
    let view;

    /**
     * @param {string} id - The card's report item id.
     * @returns {Element|null}
     */
    const card = (id) => view.querySelector(`.report-card[data-report-item-id="${id}"]`);
    /**
     * @param {string} id
     * @param {string} selector
     * @returns {HTMLElement}
     */
    const cardPart = (id, selector) => queryHtml(required(card(id), `card ${id}`), selector);
    const activeIds = () =>
        queryAllHtml(view, '.report-card.is-active').map((el) => el.dataset.reportItemId);

    beforeEach(async () => {
        view = await mountReportView(appOptions, ['a']);
    });

    it('clears on a tap on the bare page background', () => {
        cardPart('a', '.report-card-image').click();
        expect(activeIds()).toEqual(['a']);

        queryHtml(view, '.report-pages').click();

        expect(activeIds()).toEqual([]);
    });

    it('clears on a click outside the page area', () => {
        cardPart('a', '.report-card-image').click();
        expect(activeIds()).toEqual(['a']);

        const outside = document.createElement('div');
        document.body.appendChild(outside);
        outside.click();

        expect(activeIds()).toEqual([]);
    });

    it('leaves the active card alone when its own toolbar is used', () => {
        cardPart('a', '.report-card-image').click();

        cardPart('a', '[data-report-card-action="down"]').click();

        expect(activeIds()).toEqual(['a']);
    });

    it('forgets a card that leaves the report', async () => {
        cardPart('a', '.report-card-image').click();
        expect(activeIds()).toEqual(['a']);

        exportCart.remove('a');
        await flush();
        expect(card('a')).toBeNull();

        // A later card reusing the id must not inherit the reveal.
        await select(exportCart, 'a');
        await flush();

        expect(card('a')).not.toBeNull();
        expect(activeIds()).toEqual([]);
    });
});

// @vitest-browser

import { describe, it, expect, afterEach } from 'vitest';
import { competenceDetailSectionConfig } from '@tba3/modules/charts/competence-detail';
import { selfEfficacyConfig } from '@tba3/modules/charts/self-efficacy';
import { SlDetailOverlayModule } from '../../../../../src/sl/modules/slDetailOverlay/slDetailOverlayModule.js';
import { createTestAppOptions } from '../../../support/glossaryFixture.js';
import { signal } from '@preact/signals-core';
import { subjectDocumentsInHand } from '../../../../../packages/modules/test/support/subjectContext.js';

/** @typedef {import('../../../../../src/sl/modules/slDetailOverlay/slDetailOverlayModule.js').CardDetail} CardDetail */

/**
 * The overlay places what a card names; which panels a card has is the card catalog's
 * (`slDetailsChartGroups.test.js`).
 * @param {string} vizMode
 * @returns {import('../../../../../src/sl/modules/slDetailOverlay/slDetailOverlayModule.js').SlDetailOverlayOptions} The options the Details view hands the overlay.
 */
function overlayOptions(vizMode) {
    return {
        // An empty school: every document a panel reads lands without value groups, and
        // the Kasten finds no box.
        ...createTestAppOptions(
            'sl',
            subjectDocumentsInHand('sl', {
                'info-boxes.json': {
                    meta: { locale: 'de', materialLinkLabel: 'Material', quotedLabel: 'Zitat' },
                    sectionTypes: {},
                    boxes: {},
                },
            }),
        ),
        vizMode: signal(vizMode),
    };
}

/** @type {CardDetail} */
const SCHOOL_DETAIL = {
    title: 'Schule',
    key: 'school',
    panels: [
        {
            suffix: 'sp',
            className: 'overlay-panel--sp',
            config: selfEfficacyConfig,
            options: { showOnlySchoolData: true },
        },
        {
            suffix: 'chart',
            config: competenceDetailSectionConfig,
            options: { subjectName: null, groupName: null, showOnlySchoolData: true },
        },
    ],
    kasten: {
        boxKey: 'detailsSchoolSpecific',
        placeholderContext: { subjectName: null, groupName: null },
    },
};

describe('SL detail overlay', () => {
    /** @type {SlDetailOverlayModule|null} */
    let overlay = null;

    afterEach(() => {
        overlay?.remove();
        overlay = null;
    });

    it("stacks the card's panels beside its Kasten, each id scoped by the card key", async () => {
        overlay = SlDetailOverlayModule.create('detail', overlayOptions('boxplot'));
        await overlay.open(SCHOOL_DETAIL);

        const charts = [...overlay.querySelectorAll('.sl-detail-overlay-charts > *')];
        expect(
            charts.map((host) => [host.id, host.classList.contains('overlay-panel--sp')]),
        ).toEqual([
            ['detail-school-sp', true],
            ['detail-school-chart', false],
        ]);
        const kasten = overlay.querySelector('.sl-detail-overlay-kasten');
        expect(kasten?.id).toBe('detail-school-kasten');
        expect(kasten?.previousElementSibling?.className).toBe('sl-detail-overlay-charts');
        // The strip's height follows the mode the overlay was opened in.
        expect(overlay.dataset.vizMode).toBe('boxplot');
        expect(overlay.closest('dialog')?.open).toBe(true);
    });
});

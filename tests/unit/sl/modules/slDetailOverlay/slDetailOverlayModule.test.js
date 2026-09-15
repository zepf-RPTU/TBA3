// @vitest-browser

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlDetailOverlayModule } from '../../../../../src/sl/modules/slDetailOverlay/slDetailOverlayModule.js';
import { DataStore } from '../../../../../src/common/services/dataStore.js';
import { initGlossaryForTests } from '../../../support/glossaryFixture.js';

const infoBoxOptions = vi.hoisted(() => []);

vi.mock('@tba3/modules/common/charts/host/chartHostModule.js', () => ({
    ChartHostModule: class {
        async init() {}
        setVizMode() {}
        destroy() {}
    },
}));

vi.mock('@tba3/modules/sl/modules/infoBox/infoBoxModule.js', () => ({
    InfoBoxModule: class {
        constructor(_id, _container, options) {
            infoBoxOptions.push(options);
        }
        async init() {}
        destroy() {}
    },
}));

vi.mock('@tba3/module-base/utils/waitForLayout.js', async (importOriginal) => ({
    ...(await importOriginal()),
    waitForStableElementBox: () => Promise.resolve(),
}));

describe('SL detail overlay Kasten', () => {
    /** @type {SlDetailOverlayModule|null} */
    let overlay = null;

    beforeEach(() => {
        initGlossaryForTests('sl');
        document.body.innerHTML = '';
        infoBoxOptions.length = 0;
    });

    afterEach(() => {
        overlay?.destroy();
        overlay = null;
    });

    it('links the material pages to the payload subject, not the card title', async () => {
        // WHY: the card title is glossary copy ("Mathematik"); the payload spells the
        // subject its own way ("Mathe"), and the material links are keyed by that.
        overlay = new SlDetailOverlayModule('detail', { dataStore: new DataStore() });

        await overlay.show({
            detailKey: 'subject-Mathe',
            title: 'Mathematik',
            chartGroups: [
                {
                    title: 'Mathematik',
                    subjectName: 'Mathe',
                    domainLabel: 'Mathe',
                    domainGroups: [],
                },
            ],
            isByClass: false,
        });

        expect(infoBoxOptions).toHaveLength(1);
        expect(infoBoxOptions[0].boxKey).toBe('overviewSubjectSpecific');
        expect(infoBoxOptions[0].placeholderContext.subjectName).toBe('Mathe');
    });

    it('names no subject for a class card', async () => {
        overlay = new SlDetailOverlayModule('detail', { dataStore: new DataStore() });

        await overlay.show({
            detailKey: 'class-8a',
            title: 'Klasse 8a',
            chartGroups: [{ title: 'Klasse 8a', className: '8a', domainGroups: [] }],
            isByClass: true,
            className: '8a',
        });

        expect(infoBoxOptions[0].placeholderContext).toEqual({
            subjectName: null,
            className: '8a',
        });
    });
});

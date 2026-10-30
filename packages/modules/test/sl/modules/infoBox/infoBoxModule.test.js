// @vitest-browser
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InfoBoxModule } from '../../../../src/sl/modules/infoBox/infoBoxModule.js';
import { buildCompetenceValueGroups } from '../../../support/slInfoBoxFixture.js';
import { mountModule } from '../../../support/dom.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

/**
 * The card itself: what it shows when there is nothing to say, and how a section switch
 * changes what a capture would show. What a box says is `resolveInfoBox`'s
 * (`infoBoxContent.test.js`); this suite pins the DOM around it.
 */

const INFO_BOXES = {
    meta: {
        locale: 'de-DE',
        materialLinkLabel: '{{type}}: {{subject}} im Material anzeigen',
        quotedLabel: '„{{label}}“',
    },
    sectionTypes: {
        general: { icon: 'stars', tooltip: 'Allgemein' },
        praise: { icon: 'trophy', tooltip: 'Lob', materialLinkSubjectMode: 'best' },
    },
    boxes: {
        demo: {
            sections: [
                {
                    type: 'general',
                    blocks: ['Allgemein-Text'],
                },
                {
                    type: 'praise',
                    blocks: ['Lob-Text'],
                },
            ],
        },
    },
};

const GLOSSARY = {
    sl: {
        box: { title: 'Hinweise', messages: { empty: 'Nichts zu sagen.' } },
        bare: { title: 'Ohne Leerzustand' },
    },
};

/** @type {InfoBoxModule|null} */
let box = null;
/** @type {HTMLElement} */
let host;

beforeEach(() => {
    host = document.createElement('div');
    document.body.replaceChildren(host);
});

afterEach(() => {
    box?.remove();
    box = null;
});

/**
 * @param {Record<string, any>} [options]
 * @returns {Promise<{init: (data: unknown) => Promise<InfoBoxModule>}>} A box over the fixture school, mounted in `host` by `init`.
 */
async function makeBox(options = {}) {
    const valueGroups = buildCompetenceValueGroups();
    const context = await createSubjectContext('sl', {
        documents: {
            'competence-levels.json': valueGroups,
            'info-boxes.json': INFO_BOXES,
        },
    });
    box = InfoBoxModule.create('box', {
        context: { ...context, glossaryData: GLOSSARY },
        glossaryKey: 'sl.box',
        ...options,
    });
    const created = box;
    return { init: (data) => mountModule(created, data, host) };
}

const itemTexts = () =>
    [...host.querySelectorAll('.info-box-block-item')].map((item) => item.textContent.trim());

describe('InfoBoxModule — which box, and what when there is none', () => {
    it('shows its own empty-state sentence, silently, while no box is named', async () => {
        // The comparison view has nothing to say until its chart reports; that is a
        // state, not a defect, so it must not warn — and the sentence is the host's own.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await (await makeBox()).init({});

        expect(host.querySelector('.info-box-empty-state')?.textContent).toBe('Nichts zu sagen.');
        expect(warn).not.toHaveBeenCalled();
    });

    it('fails loudly when its glossary entry has no empty-state sentence', async () => {
        await expect((await makeBox({ glossaryKey: 'sl.bare' })).init({})).rejects.toThrow(
            /messages\.empty/,
        );
    });

    it('warns for a box key the document does not have', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await (await makeBox()).init({ boxKey: 'gibtEsNicht' });

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"gibtEsNicht"'));
        expect(host.querySelector('.info-box-empty-state')).not.toBeNull();
    });
});

describe('InfoBoxModule — sections', () => {
    it('switches sections in place, and the switch changes the export identity', async () => {
        // The section click never goes through render(), so the export identity is
        // only right if the click path resyncs it — a capture would otherwise be filed
        // under the section shown before.
        await (await makeBox()).init({ boxKey: 'demo' });
        expect(itemTexts()[0]).toBe('Allgemein-Text');
        expect(box?.getExportIdentity()).toEqual(['demo', 'general']);

        /** @type {HTMLButtonElement} */ (
            host.querySelector('.info-box-section-btn[aria-label="Lob"]')
        ).click();

        expect(itemTexts()).toEqual(['Lob-Text']);
        expect(box?.getExportIdentity()).toEqual(['demo', 'praise']);
        expect(
            host
                .querySelector('.info-box-section-btn[aria-label="Lob"]')
                ?.getAttribute('aria-pressed'),
        ).toBe('true');
    });
});

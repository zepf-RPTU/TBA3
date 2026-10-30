import { beforeEach, describe, expect, it, vi } from 'vitest';
import { glossaryTermAttrs } from '@tba3/module-base/glossary';
import { GlossaryAnnotator } from '../../../src/common/context/index.js';
import { createTestContext } from '../../support/glossaryFixture.js';

const TREE = {
    xx: {
        shared: {
            element_texts: {
                kompetenzstufe: { title: 'Kompetenzstufe', aliases: ['Kompetenzstufe', 'KS'] },
                mw: { title: 'Mittelwert', aliases: [{ text: 'MW', exact: true }] },
            },
        },
    },
    general: { page: { title: 'Seite' } },
};

describe('GlossaryAnnotator', () => {
    /** @type {GlossaryAnnotator} */
    let glossary;

    beforeEach(() => {
        glossary = new GlossaryAnnotator(TREE, 'xx');
    });

    it('wraps every alias, in any casing, with the term markup of its canonical key', () => {
        // Aliases are matched case-insensitively, so the lookup must be too —
        // a lower-cased hit that finds no entry would silently render plain text.
        expect(glossary.annotateHTML('die ks und die Kompetenzstufe')).toBe(
            `die <span ${glossaryTermAttrs('kompetenzstufe')}>ks</span> und die ` +
                `<span ${glossaryTermAttrs('kompetenzstufe')}>Kompetenzstufe</span>`,
        );
    });

    it('leaves tags and already-annotated spans alone', () => {
        const html = `<b title="KS">x</b> <span ${glossaryTermAttrs('mw')}>KS</span>`;
        expect(glossary.annotateHTML(html)).toBe(html);
    });

    it('matches an exact alias only as a whole word, never inside an abbreviation', () => {
        expect(glossary.annotateHTML('MWST')).toBe('MWST');
        expect(glossary.annotateHTML('z.MW.')).toBe('z.MW.');
        expect(glossary.annotateHTML('der MW')).toBe(
            `der <span ${glossaryTermAttrs('mw')}>MW</span>`,
        );
    });

    it('skips excluded keys, so a popup never links to itself', () => {
        expect(glossary.annotateHTML('KS', new Set(['kompetenzstufe']))).toBe('KS');
    });

    it('splits plain text into runs, each match carrying its canonical key', () => {
        expect(glossary.getTextSegments('Die KS im MW')).toEqual([
            { text: 'Die ', glossaryKey: null },
            { text: 'KS', glossaryKey: 'kompetenzstufe' },
            { text: ' im ', glossaryKey: null },
            { text: 'MW', glossaryKey: 'mw' },
        ]);
    });

    it('resolves a term or alias to its key, and getEntry takes only the key', () => {
        expect(glossary.resolveEntryKey('ks')).toBe('kompetenzstufe');
        expect(glossary.getEntry('kompetenzstufe')?.title).toBe('Kompetenzstufe');
        expect(glossary.getEntry('KS')).toBeNull();
    });

    it('merges payload entries over the static one, without making them matchable', () => {
        glossary.registerPayloadEntries(
            new Map([
                ['kompetenzstufe', { body: 'aus den Daten' }],
                ['III', { title: 'KS III' }],
            ]),
        );
        expect(glossary.getEntry('kompetenzstufe')).toMatchObject({
            title: 'Kompetenzstufe',
            body: 'aus den Daten',
        });
        expect(glossary.annotateHTML('Stufe III')).toBe('Stufe III');
    });

    it('lists the namespace entries and marks a missing text with its path', () => {
        expect(glossary.getEntries().map(([key]) => key)).toEqual(['kompetenzstufe', 'mw']);
        expect(glossary.getRequiredEntryText('general.page.title')).toBe('Seite');
        expect(glossary.getRequiredEntryText('general.nope')).toBe(
            '[Missing glossary entry: general.nope]',
        );
    });

    it('warns once per alias that names two entries, and keeps the first', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        glossary = new GlossaryAnnotator(
            {
                xx: {
                    shared: {
                        element_texts: {
                            a: { aliases: ['Term'] },
                            b: { aliases: ['term'] },
                        },
                    },
                },
            },
            'xx',
        );
        expect(warn).toHaveBeenCalledTimes(1);
        expect(glossary.resolveEntryKey('TERM')).toBe('a');
        warn.mockRestore();
    });
});

describe('GlossaryAnnotator.resolveDomainEntryKey', () => {
    const DOMAIN_TREE = {
        xx: {
            shared: {
                element_texts: {
                    hoeren: { title: 'Hören', domains: [{ id: 'ho' }] },
                    'lesen-de': {
                        title: 'Lesen (Deutsch)',
                        domains: [{ subject: 'Deutsch', id: 'le' }],
                    },
                    'lesen-en': {
                        title: 'Lesen (Englisch)',
                        aliases: ['Leseverstehen'],
                        domains: [{ subject: 'Englisch', id: 'le' }],
                    },
                },
            },
        },
    };

    it('resolves a Domäne by its id and Fach, never by a name', () => {
        const glossary = new GlossaryAnnotator(DOMAIN_TREE, 'xx');
        // One id, two Fächer, two entries: the name alone could not tell them apart.
        expect(glossary.resolveDomainEntryKey('le', 'Deutsch')).toBe('lesen-de');
        expect(glossary.resolveDomainEntryKey('le', 'Englisch')).toBe('lesen-en');
        expect(glossary.resolveDomainEntryKey('le', 'Französisch')).toBeNull();
        expect(glossary.resolveDomainEntryKey('xy', 'Deutsch')).toBeNull();
        expect(glossary.resolveDomainEntryKey(null)).toBeNull();
    });

    it('answers a claim without a Fach only without one, and one with a Fach only with it', () => {
        const glossary = new GlossaryAnnotator(DOMAIN_TREE, 'xx');
        expect(glossary.resolveDomainEntryKey('ho')).toBe('hoeren');
        expect(glossary.resolveDomainEntryKey('ho', 'Englisch')).toBeNull();
        expect(glossary.resolveDomainEntryKey('le')).toBeNull();
    });

    it('never matches a Domäne as free text', () => {
        const glossary = new GlossaryAnnotator(DOMAIN_TREE, 'xx');
        expect(glossary.annotateHTML('Hören und Lesen')).toBe('Hören und Lesen');
        expect(glossary.getTextSegments('ho le')).toEqual([{ text: 'ho le', glossaryKey: null }]);
        expect(glossary.resolveEntryKey('Lesen')).toBeNull();
    });

    it('warns once per Domäne two entries claim, and keeps the first', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const glossary = new GlossaryAnnotator(
            {
                xx: {
                    shared: {
                        element_texts: {
                            a: { domains: [{ subject: 'Deutsch', id: 'le' }] },
                            b: { domains: [{ subject: 'Deutsch', id: 'le' }] },
                        },
                    },
                },
            },
            'xx',
        );
        expect(warn).toHaveBeenCalledTimes(1);
        expect(glossary.resolveDomainEntryKey('le', 'Deutsch')).toBe('a');
        warn.mockRestore();
    });
});

describe('the Domänen of the package glossary', () => {
    it('SL: tells the Domänen of each Fach apart by id and Fach', () => {
        const { glossary } = createTestContext('sl');
        expect(glossary.resolveDomainEntryKey('ho', 'Englisch')).toBe('hörverstehen');
        expect(glossary.resolveDomainEntryKey('le', 'Englisch')).toBe('leseverstehen');
        expect(glossary.resolveDomainEntryKey('le', 'Deutsch')).toBe('lesen');
        expect(glossary.resolveDomainEntryKey('rs', 'Deutsch')).toBe('orthografie');
        expect(glossary.resolveDomainEntryKey('sp', 'Deutsch')).toBe('sprachgebrauch');
        // `ho` is Hören in Deutsch and Hörverstehen in Englisch: one id, two entries.
        expect(glossary.resolveDomainEntryKey('ho', 'Deutsch')).toBe('hören-deutsch');
        // Englisch and Französisch share one entry per Domäne.
        expect(glossary.resolveDomainEntryKey('ho', 'Französisch')).toBe('hörverstehen');
        expect(glossary.resolveDomainEntryKey('le', 'Französisch')).toBe('leseverstehen');
    });

    it('SL: links no Domäne name as free text, and still the prose terms', () => {
        const { glossary } = createTestContext('sl');
        // `Lesen` names a Domäne of Deutsch, Englisch and Französisch alike.
        expect(glossary.getTextSegments('Englisch: Lesen')).toEqual([
            { text: 'Englisch: Lesen', glossaryKey: null },
        ]);
        expect(
            glossary.getTextSegments('Hör- und Leseverstehen').map((run) => run.glossaryKey),
        ).toContain('leseverstehen');
    });

    it('EN: claims its two Domänen without a Fach', () => {
        const { glossary } = createTestContext('en');
        expect(glossary.resolveDomainEntryKey('ho')).toBe('hörverstehen');
        expect(glossary.resolveDomainEntryKey('le')).toBe('leseverstehen');
        expect(glossary.resolveDomainEntryKey('le', 'Englisch')).toBeNull();
        expect(
            glossary.getTextSegments('Hör- und Leseverstehen').map((run) => run.glossaryKey),
        ).toContain('leseverstehen');
    });
});

import { describe, it, expect } from 'vitest';
import { getTraitsText, getTraitsAsText } from '@tba3/modules/common/tables/traitUtils.js';
import {
    extractTraits,
    getTraitLabel,
    getTraitFallbackLabel,
} from '@tba3/modules/common/domain/traitRegistry.js';
import { glossaryAnnotator } from '@tba3/modules/common/glossary/glossaryAnnotator.js';
import { initGlossaryForTests } from '../../support/glossaryFixture.js';

describe('getTraitsText', () => {
    it('normalizes traits to an uppercased, alphabetically sorted, comma-joined string', () => {
        // WHY: this text is the single source the traits column sorts and filters on,
        // so it must be deterministic regardless of Set insertion order or casing.
        expect(getTraitsText({ traits: new Set(['migrant', 'adhs']) })).toBe('ADHS, MIGRANT');
        expect(getTraitsText({ traits: new Set(['adhs', 'migrant']) })).toBe('ADHS, MIGRANT');
    });

    it('returns the em-dash placeholder when there are no traits', () => {
        // WHY: filter ("Keine") and sort (empty rows sink) both key off this exact '—'.
        expect(getTraitsText({ traits: new Set() })).toBe('—');
        expect(getTraitsText({})).toBe('—');
    });
});

describe('getTraitsAsText (HTML string mode)', () => {
    it('emits glossary-annotatable trait spans carrying the original (lowercase) key', () => {
        // WHY: the cell shows the uppercased NAME but the glossary lookup needs the
        // original key, so name and data-glossary-key must diverge intentionally.
        const html = getTraitsAsText({ traits: new Set(['migrant']) }, true);
        expect(html).toContain('data-glossary-key="migrant"');
        expect(html).toContain('>MIGRANT<');
        expect(html).toContain('traits-container');
    });

    it('renders the empty-traits placeholder container when there are none', () => {
        const html = getTraitsAsText({ traits: new Set() }, true);
        expect(html).toContain('traits-empty');
        expect(html).toContain('—');
    });

    it('takes the empty-state tooltip from the same glossary entry as the DOM branch', () => {
        // WHY: this branch hardcoded "Keine Merkmale" until 2026-09-08 while the DOM branch
        // below already read `general.messages.no-traits`. They agreed only because the
        // entry happened to say the same thing — editing the glossary moved one and not
        // the other, and the table shows both branches depending on the column's formatter.
        // Only the markup branch is asserted here: the DOM branch needs a document, and
        // moving this whole file into the browser project for one assertion costs more
        // than it buys. The entry name is the shared thing, and it is what this pins.
        initGlossaryForTests();
        const expected = glossaryAnnotator.getRequiredEntryText('general.messages.no-traits');

        expect(getTraitsAsText({ traits: new Set() }, true)).toContain(
            `data-tooltip-text="${expected}"`,
        );
    });

    it('falls back to the payload label for a trait the glossary cannot describe', () => {
        // WHY: the trait vocabulary is set by the state, not by this client. A state
        // that introduces a code packages/modules/src/common/glossary/glossary.json has never heard of must still get
        // a readable hover, otherwise the cell is an undecodable two-letter code.
        extractTraits([{ type: 'trait', label: 'Migrationshintergrund', value: 'mig' }]);
        const html = getTraitsAsText({ traits: new Set(['mig']) }, true);
        expect(html).toContain('data-tooltip-text="Migrationshintergrund"');
        // The glossary key stays on the chip regardless, so the popup starts working
        // the moment the glossary does learn the code — no re-render logic needed.
        expect(html).toContain('data-glossary-key="mig"');
    });

    it('escapes a label before putting it in the tooltip attribute', () => {
        // WHY: labels now arrive from the server, and this path builds raw HTML.
        extractTraits([{ type: 'trait', label: 'a"><img src=x>', value: 'xss' }]);
        const html = getTraitsAsText({ traits: new Set(['xss']) }, true);
        expect(html).not.toContain('<img src=x>');
        expect(html).toContain('&quot;&gt;&lt;img');
    });
});

describe('extractTraits', () => {
    it('keeps only trait covariates and ignores the other dimensions', () => {
        // WHY: `type` is what groups traits together — gender/group live in the same
        // array and must never leak into the Merkmale column.
        const traits = extractTraits([
            { type: 'gender', value: 'female' },
            { type: 'trait', value: 'f' },
            { type: 'group', label: 'Klasse', value: '8a' },
            { type: 'trait', value: 'kw' },
        ]);
        expect(traits).toEqual(new Set(['f', 'kw']));
    });

    it('treats a repeated trait type as one entry per trait, not as a conflict', () => {
        // WHY: repeated `type: "trait"` is the encoding — absence means the student
        // does not have the trait, so nothing may collapse or de-duplicate by type.
        expect(
            extractTraits([
                { type: 'trait', value: 'f' },
                { type: 'trait', value: 'kw' },
                { type: 'trait', value: 'nd' },
            ]).size,
        ).toBe(3);
    });

    it('returns an empty set for missing or trait-free covariates', () => {
        expect(extractTraits(undefined)).toEqual(new Set());
        expect(extractTraits([{ type: 'gender', value: 'male' }])).toEqual(new Set());
    });

    it('registers labels by code and leaves unlabelled codes unresolved', () => {
        // WHY: the label is what lets the client name a trait it has never seen; a code
        // that arrives without one must report null so callers fall back to the glossary.
        extractTraits([
            { type: 'trait', label: 'Förderbedarf', value: 'f' },
            { type: 'trait', value: 'unlabelled' },
        ]);
        expect(getTraitLabel('f')).toBe('Förderbedarf');
        expect(getTraitLabel('unlabelled')).toBeNull();
        expect(getTraitLabel('never-seen')).toBeNull();
    });
});

describe('getTraitFallbackLabel', () => {
    it('yields nothing for a code the glossary already describes', () => {
        // WHY: this is the gate that keeps two tooltips off one element. Every consumer
        // (Merkmale chips, SL sub-column headers) also exposes the code to the glossary
        // popup, so handing out the payload label for a *known* code means the popup and
        // a second plain tooltip open on top of each other.
        extractTraits([
            { type: 'trait', label: 'Förderbedarf', value: 'f' },
            { type: 'trait', label: 'Neues Merkmal', value: 'neu' },
        ]);
        glossaryAnnotator.init(
            {
                sl: {
                    shared: {
                        element_texts: {
                            f: { title: 'Förderbedarf', aliases: [{ text: 'F', exact: true }] },
                        },
                    },
                },
            },
            'sl',
        );

        expect(getTraitFallbackLabel('f')).toBeNull();
        expect(getTraitFallbackLabel('neu')).toBe('Neues Merkmal');
    });
});

import { beforeEach, describe, it, expect } from 'vitest';
import {
    getTraitFallbackLabel,
    getTraitsText,
    getTraitsHtml,
} from '../../../src/common/tables/traitUtils.js';
import { createModuleContext } from '../../../src/common/context/index.js';
import { readTraitCodes, readTraitLabels } from '../../../src/common/domain/studentIdentity.js';
import { MISSING_VALUE } from '../../../src/common/utils/numberFormat.js';
import { nameProperties } from '../../support/competenceLevelGroups.js';
import { createTestContext } from '../../support/glossaryFixture.js';

/** @type {import('../../../src/common/context/index.js').ModuleContext} */
let context;

beforeEach(() => {
    context = createTestContext();
});

describe('getTraitsText', () => {
    it('normalizes traits to an uppercased, alphabetically sorted, comma-joined string', () => {
        // The traits column sorts and filters on this text, so it must not depend
        // on Set insertion order or casing.
        expect(getTraitsText({ traits: new Set(['migrant', 'adhs']) })).toBe('ADHS, MIGRANT');
        expect(getTraitsText({ traits: new Set(['adhs', 'migrant']) })).toBe('ADHS, MIGRANT');
    });

    it('returns the missing mark when there are no traits', () => {
        // The download prints this text, so it must be the mark every other empty cell shows.
        expect(getTraitsText({ traits: new Set() })).toBe(MISSING_VALUE);
        expect(getTraitsText({})).toBe(MISSING_VALUE);
    });
});

describe('getTraitsHtml', () => {
    it('emits glossary-annotatable trait spans carrying the original (lowercase) key', () => {
        // The cell shows the uppercased name, but the glossary lookup needs the
        // original key.
        const html = getTraitsHtml(context.glossary, new Map(), { traits: new Set(['migrant']) });
        expect(html).toContain('data-glossary-key="migrant"');
        expect(html).toContain('>MIGRANT<');
        expect(html).toContain('traits-container');
    });

    it('takes the empty-state tooltip from the glossary', () => {
        // The glossary entry is the only source of that copy.
        const expected = context.glossary.getRequiredEntryText('general.messages.no-traits');

        expect(getTraitsHtml(context.glossary, new Map(), { traits: new Set() })).toContain(
            `data-tooltip-text="${expected}"`,
        );
    });

    it('falls back to the payload label for a trait the glossary cannot describe', () => {
        // The state sets the trait vocabulary. A code the glossary does not know
        // must still get a readable hover.
        const labels = new Map([['mig', 'Migrationshintergrund']]);
        const html = getTraitsHtml(context.glossary, labels, { traits: new Set(['mig']) });
        expect(html).toContain('data-tooltip-text="Migrationshintergrund"');
        // The glossary key stays on the chip, so the popup works once the glossary
        // learns the code.
        expect(html).toContain('data-glossary-key="mig"');
    });

    it('escapes a label before putting it in the tooltip attribute', () => {
        // Labels arrive from the server, and this path builds raw HTML.
        const labels = new Map([['xss', 'a"><img src=x>']]);
        const html = getTraitsHtml(context.glossary, labels, { traits: new Set(['xss']) });
        expect(html).not.toContain('<img src=x>');
        expect(html).toContain('&quot;&gt;&lt;img');
    });
});

describe('readTraitCodes', () => {
    it('keeps only trait covariates and ignores the other dimensions', () => {
        // Gender and group live in the same array and must not leak into the
        // Merkmale column.
        const traits = readTraitCodes([
            { type: 'gender', value: 'female' },
            { type: 'trait', value: 'f' },
            { type: 'group', label: 'Lerngruppe', value: '8a' },
            { type: 'trait', value: 'kw' },
        ]);
        expect(traits).toEqual(new Set(['f', 'kw']));
    });

    it('treats a repeated trait type as one entry per trait, not as a conflict', () => {
        // Repeated `type: "trait"` is the encoding, so nothing may de-duplicate
        // by type.
        expect(
            readTraitCodes([
                { type: 'trait', value: 'f' },
                { type: 'trait', value: 'kw' },
                { type: 'trait', value: 'nd' },
            ]).size,
        ).toBe(3);
    });

    it('returns an empty set for missing or trait-free covariates', () => {
        expect(readTraitCodes(undefined)).toEqual(new Set());
        expect(readTraitCodes([{ type: 'gender', value: 'male' }])).toEqual(new Set());
    });
});

describe('readTraitLabels', () => {
    /**
     * @param {Array<{type: string, value: string, label?: string}>} covariates
     * @returns {import('../../../src/common/domain/studentIdentity.js').StudentEntry}
     */
    const entry = (covariates) => ({ id: 's', properties: nameProperties('Ada'), covariates });

    it('labels codes from trait covariates only, and leaves unlabelled codes out', () => {
        // A code that arrives without a label must stay absent, so callers fall back to
        // the glossary; a labelled gender or group is not a trait.
        const labels = readTraitLabels([
            entry([
                { type: 'trait', label: 'Förderbedarf', value: 'f' },
                { type: 'trait', value: 'unlabelled' },
                { type: 'group', label: 'Lerngruppe', value: '8a' },
            ]),
        ]);
        expect([...labels]).toEqual([['f', 'Förderbedarf']]);
    });

    it('lets a later label for the same code win', () => {
        const labels = readTraitLabels([
            entry([{ type: 'trait', label: 'Vorlesen', value: 'vorlesen' }]),
            entry([{ type: 'trait', label: 'Text wird vorgelesen', value: 'vorlesen' }]),
        ]);
        expect(labels.get('vorlesen')).toBe('Text wird vorgelesen');
    });
});

describe('getTraitFallbackLabel', () => {
    it('yields nothing for a code the glossary already describes', () => {
        // Every consumer (Merkmale chips, SL sub-column headers) also exposes the
        // code to the glossary popup, so a payload label for a known code would open
        // the popup and a plain tooltip on top of each other.
        context = createModuleContext({
            glossaryData: {
                sl: {
                    shared: {
                        element_texts: {
                            f: { title: 'Förderbedarf', aliases: [{ text: 'F', exact: true }] },
                        },
                    },
                },
            },
            namespace: 'sl',
        });
        const labels = new Map([
            ['f', 'Förderbedarf'],
            ['neu', 'Neues Merkmal'],
        ]);

        expect(getTraitFallbackLabel(context.glossary, labels, 'f')).toBeNull();
        expect(getTraitFallbackLabel(context.glossary, labels, 'neu')).toBe('Neues Merkmal');
    });
});

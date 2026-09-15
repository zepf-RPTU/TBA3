import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { buildCompetenceLevelGlossaryEntries } from '@tba3/modules/common/glossary/competenceLevelGlossary.js';
import {
    getLevelGlossaryKey,
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { glossaryAnnotator } from '@tba3/modules/common/glossary/glossaryAnnotator.js';

// The server wraps the same prose around every scale's band list, so the two scales below
// differ only in their `<ul>` — which is what the popup body has to exploit.
const SCALE_PROSE = '<p>Diese Skala umfasst folgende Stufen:</p>';
const KS_LADDER = '<ul><li>KS 2</li></ul>';
const GER_LADDER = '<ul><li>A2</li></ul>';
const SCALE_TEXT = `${SCALE_PROSE}${KS_LADDER}`;
const GER_SCALE_TEXT = `${SCALE_PROSE}${GER_LADDER}`;

/**
 * One `competence-levels.json` row, trimmed to what this path reads: NRW's Deutsch
 * ladder, whose vocabulary (`k.h.N.`, `KS 1`…) the glossary never covered.
 */
function nwRow() {
    return {
        properties: [{ key: 'competenceScaleDescription', value: SCALE_TEXT }],
        competenceLevels: [
            { id: '1', nameShort: 'k.h.N.', name: null, description: '<p>k.h.N. erklärt</p>' },
            {
                id: '2',
                nameShort: 'KS 1',
                name: 'unter Mindeststandard',
                description: '<p>KS 1 erklärt</p>',
            },
            {
                id: '3',
                nameShort: 'KS 2',
                name: 'Mindeststandard',
                description: '<p>KS 2 erklärt</p>',
            },
        ],
    };
}

/**
 * A second, shorter ladder for the same page — the Englisch side of an SL dataset.
 * Fewer bands than `nwRow`, so registration order (band count descending) is fixed.
 */
function gerRow() {
    return {
        properties: [{ key: 'competenceScaleDescription', value: GER_SCALE_TEXT }],
        competenceLevels: [
            { id: '1', nameShort: 'A1', name: 'Mindeststandard', description: '<p>A1 erklärt</p>' },
            { id: '2', nameShort: 'A2', name: 'Regelstandard', description: '<p>A2 erklärt</p>' },
        ],
    };
}

describe('competence-level glossary entries', () => {
    beforeEach(() => {
        resetCompetenceLevelPalette();
    });

    afterEach(() => {
        resetCompetenceLevelPalette();
    });

    it('describes a vocabulary the client has no table for', () => {
        // The point of the move: `k.h.N.`/`KS 1`/`KS 2` had no glossary entry in any
        // namespace, so NRW shipped three bands the dashboard could not explain at all.
        registerCompetenceLevelScales([nwRow()]);
        const entries = buildCompetenceLevelGlossaryEntries();

        expect(entries.get('k.h.n.')?.body).toBe('<p>k.h.N. erklärt</p>');
        expect(entries.get('ks 1')?.body).toBe('<p>KS 1 erklärt</p>');
        // The popup titles the entry with the level as the state spells it.
        expect(entries.get('ks 1')?.title).toBe('KS 1');
    });

    it('gives the scale-concept terms a body generated from the real bands', () => {
        // The copy this replaces enumerated "KS V (Optimalstandard) … KS I" inline, which
        // is wrong for every state not using roman numerals.
        registerCompetenceLevelScales([nwRow()]);
        const entries = buildCompetenceLevelGlossaryEntries();

        expect(entries.get('KS')?.body).toBe(SCALE_TEXT);
        expect(entries.get('ger')?.body).toBe(SCALE_TEXT);
    });

    it("prints shared prose once and lists each scale's ladder under it", () => {
        // SL shows subjects with different ladders side by side, and the popup describes
        // every one of them: nothing in the payload says which ladder a hovered word means,
        // so the reader disambiguates from the level names. The prose around the list is
        // the same for every subject, so repeating it per scale would print two identical
        // paragraphs and leave the reader looking for a difference that is not there.
        registerCompetenceLevelScales([nwRow(), gerRow()]);
        const entries = buildCompetenceLevelGlossaryEntries();

        expect(entries.get('KS')?.body).toBe(`${SCALE_PROSE}${KS_LADDER}<hr>${GER_LADDER}`);
        // Both concept keys carry the same body by design — see competenceLevelGlossary.js.
        expect(entries.get('ger')?.body).toBe(entries.get('KS')?.body);
    });

    it('keeps the scales apart when their prose genuinely differs', () => {
        // The fallback. Grouping by prose is an optimisation for the uniform text the
        // server sends today; a state that describes its ladder in its own words must
        // still get that text, not have its ladder filed under another scale's paragraph.
        const ownWords = '<p>Eigene Beschreibung:</p><ul><li>A2</li></ul>';
        registerCompetenceLevelScales([
            nwRow(),
            { ...gerRow(), properties: [{ key: 'competenceScaleDescription', value: ownWords }] },
        ]);

        expect(buildCompetenceLevelGlossaryEntries().get('KS')?.body).toBe(
            `${SCALE_TEXT}<hr>${ownWords}`,
        );
    });

    it('stamps no key for a level the payload left undescribed', () => {
        // An empty popup is worse than none: the value must render as plain text rather
        // than advertising help it cannot give.
        registerCompetenceLevelScales([
            {
                competenceLevels: [{ id: '1', nameShort: 'KS 1', name: null, description: null }],
            },
        ]);

        expect(getLevelGlossaryKey('KS 1')).toBeNull();
        expect(buildCompetenceLevelGlossaryEntries().size).toBe(0);
    });

    it('keys a GER sub-level in its own right rather than collapsing it to the band', () => {
        // `A1.1` and `A1.2` are separate levels with separate text. Collapsing to `A1`
        // was only ever needed while the copy lived in glossary.json, which knew majors.
        registerCompetenceLevelScales([
            {
                competenceLevels: [
                    {
                        id: '1',
                        nameShort: 'A1.1',
                        name: 'unter Mindeststandard',
                        description: '<p>A1.1</p>',
                    },
                    {
                        id: '2',
                        nameShort: 'A1.2',
                        name: 'unter Mindeststandard',
                        description: '<p>A1.2</p>',
                    },
                ],
            },
        ]);

        expect(getLevelGlossaryKey('A1.1')).toBe('a1.1');
        expect(buildCompetenceLevelGlossaryEntries().get('a1.2')?.body).toBe('<p>A1.2</p>');
    });
});

describe('payload glossary entries stay out of the term matcher', () => {
    beforeEach(() => {
        resetCompetenceLevelPalette();
        glossaryAnnotator.init(
            {
                sl: {
                    shared: {
                        element_texts: {
                            KS: { aliases: ['Kompetenzstufe'], title: 'Kompetenzstufe' },
                        },
                    },
                },
            },
            'sl',
        );
        registerCompetenceLevelScales([nwRow()]);
        glossaryAnnotator.registerPayloadEntries(buildCompetenceLevelGlossaryEntries());
    });

    afterEach(() => {
        resetCompetenceLevelPalette();
    });

    it('resolves a payload entry by explicit key', () => {
        expect(glossaryAnnotator.getEntry('ks 1')?.body).toBe('<p>KS 1 erklärt</p>');
    });

    it('never annotates a bare level name found in running prose', () => {
        // The guardrail. Level names are short, ambiguous tokens — registering them as
        // aliases would wrap roman numerals and stray letters anywhere they appear. The
        // static `KSIII` entry aliases the unambiguous "KS III" for exactly this reason.
        const html = '<p>Kapitel KS 1 behandelt k.h.N. und A1 im Text.</p>';
        expect(glossaryAnnotator.annotateHTML(html)).toBe(html);
    });

    it('still annotates a static alias, and gives it the payload body', () => {
        // The static entry keeps the aliases that are the dashboard's own wording; only
        // its body comes from the data.
        const annotated = glossaryAnnotator.annotateHTML('<p>Die Kompetenzstufe zeigt</p>');
        expect(annotated).toContain('data-glossary-key="KS"');
        expect(glossaryAnnotator.getEntry('KS')).toMatchObject({
            title: 'Kompetenzstufe',
            body: SCALE_TEXT,
        });
    });
});

describe('the shipped datasets all explain their own levels', () => {
    beforeEach(() => {
        resetCompetenceLevelPalette();
    });

    afterEach(() => {
        resetCompetenceLevelPalette();
    });

    /**
     * One dataset per scale vocabulary the dashboards can show. Before the texts moved
     * to the payload, only the first two had any: `glossary.json` knew `a1`…`c1` and
     * `KSI`…`KSV`, so the four below them rendered levels the dashboard could not
     * explain at all. Reading the real payloads rather than a hand-written row is the
     * point — this is the assertion that fails if a dataset stops carrying the field.
     *
     * The demo fixtures are read off disk, exactly as the apps read them.
     */
    const FIXTURE_DATASETS = [
        ['data/ma/3a_mid', ['I', 'V']], // roman
        ['data/sl/sl', ['Ia', 'Ib']], // roman with split I
    ];
    function expectDescribedLevels(rows, expectedLevels, label) {
        registerCompetenceLevelScales(rows);
        const entries = buildCompetenceLevelGlossaryEntries();

        for (const level of expectedLevels) {
            const key = getLevelGlossaryKey(level);
            expect(key, `${label} stamps no key for ${level}`).not.toBeNull();
            expect(entries.get(key)?.body, `${label} has no text for ${level}`).toBeTruthy();
        }

        // And the scale as a whole, which is what the "Kompetenzstufe" popup shows.
        expect(entries.get('KS')?.body, `${label} ships no scale description`).toBeTruthy();
        return entries;
    }

    it.each(FIXTURE_DATASETS)('%s describes every level it ships', (dataset, expectedLevels) => {
        // Resolved off this file, not off the process CWD: the fixtures are read from
        // disk rather than imported, so a run started anywhere but the repo root would
        // otherwise fail on a missing file instead of on a missing description.
        const path = fileURLToPath(
            new URL(`../../../../public/${dataset}/competence-levels.json`, import.meta.url),
        );
        expectDescribedLevels(JSON.parse(readFileSync(path, 'utf8')), expectedLevels, dataset);
    });
});

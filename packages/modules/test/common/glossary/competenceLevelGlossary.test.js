// @vitest-browser
// (the descriptions go through the real sanitizer, and the fixtures are fetched off the
// site's public folder, exactly as the apps read them)

import { describe, it, expect, beforeEach } from 'vitest';

import { buildCompetenceLevelGlossaryEntries } from '../../../src/common/glossary/competenceLevelGlossary.js';
import { CompetenceLevelPalette, GlossaryAnnotator } from '../../../src/common/context/index.js';
import {
    GROUP_REQUESTS,
    SCHOOL_REQUESTS,
    valueGroupBucketsFor,
} from '../../../src/common/data/index.js';
import { handWrittenScaleValueGroup } from '../../support/competenceScaleFixture.js';
import { required } from '../../support/required.js';

/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/** @type {CompetenceLevelPalette} */
let palette;

// The server wraps the same prose around every scale's band list, so the two scales below
// differ only in their `<ul>` — which is what the popup body has to exploit.
const SCALE_PROSE = '<p>Diese Skala umfasst folgende Stufen:</p>';
const COMPETENCE_LEVEL_LADDER = '<ul><li>KS 2</li></ul>';
const GER_LADDER = '<ul><li>A2</li></ul>';
const SCALE_TEXT = `${SCALE_PROSE}${COMPETENCE_LEVEL_LADDER}`;
const GER_SCALE_TEXT = `${SCALE_PROSE}${GER_LADDER}`;

/**
 * One `competence-levels.json` value group, trimmed to what this path reads: a Deutsch
 * ladder whose vocabulary (`k.h.N.`, `KS 1`…) the static glossary does not cover.
 * @returns {CompetenceLevelsValueGroup}
 */
function nwValueGroup() {
    return handWrittenScaleValueGroup({
        properties: [{ key: 'competenceScaleDescription', value: SCALE_TEXT }],
        competenceLevels: [
            { id: '1', nameShort: 'k.h.N.', description: '<p>k.h.N. erklärt</p>' },
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
    });
}

/**
 * A second, shorter ladder for the same page — the Englisch side of an SL dataset.
 * Fewer levels than `nwValueGroup`, so registration order (level count descending) is fixed.
 * @returns {CompetenceLevelsValueGroup}
 */
function gerValueGroup() {
    return handWrittenScaleValueGroup({
        properties: [{ key: 'competenceScaleDescription', value: GER_SCALE_TEXT }],
        competenceLevels: [
            { id: '1', nameShort: 'A1', name: 'Mindeststandard', description: '<p>A1 erklärt</p>' },
            { id: '2', nameShort: 'A2', name: 'Regelstandard', description: '<p>A2 erklärt</p>' },
        ],
    });
}

describe('competence-level glossary entries', () => {
    beforeEach(() => {
        palette = new CompetenceLevelPalette();
    });

    it('describes a vocabulary the client has no table for', () => {
        // `k.h.N.`/`KS 1`/`KS 2` have no glossary entry in any namespace; only the
        // payload's own descriptions explain these bands.
        palette.registerCompetenceLevelScales([nwValueGroup()]);
        const entries = buildCompetenceLevelGlossaryEntries(palette);

        expect(entries.get('k.h.n.')?.body).toBe('<p>k.h.N. erklärt</p>');
        expect(entries.get('ks 1')?.body).toBe('<p>KS 1 erklärt</p>');
        // The popup titles the entry with the level as the state spells it.
        expect(entries.get('ks 1')?.title).toBe('KS 1');
    });

    it('gives the scale-concept terms a body generated from the real bands', () => {
        // A fixed text enumerating "KS V (Optimalstandard) … KS I" inline would be wrong
        // for every state not using roman numerals.
        palette.registerCompetenceLevelScales([nwValueGroup()]);
        const entries = buildCompetenceLevelGlossaryEntries(palette);

        expect(entries.get('kompetenzstufe')?.body).toBe(SCALE_TEXT);
        expect(entries.get('ger')?.body).toBe(SCALE_TEXT);
    });

    it("prints shared prose once and lists each scale's ladder under it", () => {
        // SL shows subjects with different ladders side by side, and nothing in the payload
        // says which ladder a hovered word means, so the popup describes every one of them.
        // The prose around the list is the same for every subject; repeated per scale it
        // would print two identical paragraphs.
        palette.registerCompetenceLevelScales([nwValueGroup(), gerValueGroup()]);
        const entries = buildCompetenceLevelGlossaryEntries(palette);

        expect(entries.get('kompetenzstufe')?.body).toBe(
            `${SCALE_PROSE}${COMPETENCE_LEVEL_LADDER}<hr>${GER_LADDER}`,
        );
        // Both concept keys carry the same body by design.
        expect(entries.get('ger')?.body).toBe(entries.get('kompetenzstufe')?.body);
    });

    it('keeps the scales apart when their prose genuinely differs', () => {
        // Grouping by prose is an optimisation for uniform text; a state that describes its
        // ladder in its own words must still get that text, not have its ladder filed under
        // another scale's paragraph.
        const ownWords = '<p>Eigene Beschreibung:</p><ul><li>A2</li></ul>';
        palette.registerCompetenceLevelScales([
            nwValueGroup(),
            {
                ...gerValueGroup(),
                properties: [{ key: 'competenceScaleDescription', value: ownWords }],
            },
        ]);

        expect(buildCompetenceLevelGlossaryEntries(palette).get('kompetenzstufe')?.body).toBe(
            `${SCALE_TEXT}<hr>${ownWords}`,
        );
    });

    it('stamps no key for a level the payload left undescribed', () => {
        // An empty popup is worse than none: the value must render as plain text rather
        // than advertising help it cannot give.
        palette.registerCompetenceLevelScales([
            handWrittenScaleValueGroup({
                competenceLevels: [{ id: '1', nameShort: 'KS 1' }],
            }),
        ]);

        expect(palette.getLevelGlossaryKey('KS 1')).toBeNull();
        expect(buildCompetenceLevelGlossaryEntries(palette).size).toBe(0);
    });
});

describe('payload glossary entries stay out of the term matcher', () => {
    /** @type {GlossaryAnnotator} */
    let glossary;

    beforeEach(() => {
        palette = new CompetenceLevelPalette();
        glossary = new GlossaryAnnotator(
            {
                sl: {
                    shared: {
                        element_texts: {
                            kompetenzstufe: {
                                aliases: ['Kompetenzstufe'],
                                title: 'Kompetenzstufe',
                            },
                        },
                    },
                },
            },
            'sl',
        );
        palette.registerCompetenceLevelScales([nwValueGroup()]);
        glossary.registerPayloadEntries(buildCompetenceLevelGlossaryEntries(palette));
    });

    it('resolves a payload entry by explicit key', () => {
        expect(glossary.getEntry(required(glossary.resolveEntryKey('ks 1')))?.body).toBe(
            '<p>KS 1 erklärt</p>',
        );
    });

    it('never annotates a bare level name found in running prose', () => {
        // Level names are short, ambiguous tokens: registered as aliases they would wrap
        // roman numerals and stray letters anywhere they appear.
        const html = '<p>Kapitel KS 1 behandelt k.h.N. und A1 im Text.</p>';
        expect(glossary.annotateHTML(html)).toBe(html);
    });
});

describe('the shipped datasets all explain their own levels', () => {
    beforeEach(() => {
        palette = new CompetenceLevelPalette();
    });

    /**
     * One dataset per scale vocabulary the dashboards can show, read from the shipped
     * fixtures rather than a hand-written value group: this assertion fails if a dataset
     * stops carrying the field.
     * @type {Array<[string, string[]]>}
     */
    const FIXTURE_DATASETS = [
        ['data/ma/3a_mid', ['I', 'V']],
        ['data/sl/sl', ['Ia', 'Ib']],
    ];
    /**
     * Register the value groups and expect a described entry for each level and for the scale.
     * @param {CompetenceLevelsValueGroup[]} valueGroups - The dataset's own value groups.
     * @param {string[]} expectedLevels - Levels that must be described.
     * @param {string} label - The dataset, for the failure messages.
     * @returns {ReturnType<typeof buildCompetenceLevelGlossaryEntries>}
     */
    function expectDescribedLevels(valueGroups, expectedLevels, label) {
        palette.registerCompetenceLevelScales(valueGroups);
        const entries = buildCompetenceLevelGlossaryEntries(palette);

        for (const level of expectedLevels) {
            const key = palette.getLevelGlossaryKey(level);
            expect(key, `${label} stamps no key for ${level}`).not.toBeNull();
            expect(
                entries.get(required(key))?.body,
                `${label} has no text for ${level}`,
            ).toBeTruthy();
        }

        // And the scale as a whole, which is what the "Kompetenzstufe" popup shows.
        expect(
            entries.get('kompetenzstufe')?.body,
            `${label} ships no scale description`,
        ).toBeTruthy();
        return entries;
    }

    it.each(FIXTURE_DATASETS)(
        '%s describes every level it ships',
        async (dataset, expectedLevels) => {
            const response = await fetch(`/${dataset}/competence-levels.json`);
            expect(response.ok, `${dataset} is not served`).toBe(true);
            // The answer also carries the student value groups; the app registers from the rest.
            /** @type {CompetenceLevelsValueGroup[]} */
            const answer = await response.json();
            const requests = dataset.startsWith('data/sl/') ? SCHOOL_REQUESTS : GROUP_REQUESTS.ma;
            const bucketOf = valueGroupBucketsFor(required(requests[0]), answer);
            const valueGroups = answer.filter((valueGroup) => bucketOf(valueGroup) === 'own');
            expectDescribedLevels(valueGroups, expectedLevels, dataset);
        },
    );
});

// @vitest-browser
import { describe, it, expect, beforeEach } from 'vitest';
import { CompetenceLevelPalette } from '../../../src/common/services/competenceLevelPalette.js';
import { getBandColorsByLevel } from '../../../src/common/services/competenceLevelColors.js';

import {
    GER_LEVELS,
    GER_SPANS,
    KS_LEVELS,
    KS_SPLIT_LEVELS,
    ROMAN_LEVELS,
    VERA3_ROMAN_LEVELS,
    bandColor,
    handWrittenScaleValueGroup,
    itemValueGroups,
    ladderValueGroup,
    scaleValueGroup,
} from '../../support/competenceScaleFixture.js';
import { required } from '../../support/required.js';

/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../../../src/common/services/competenceScalePayload.js').StandardBand} StandardBand */

/**
 * Shape of one `competence-levels.json` value group, trimmed to what the palette reads, every
 * level shipping `description: null` the way an export leaves the field empty.
 * @param {string[]} levelNames - The ladder, lowest first.
 * @param {string[]} [names] - Per-level KMK standard wording.
 * @returns {CompetenceLevelsValueGroup}
 */
const valueGroup = (levelNames, names = []) =>
    ladderValueGroup(levelNames, names, { descriptions: [] });

/** The KMK standards of the roman ladder, lowest first. */
const ROMAN_SPLIT_STANDARDS = [
    'Unter Mindeststandard',
    'Unter Mindeststandard',
    'Mindeststandard',
    'Regelstandard',
    'Regelstandard plus',
    'Optimalstandard',
];

/**
 * A registered level's entry, asserted present.
 * @param {string} level
 * @param {string} [scaleId] - Which ladder `level` belongs to.
 * @returns {NonNullable<ReturnType<CompetenceLevelPalette['getCompetenceLevelEntry']>>}
 */
const levelEntry = (level, scaleId) =>
    required(palette.getCompetenceLevelEntry(level, scaleId), level);

/** @type {CompetenceLevelPalette} */
let palette = new CompetenceLevelPalette();

beforeEach(() => {
    palette = new CompetenceLevelPalette();
});

describe('competenceLevelPalette', () => {
    describe('lookup', () => {
        it('finds a level whatever its case', () => {
            palette.registerCompetenceLevelScales([valueGroup(GER_LEVELS)]);

            expect(bandColor(palette, 'b1', undefined, 'default')).toBe(
                bandColor(palette, 'B1', undefined, 'default'),
            );
        });

        it('returns null for anything that is not a registered level', () => {
            // Renderers use a null band to tell competence-level fields apart from
            // gender / richtig-falsch fields. A permissive fallback would paint a gender
            // segment as a competence band.
            palette.registerCompetenceLevelScales([valueGroup(GER_LEVELS)]);

            expect(bandColor(palette, 'gender_male', undefined, 'default')).toBeNull();
            expect(palette.getCompetenceLevelEntry('C2')).toBeNull();
            expect(palette.getCompetenceLevelEntry(null)).toBeNull();
        });

        it('holds two scales side by side', () => {
            // The SL dashboard shows Deutsch/Mathe (Roman) next to the languages
            // (GER) on one page, so one scale must not overwrite the other.
            palette.registerCompetenceLevelScales([
                valueGroup(ROMAN_LEVELS),
                valueGroup(GER_LEVELS),
            ]);

            expect(palette.getScaleLevelNames('III')).toEqual(ROMAN_LEVELS);
            expect(palette.getScaleLevelNames('B1')).toEqual(GER_LEVELS);
            expect(Object.keys(getBandColorsByLevel(palette, 'default'))).toHaveLength(11);
        });

        it('registers a repeated scale once', () => {
            // Every group / school / state value group of a payload repeats the same scale.
            palette.registerCompetenceLevelScales([
                valueGroup(GER_LEVELS),
                valueGroup(GER_LEVELS),
                valueGroup(GER_LEVELS),
            ]);

            expect(Object.keys(getBandColorsByLevel(palette, 'default'))).toEqual(GER_LEVELS);
        });
    });

    describe('getRegisteredLevels', () => {
        it('lists every entry in registration order, the item scale included', () => {
            // The colour resolver paints from this list and keys its map by bare name
            // with "last registered wins", so the order is part of the contract.
            palette.registerCompetenceLevelScales([valueGroup(GER_LEVELS)]);
            palette.registerCompetenceLevelScales([valueGroup(ROMAN_LEVELS)]);

            expect(palette.getRegisteredLevels().map((entry) => entry.name)).toEqual([
                ...GER_LEVELS,
                ...ROMAN_LEVELS,
            ]);
            expect(palette.getRegisteredLevels()).not.toBe(palette.getRegisteredLevels());
        });
    });

    describe('colliding level names across scales', () => {
        it('holds both scales rather than letting the later one overwrite the earlier', () => {
            // Overwriting would paint one scale with the other's ramp.
            palette.registerCompetenceLevelScales([valueGroup(['A1', 'A2', 'B1'])]);
            palette.registerCompetenceLevelScales([valueGroup(GER_LEVELS)]);

            const short = levelEntry('A2', 'A1|A2|B1');
            const long = levelEntry('A2', 'A1|A2|B1|B2|C1');

            expect(short.levelCount).toBe(3);
            expect(long.levelCount).toBe(5);
        });

        it('resolves a colliding name to the last registered scale when no scale is named', () => {
            palette.registerCompetenceLevelScales([valueGroup(['A1', 'A2', 'B1'])]);
            palette.registerCompetenceLevelScales([valueGroup(GER_LEVELS)]);

            expect(levelEntry('A2').levelCount).toBe(5);
        });

        it('folds a truncated scale into the full one instead of registering a rival', () => {
            // A state export may report each domain's scale as only the part of the
            // ladder that domain reached, so one payload carries `k.h.N., KS 1…KS 5`
            // next to `KS 1…KS 5` and `KS 2…KS 5`. Registered separately they would be
            // three scales with three level counts, and the last registered would decide
            // what a bare `KS 3` looks like.
            palette.registerCompetenceLevelScales([
                valueGroup(['KS 2', 'KS 3', 'KS 4', 'KS 5']),
                valueGroup(KS_LEVELS),
                valueGroup(['KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
            ]);

            expect(levelEntry('KS 3').levelCount).toBe(6);
            expect(palette.getScaleLevelNames('KS 3')).toEqual(KS_LEVELS);
        });

        it('keeps two genuinely different ladders apart, each resolvable by its own scale', () => {
            // The Deutsch ladder against the Mathematik ladder, which splits KS 1: five
            // shared level names, two scales. Registered deepest-first, Deutsch lands
            // last and would win all five names.
            palette.registerCompetenceLevelScales([
                valueGroup(KS_LEVELS),
                valueGroup(KS_SPLIT_LEVELS),
            ]);

            // `KS 1a` and `KS 1` are unique to their own ladder, so they name each scale
            // without a hardcoded scale id.
            const mathe = levelEntry('KS 1a').scaleId;
            const deutsch = levelEntry('KS 1').scaleId;

            expect(mathe).not.toBe(deutsch);
            expect(levelEntry('KS 2', mathe).levelCount).toBe(7);
            expect(levelEntry('KS 2', deutsch).levelCount).toBe(6);
        });

        it('names the levels of whichever ladder the caller asks for', () => {
            // Without a scale, `getScaleLevelNames('KS 3')` answers with the ladder
            // registered last, so a Mathematik legend would never name `KS 1a`/`KS 1b`.
            const deutschLadder = KS_LEVELS;
            const matheLadder = KS_SPLIT_LEVELS;
            palette.registerCompetenceLevelScales([
                valueGroup(deutschLadder),
                valueGroup(matheLadder),
            ]);

            const mathe = levelEntry('KS 1a').scaleId;
            const deutsch = levelEntry('KS 1').scaleId;

            expect(palette.getScaleLevelNames('KS 3', mathe)).toEqual(matheLadder);
            expect(palette.getScaleLevelNames('KS 3', deutsch)).toEqual(deutschLadder);
        });

        it('paints one name two colors when two ladders place it differently', () => {
            // Mathematik's `KS 2` is the 4th of 7 bands and Deutsch's the 3rd of 6,
            // so they are different points on the ramp.
            palette.registerCompetenceLevelScales([
                valueGroup(KS_LEVELS),
                valueGroup(KS_SPLIT_LEVELS),
            ]);

            const mathe = levelEntry('KS 1a').scaleId;
            const deutsch = levelEntry('KS 1').scaleId;

            expect(bandColor(palette, 'KS 2', mathe, 'default')).not.toBe(
                bandColor(palette, 'KS 2', deutsch, 'default'),
            );
        });
    });

    describe('standard bands', () => {
        /**
         * Per scale, the level names a band question selects.
         * @param {'e'|'ge'|'le'} operator
         * @param {StandardBand} standardBand
         * @returns {string[][]} One per scale, in registration order.
         */
        const select = (operator, standardBand) =>
            palette
                .getStandardBandSelection(operator, standardBand)
                .map((selection) => selection.levels.map((level) => level.name));

        it('reads the KMK standard off the payload, not off the level position', () => {
            // Position cannot carry the meaning: `B1` is the third of five GER bands and is
            // Regelstandard; `A2.2` is the fourth of six and is not.
            palette.registerCompetenceLevelScales([
                valueGroup(ROMAN_LEVELS, ROMAN_SPLIT_STANDARDS),
            ]);

            expect(ROMAN_LEVELS.map((level) => levelEntry(level).standardBand)).toEqual([
                'low',
                'low',
                null,
                'medium',
                null,
                'high',
            ]);
        });

        it('reads only the shipped band, never the standard its name states', () => {
            // Band and wording agree in an export, so the fixture makes them disagree to
            // pin which one is read.
            palette.registerCompetenceLevelScales([
                handWrittenScaleValueGroup({
                    properties: [{ key: 'standardBand:1', value: 'high' }],
                    competenceLevels: [{ id: '1', nameShort: 'x', name: 'Regelstandard' }],
                }),
            ]);

            expect(levelEntry('x').standardBand).toBe('high');
            expect(select('e', 'medium')).toEqual([]);
        });

        it('reads a malformed band as absent', () => {
            palette.registerCompetenceLevelScales([
                handWrittenScaleValueGroup({
                    properties: [
                        { key: 'standardBand:1', value: 'Regelstandard' },
                        { key: 'standardBand:2', value: '3' },
                        { key: 'standardBand:3', value: 'high' },
                    ],
                    competenceLevels: [
                        { id: '1', nameShort: 'x' },
                        { id: '2', nameShort: 'y' },
                        { id: '3', nameShort: 'z' },
                    ],
                }),
            ]);

            expect(['x', 'y', 'z'].map((level) => levelEntry(level).standardBand)).toEqual([
                null,
                null,
                'high',
            ]);
        });

        it('selects nothing from a scale that tags no band', () => {
            // Unknown, never a guess and never 0: a metric over this scale stays unanswered.
            palette.registerCompetenceLevelScales([valueGroup(GER_LEVELS)]);

            expect(palette.scaleHasStandardBand('B1')).toBe(false);
            expect(select('ge', 'medium')).toEqual([]);
        });

        it('places untagged levels by their position on the ladder', () => {
            // `k.h.N.` sits below the low band, `ReStd+` above the medium one, `MiStd` below it.
            palette.registerCompetenceLevelScales([
                valueGroup(KS_LEVELS, ['', ...ROMAN_SPLIT_STANDARDS.slice(1)]),
                valueGroup(
                    ['MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'],
                    ROMAN_SPLIT_STANDARDS.slice(1),
                ),
            ]);

            expect(select('le', 'low')).toEqual([['k.h.N.', 'KS 1'], ['MiStd-']]);
            expect(select('ge', 'medium')).toEqual([
                ['KS 3', 'KS 4', 'KS 5'],
                ['ReStd', 'ReStd+', 'OptStd'],
            ]);
            expect(select('le', 'medium')[1]).toEqual(['MiStd-', 'MiStd', 'ReStd']);
        });

        it('takes a band with several levels as a whole', () => {
            // rp/sl English: B1.1 and B1.2 are both Regelstandard, and there is no high band.
            const levels = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'];
            palette.registerCompetenceLevelScales([
                valueGroup(levels, [
                    'unter Mindeststandard',
                    'unter Mindeststandard',
                    'Mindeststandard',
                    'Mindeststandard',
                    'Regelstandard',
                    'Regelstandard',
                ]),
            ]);

            expect(select('ge', 'medium')).toEqual([['B1.1', 'B1.2']]);
            expect(select('e', 'medium')).toEqual([['B1.1', 'B1.2']]);
            expect(select('le', 'low')).toEqual([['A1.1', 'A1.2']]);
            expect(select('e', 'high')).toEqual([]);
            expect(palette.scaleHasStandardBand('B1.1')).toBe(true);
        });

        it("takes a level's band from whichever value group tags it, not just the first", () => {
            // A state export may leave `name` empty and ship no band key on some
            // value groups carrying the scale. First-value-group-wins would make every
            // Überblick metric depend on which value group the export wrote first.
            const levels = ['MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'];
            palette.registerCompetenceLevelScales([
                valueGroup(levels, ['', '', '', '', '']),
                valueGroup(levels, ROMAN_SPLIT_STANDARDS.slice(1)),
            ]);

            expect(levels.map((level) => levelEntry(level).standardBand)).toEqual([
                'low',
                null,
                'medium',
                null,
                'high',
            ]);
        });

        it('answers per scale across every loaded scale at once, VERA 3 and VERA 8 alike', () => {
            // One SL page holds Deutsch and Englisch on different ladders; a metric has
            // to span both without naming either.
            palette.registerCompetenceLevelScales([
                valueGroup(ROMAN_LEVELS, ROMAN_SPLIT_STANDARDS),
                valueGroup(GER_LEVELS, ROMAN_SPLIT_STANDARDS.slice(1)),
                valueGroup(VERA3_ROMAN_LEVELS, ROMAN_SPLIT_STANDARDS.slice(1)),
            ]);

            expect(select('ge', 'medium')).toEqual([
                ['III', 'IV', 'V'],
                ['B1', 'B2', 'C1'],
                ['III', 'IV', 'V'],
            ]);
            expect(select('le', 'low').map((levels) => levels.at(-1))).toEqual(['Ib', 'A1', 'I']);
            expect(palette.scaleHasStandardBand('Ia')).toBe(true);
            expect(palette.scaleHasStandardBand('B1')).toBe(true);
        });
    });

    describe('item-level spans', () => {
        /**
         * A ladder over the CEFR slots with the spans the server ships for it.
         * @param {string[]} levels
         * @param {Array<string|null>} spans - Per level, its `itemLevelSpan` value; null ships none.
         * @returns {CompetenceLevelsValueGroup}
         */
        const spanned = (levels, spans) =>
            scaleValueGroup(levels.map((nameShort, index) => ({ nameShort, span: spans[index] })));

        /**
         * The reporting level an item on `slot` paints as, through an item ladder whose
         * level `slot-<n>` sits on slot n.
         * @param {number} slot
         * @returns {string|null} The reporting level's name.
         */
        const reportingNameAt = (slot) => {
            palette.registerItemCompetenceScales(
                itemValueGroups(Array.from({ length: 11 }, (_, index) => `slot-${index + 1}`)),
            );
            return palette.getItemLevel(`slot-${slot}`)?.reportingLevel?.name ?? null;
        };

        it('maps a slot to the reporting level whose span covers it', () => {
            palette.registerCompetenceLevelScales([
                ladderValueGroup(GER_LEVELS, [], { spans: GER_SPANS }),
            ]);

            expect(reportingNameAt(1)).toBe('A1');
            expect(reportingNameAt(6)).toBe('B1');
            expect(reportingNameAt(10)).toBe('C1');
            expect(reportingNameAt(11)).toBeNull();
            expect(palette.getItemLevel(null)).toBeNull();
        });

        it('reads a missing or malformed span as no span', () => {
            palette.registerCompetenceLevelScales([
                spanned(['a', 'b', 'c', 'd', 'e'], ['1', '3-', '5-4', '0', 'x']),
            ]);

            expect(
                ['a', 'b', 'c', 'd', 'e'].map((level) => levelEntry(level).itemLevelSpan),
            ).toEqual([{ from: 1, to: 1 }, null, null, null, null]);
            expect(reportingNameAt(3)).toBeNull();
        });

        it('answers from the first registered scale covering the slot', () => {
            // rp/sl English: TH-1 tops out at B1.2 (`6-10`), TH-3 at C1 (`9-10`).
            const th1 = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'];
            const th3 = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'C1'];
            palette.registerCompetenceLevelScales([
                spanned(th1, ['1', '2', '3', '4', '5', '6-10']),
                spanned(th3, ['1', '2', '3', '4', '5-8', '9-10']),
            ]);

            expect(reportingNameAt(9)).toBe('B1.2');
        });

        it("keeps the container's span when a truncated run folds into it", () => {
            // nw French TH-2 starts at `KS 2`, which then covers slots 1-4; on the full
            // ladder `KS 2` is `3-4`.
            palette.registerCompetenceLevelScales([
                spanned(KS_LEVELS, [null, '1-2', '3-4', '5-6', '7-8', '9-10']),
                spanned(KS_LEVELS.slice(2), ['1-4', '5-6', '7-8', '9-10']),
            ]);

            expect(levelEntry('KS 2').itemLevelSpan).toEqual({ from: 3, to: 4 });
            expect(levelEntry('k.h.N.').itemLevelSpan).toBeNull();
        });
    });

    describe('scale ordinal', () => {
        it('orders levels by the scale the payload shipped, not by their spelling', () => {
            // Alphabetically `k.h.N.`, the lowest level, sorts after `KS 5`, which
            // stacks a bar's segments in the wrong order.
            palette.registerCompetenceLevelScales([valueGroup(KS_LEVELS)]);

            const shuffled = [...KS_LEVELS].sort();
            expect(shuffled).not.toEqual(KS_LEVELS);
            expect(
                [...shuffled].sort(
                    (a, b) =>
                        palette.getCompetenceLevelOrdinal(a) - palette.getCompetenceLevelOrdinal(b),
                ),
            ).toEqual(KS_LEVELS);
        });

        it('keeps Ia before Ib in scale order and sends unknown levels last', () => {
            palette.registerCompetenceLevelScales([valueGroup(ROMAN_LEVELS)]);

            expect(
                ['V', 'Ib', 'nicht-teilgenommen', 'Ia'].sort(
                    (a, b) =>
                        palette.getCompetenceLevelOrdinal(a) - palette.getCompetenceLevelOrdinal(b),
                ),
            ).toEqual(['Ia', 'Ib', 'V', 'nicht-teilgenommen']);
        });
    });
});

describe('payload-supplied descriptions', () => {
    /**
     * A value group carrying the scale's own prose plus one description per level.
     * @param {string[]} levelNames - The ladder, lowest first.
     * @param {string|null} scaleText - Null for none.
     * @returns {CompetenceLevelsValueGroup}
     */
    function describedValueGroup(levelNames, scaleText) {
        return handWrittenScaleValueGroup({
            properties: scaleText ? [{ key: 'competenceScaleDescription', value: scaleText }] : [],
            competenceLevels: levelNames.map((nameShort, index) => ({
                id: String(index + 1),
                nameShort,
                name: nameShort,
                description: `<p>${nameShort}</p>`,
            })),
        });
    }

    it('reads prose off `description`', () => {
        palette.registerCompetenceLevelScales([describedValueGroup(['A1', 'A2'], null)]);

        expect(palette.getLevelDescriptions().get('a1')).toEqual({
            name: 'A1',
            description: '<p>A1</p>',
        });
    });

    it('reports one description per distinct scale on a multi-subject page', () => {
        // SL renders Deutsch, Englisch and Französisch together; each ladder describes
        // itself, so the concept popup cannot pick just one.
        const de = '<p>Deutsch-Skala</p>';
        const en = '<p>Englisch-Skala</p>';
        palette.registerCompetenceLevelScales([
            describedValueGroup(['k.h.N.', 'KS 1', 'KS 2'], de),
            describedValueGroup(['A1', 'A2', 'B1'], en),
        ]);

        expect(palette.getScaleDescriptions()).toEqual([de, en]);
    });

    it('falls back to the reporting level covering an item level the aggregate scale does not list', () => {
        // EN's aggregates ship `A1 … C1` while the same group's `items.json` grades every
        // item `A1.1 … C1.1`; the aggregate's `itemLevelSpan` says which one covers it.
        palette.registerCompetenceLevelScales([
            ladderValueGroup(GER_LEVELS, [], {
                descriptions: GER_LEVELS.map((level) => `<p>${level}</p>`),
                spans: GER_SPANS,
            }),
        ]);
        palette.registerItemCompetenceScales(itemValueGroups(['A1.1', 'A1.2', 'A2.1', 'C1.1']));

        expect(palette.getLevelGlossaryKey('A1.2')).toBe('a1');
        expect(palette.getLevelGlossaryKey('C1')).toBe('c1');
        // A value that is no level in any spelling still stamps nothing.
        expect(palette.getLevelGlossaryKey('N/A')).toBeNull();
    });

    it('prefers the level itself when the scale ships it', () => {
        // On an `A1.1 … B1.2` ladder the sub-levels are levels with their own text, so
        // the item-slot fallback must not shadow them.
        palette.registerCompetenceLevelScales([
            describedValueGroup(['A1.1', 'A1.2', 'A2.1'], null),
        ]);

        expect(palette.getLevelGlossaryKey('A1.2')).toBe('a1.2');
    });

    it('reports nothing for levels the payload ships without a description', () => {
        palette.registerCompetenceLevelScales([valueGroup(GER_LEVELS)]);

        expect(palette.getScaleDescriptions()).toEqual([]);
        expect(palette.getLevelDescriptions().size).toBe(0);
        // No text means no key: an empty popup is worse than none.
        expect(palette.getLevelGlossaryKey('A1')).toBeNull();
    });
});

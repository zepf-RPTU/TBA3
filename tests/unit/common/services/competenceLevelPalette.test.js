import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
    getCompetencyBand,
    getCompetencyLevelOrdinal,
    getLevelDescriptions,
    getLevelGlossaryKey,
    getLevelNamesForStandardRank,
    getRegisteredLevels,
    getScaleDescriptions,
    getScaleLevelNames,
    getStandardRank,
    hasAnyStandardRank,
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
    scaleHasStandardRanks,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    getBandColor,
    getBandColorsByLevel,
    hasDataColors,
} from '@tba3/modules/common/services/competenceLevelColors.js';
import { scalePayloadRow } from '../../support/competenceScaleFixture.js';

/**
 * Shape of one `competence-levels.json` row, trimmed to what the palette reads.
 * `names` supplies the KMK standard each level carries, from which `scalePayloadRow`
 * derives the `standardRank:<id>` properties the export ships; omitted, `name` mirrors
 * `nameShort`, which is what a state export sends for a scale that names no standard —
 * and a level whose `name` states no standard ships no key at all.
 *
 * The name→rank step is the *server's*, and it lives once in `competenceScaleFixture.js`
 * rather than being re-derived here: the client reads the number, never the German.
 * @param {string[]} levelNames - The ladder, lowest first.
 * @param {Array<string|null>} [descriptions] - Per-level `description`, prose or a hex.
 * @param {string[]} [names] - Per-level KMK standard wording.
 * @returns {{properties: Array<object>, competenceLevels: Array<object>}} The row.
 */
function row(levelNames, descriptions = [], names = []) {
    return scalePayloadRow(
        levelNames.map((nameShort, index) => ({
            nameShort,
            name: names[index] ?? nameShort,
            description: descriptions[index] ?? null,
        })),
    );
}

const GER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const ROMAN_SPLIT_LEVELS = ['Ia', 'Ib', 'II', 'III', 'IV', 'V'];

/** The standards `data/sl/sl/competence-levels.json` names for the roman ladder. */
const ROMAN_SPLIT_STANDARDS = [
    'Unter Mindeststandard',
    'Unter Mindeststandard',
    'Mindeststandard',
    'Regelstandard',
    'Regelstandard plus',
    'Optimalstandard',
];

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe('competenceLevelPalette', () => {
    describe('lookup', () => {
        it('accepts the field-name vocabularies renderers use', () => {
            // WHY: stacked bars key their fields as `ks_<level>`; tables and legends pass
            // the bare name. Both must reach the same band or a bar and its legend
            // swatch disagree.
            registerCompetenceLevelScales([row(GER_LEVELS)]);

            expect(getBandColor('ks_B1', 'default')).toBe(getBandColor('B1', 'default'));
            expect(getBandColor('b1', 'default')).toBe(getBandColor('B1', 'default'));
        });

        it('returns null for anything that is not a registered level', () => {
            // WHY: renderers use a null band to tell competence-level fields apart from
            // gender / richtig-falsch fields. A permissive fallback would paint a gender
            // segment as a competence band.
            registerCompetenceLevelScales([row(GER_LEVELS)]);

            expect(getBandColor('gender_male', 'default')).toBeNull();
            expect(getCompetencyBand('C2')).toBeNull();
            expect(getCompetencyBand(null)).toBeNull();
        });

        it('holds two scales side by side', () => {
            // WHY: the SL dashboard shows Deutsch/Mathe (Roman) next to the languages
            // (GER) on one page, so one scale must not overwrite the other.
            registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS), row(GER_LEVELS)]);

            expect(getScaleLevelNames('III')).toEqual(ROMAN_SPLIT_LEVELS);
            expect(getScaleLevelNames('B1')).toEqual(GER_LEVELS);
            expect(Object.keys(getBandColorsByLevel('default'))).toHaveLength(11);
        });

        it('registers a repeated scale once', () => {
            // Every class / school / state row of a payload repeats the same scale.
            registerCompetenceLevelScales([row(GER_LEVELS), row(GER_LEVELS), row(GER_LEVELS)]);

            expect(Object.keys(getBandColorsByLevel('default'))).toEqual(GER_LEVELS);
        });
    });

    describe('getRegisteredLevels', () => {
        it('lists every entry in registration order, the item scale included', () => {
            // WHY: the colour resolver paints from this list and keys its map by bare name
            // with "last registered wins", so the order is part of the contract.
            registerCompetenceLevelScales([row(GER_LEVELS)]);
            registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS)]);

            expect(getRegisteredLevels().map((entry) => entry.name)).toEqual([
                ...GER_LEVELS,
                ...ROMAN_SPLIT_LEVELS,
            ]);
            expect(getRegisteredLevels()).not.toBe(getRegisteredLevels());
        });
    });

    describe('colliding level names across scales', () => {
        let warn;

        beforeEach(() => {
            warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        });

        afterEach(() => {
            warn.mockRestore();
        });

        it('holds both scales rather than letting the later one overwrite the earlier', () => {
            // WHY: this used to warn and overwrite, so one scale was silently painted with
            // the other's ramp. The registry is keyed by (scale, level) now, so both
            // survive and the warning has nothing left to report.
            registerCompetenceLevelScales([row(['A1', 'A2', 'B1'])]);
            registerCompetenceLevelScales([row(['A1', 'A2', 'B1', 'B2', 'C1'])]);

            const short = getCompetencyBand('A2', 'A1|A2|B1');
            const long = getCompetencyBand('A2', 'A1|A2|B1|B2|C1');

            expect(warn).not.toHaveBeenCalled();
            expect(short.bandCount).toBe(3);
            expect(long.bandCount).toBe(5);
        });

        it('resolves a colliding name to the last registered scale when no scale is named', () => {
            // WHY: every existing caller passes a bare name and must keep the answer it
            // got before this became scale-aware. Last-registration-wins is exactly what
            // the overwrite used to produce, so nothing downstream shifts.
            registerCompetenceLevelScales([row(['A1', 'A2', 'B1'])]);
            registerCompetenceLevelScales([row(['A1', 'A2', 'B1', 'B2', 'C1'])]);

            expect(getCompetencyBand('A2').bandCount).toBe(5);
        });

        it('folds a truncated scale into the full one instead of registering a rival', () => {
            // WHY: Nordrhein-Westfalen reports each domain's scale as only the part of
            // the ladder that domain reached, so one payload carries `k.h.N., KS 1…KS 5`
            // next to `KS 1…KS 5` and `KS 2…KS 5`. Registered separately they are three
            // scales with three band counts, and because the registry is keyed by level
            // name, whichever registered last decides what `KS 3` looks like everywhere.
            const full = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
            registerCompetenceLevelScales([
                row(['KS 2', 'KS 3', 'KS 4', 'KS 5']),
                row(full),
                row(['KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
            ]);

            expect(warn).not.toHaveBeenCalled();
            expect(getCompetencyBand('KS 3').bandCount).toBe(6);
            expect(getScaleLevelNames('KS 3')).toEqual(full);
        });

        it('keeps two genuinely different ladders apart, each resolvable by its own scale', () => {
            // NRW's Deutsch ladder against its Mathematik ladder, which splits KS 1. They
            // share five level names but are not the same scale. An NRW school export
            // carries both: registered deepest-first, so Deutsch lands last and would win
            // all five names outright.
            registerCompetenceLevelScales([
                row(['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
                row(['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
            ]);

            // `KS 1a` and `KS 1` are unique to their own ladder, so they name each scale
            // unambiguously without the test hardcoding a scale id.
            const mathe = getCompetencyBand('KS 1a').scaleId;
            const deutsch = getCompetencyBand('KS 1').scaleId;

            expect(warn).not.toHaveBeenCalled();
            expect(mathe).not.toBe(deutsch);
            expect(getCompetencyBand('KS 2', mathe).bandCount).toBe(7);
            expect(getCompetencyBand('KS 2', deutsch).bandCount).toBe(6);
        });

        it('names the levels of whichever ladder the caller asks for', () => {
            // WHY: this is the wrong-ladder `getScaleLevelNames` symptom. Asked about
            // `KS 3` with no scale, the answer is whichever registered last — which is how
            // a Mathematik legend came to enumerate Deutsch's levels and could never name
            // `KS 1a`/`KS 1b`.
            const deutschLadder = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
            const matheLadder = ['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
            registerCompetenceLevelScales([row(deutschLadder), row(matheLadder)]);

            const mathe = getCompetencyBand('KS 1a').scaleId;
            const deutsch = getCompetencyBand('KS 1').scaleId;

            expect(getScaleLevelNames('KS 3', mathe)).toEqual(matheLadder);
            expect(getScaleLevelNames('KS 3', deutsch)).toEqual(deutschLadder);
        });

        it('paints one name two colors when two ladders place it differently', () => {
            // WHY: the user-visible half. Mathematik's `KS 2` is the 4th of 7 bands and
            // Deutsch's is the 3rd of 6, so they are different points on the ramp. While
            // one overwrote the other both were painted the loser's color.
            registerCompetenceLevelScales([
                row(['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
                row(['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
            ]);

            const mathe = getCompetencyBand('KS 1a').scaleId;
            const deutsch = getCompetencyBand('KS 1').scaleId;

            expect(getBandColor('KS 2', 'default', mathe)).not.toBe(
                getBandColor('KS 2', 'default', deutsch),
            );
        });
    });

    describe('standard ranks', () => {
        it('reads the KMK standard off the payload, not off the level position', () => {
            // WHY: position cannot carry the meaning. `B1` is the third of five GER
            // bands and IS rank 3; `A2.2` is the fourth of six and is rank 2. Only the
            // shipped `standardRank:<id>` says which; the level's `name` is never consulted.
            registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS, [], ROMAN_SPLIT_STANDARDS)]);

            expect(ROMAN_SPLIT_LEVELS.map((level) => getStandardRank(level))).toEqual([
                1, 1, 2, 3, 4, 5,
            ]);
        });

        it('reads only the shipped rank, never the standard its name states', () => {
            // WHY: this is the whole point of retiring the name→rank table. The client
            // used to normalize a German string and look it up, so a state whose wording
            // it had not been taught silently lost every rank-based metric. The two
            // agree on every state export, so the only way to pin which one is read is to
            // make them disagree on purpose.
            registerCompetenceLevelScales([
                {
                    properties: [{ key: 'standardRank:1', value: '5' }],
                    competenceLevels: [{ id: '1', nameShort: 'x', name: 'Regelstandard' }],
                },
            ]);

            expect(getStandardRank('x')).toBe(5);
        });

        it('reports unknown for a scale that ships names but no rank keys', () => {
            // The contract in one case: a wording alone says nothing. Unknown, never a
            // guess and never 0 — `hasAnyStandardRank` is the gate that keeps a metric
            // from rendering a confident zero off a scale that cannot express it.
            registerCompetenceLevelScales([
                {
                    competenceLevels: ROMAN_SPLIT_LEVELS.map((nameShort, index) => ({
                        id: String(index + 1),
                        nameShort,
                        name: ROMAN_SPLIT_STANDARDS[index],
                    })),
                },
            ]);

            expect(ROMAN_SPLIT_LEVELS.map((level) => getStandardRank(level))).toEqual([
                null,
                null,
                null,
                null,
                null,
                null,
            ]);
            expect(hasAnyStandardRank()).toBe(false);
        });

        it('ignores a rank outside the scale vocabulary rather than banding on it', () => {
            // Arrives as a string over the wire. A 0 or a 9 would sort and band silently
            // wrong, and there is no name fallback left to catch it — so the bad value
            // has to read as unknown while its neighbour still resolves.
            registerCompetenceLevelScales([
                {
                    properties: [
                        { key: 'standardRank:1', value: '9' },
                        { key: 'standardRank:2', value: 'Regelstandard' },
                        { key: 'standardRank:3', value: '5' },
                    ],
                    competenceLevels: [
                        { id: '1', nameShort: 'x', name: 'Regelstandard' },
                        { id: '2', nameShort: 'y', name: 'Regelstandard plus' },
                        { id: '3', nameShort: 'z', name: 'Optimalstandard' },
                    ],
                },
            ]);

            // Both bad values are unknown — but bounded by the one good rank above them.
            expect(getStandardRank('x')).toBe(null);
            expect(getStandardRank('y')).toBe(null);
            expect(getStandardRank('z')).toBe(5);
        });

        it('still infers a rank for a band the payload deliberately leaves unranked', () => {
            // NRW's `k.h.N.` names no standard and so ships no rank key — by design on
            // both sides. Its position below the ranked floor is what makes it rank 1,
            // and that inference has to read the shipped ranks too, not just names.
            registerCompetenceLevelScales([
                {
                    properties: [2, 3, 4, 5, 6].map((id, index) => ({
                        key: `standardRank:${id}`,
                        value: String(index + 1),
                    })),
                    competenceLevels: ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'].map(
                        (nameShort, index) => ({
                            id: String(index + 1),
                            nameShort,
                            name: nameShort,
                        }),
                    ),
                },
            ]);

            expect(getStandardRank('KS 3')).toBe(3);
            expect(getLevelNamesForStandardRank((rank) => rank <= 1)).toEqual(['k.h.N.', 'KS 1']);
        });

        it('returns null for a scale whose names are just its short names', () => {
            // A state export sends `name === nameShort` for its GER scales, or omits
            // `name` altogether. Unknown, never rank 0.
            registerCompetenceLevelScales([row(GER_LEVELS)]);

            expect(GER_LEVELS.map((level) => getStandardRank(level))).toEqual([
                null,
                null,
                null,
                null,
                null,
            ]);
            expect(scaleHasStandardRanks('B1')).toBe(false);
            expect(getLevelNamesForStandardRank((rank) => rank >= 3)).toEqual([]);
        });

        it("takes a level's standard from whichever row ranks it, not just the first", () => {
            // WHY: a state does not fill the standard on every row carrying the scale —
            // Nordrhein-Westfalen can leave `name` empty on many rows of its Deutsch
            // ladder, and ship no rank key there either. First-row-wins would
            // make every Überblick metric depend on which row the export happened to
            // write first, and the failure is a whole view quietly disappearing.
            const levels = ['MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'];
            registerCompetenceLevelScales([
                row(levels, [], ['', '', '', '', '']),
                row(levels, [], ROMAN_SPLIT_STANDARDS.slice(1)),
            ]);

            expect(levels.map((level) => getStandardRank(level))).toEqual([1, 2, 3, 4, 5]);
        });

        it('names the levels of a rank across every loaded scale at once', () => {
            // One SL page holds Deutsch and Englisch on different ladders; a metric has
            // to span both without naming either.
            registerCompetenceLevelScales([
                row(ROMAN_SPLIT_LEVELS, [], ROMAN_SPLIT_STANDARDS),
                row(GER_LEVELS, [], ROMAN_SPLIT_STANDARDS.slice(1)),
            ]);

            expect(getLevelNamesForStandardRank((rank) => rank >= 3)).toEqual([
                'III',
                'IV',
                'V',
                'B1',
                'B2',
                'C1',
            ]);
            expect(scaleHasStandardRanks('III')).toBe(true);
            expect(scaleHasStandardRanks('B1')).toBe(true);
        });
    });

    describe('bounded ranks for levels the scale did not name', () => {
        /** Nordrhein-Westfalen's Deutsch ladder: `k.h.N.` carries no `name` at all. */
        const NRW_LEVELS = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
        const NRW_STANDARDS = ['', ...ROMAN_SPLIT_STANDARDS.slice(1)];

        it('counts a level below the minimum standard as below it', () => {
            // WHY: `k.h.N.` is "konnte hier nicht nachgewiesen werden" — students who did
            // not place on the scale at all. Dropping it from the numerator while still
            // counting it in the denominator made the `le_1` metric report, with one
            // `k.h.N.` student and four in `KS 1` out of 20, 4/20 = 20 % where 5/20 = 25 %
            // are below it. The bound comes from the level named above it, not from its
            // position: nothing may be inferred for a scale that names nothing.
            registerCompetenceLevelScales([row(NRW_LEVELS, [], NRW_STANDARDS)]);

            expect(getStandardRank('k.h.N.')).toBeNull();
            expect(getLevelNamesForStandardRank((rank) => rank <= 1)).toEqual(['k.h.N.', 'KS 1']);
        });

        it('never counts an unnamed level toward a standard it might not have reached', () => {
            registerCompetenceLevelScales([row(NRW_LEVELS, [], NRW_STANDARDS)]);

            expect(getLevelNamesForStandardRank((rank) => rank >= 3)).toEqual([
                'KS 3',
                'KS 4',
                'KS 5',
            ]);
            expect(getLevelNamesForStandardRank((rank) => rank === 5)).toEqual(['KS 5']);
        });

        it('leaves a scale that names nothing fully unknown', () => {
            // The whole point of the bound: a GER Englisch ladder names no
            // standard anywhere, so every level keeps the full 1…5 interval and satisfies no
            // metric. A share the scale cannot express stays unknown, never a confident 0 %.
            registerCompetenceLevelScales([row(GER_LEVELS)]);

            expect(getLevelNamesForStandardRank((rank) => rank <= 1)).toEqual([]);
            expect(getLevelNamesForStandardRank((rank) => rank >= 3)).toEqual([]);
        });

        it('bounds a level from both sides when the ladder names its neighbours', () => {
            // A gap in the middle is genuinely ambiguous — Mindeststandard or Regelstandard —
            // so neither metric may claim it, even though both bounds are known.
            registerCompetenceLevelScales([
                row(['MiStd', 'Zwischen', 'ReStd'], [], ['Mindeststandard', '', 'Regelstandard']),
            ]);

            expect(getLevelNamesForStandardRank((rank) => rank <= 2)).toEqual(['MiStd']);
            expect(getLevelNamesForStandardRank((rank) => rank >= 3)).toEqual(['ReStd']);
            expect(getLevelNamesForStandardRank((rank) => rank >= 2)).toEqual([
                'MiStd',
                'Zwischen',
                'ReStd',
            ]);
        });
    });

    describe('scale ordinal', () => {
        it('orders levels by the scale the payload shipped, not by their spelling', () => {
            // WHY: alphabetically `k.h.N.` — the lowest level — sorts after `KS 5`, and
            // `OptStd` sorts between `MiStd--` and `ReStd`. Both produce a stacked bar
            // whose segments are in the wrong order and which looks entirely normal.
            const nrw = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
            registerCompetenceLevelScales([row(nrw)]);

            const shuffled = [...nrw].sort();
            expect(shuffled).not.toEqual(nrw);
            expect(
                [...shuffled].sort(
                    (a, b) => getCompetencyLevelOrdinal(a) - getCompetencyLevelOrdinal(b),
                ),
            ).toEqual(nrw);
        });

        it('keeps a split band in scale order and sends unknown levels last', () => {
            registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS)]);

            expect(
                ['V', 'Ib', 'nicht-teilgenommen', 'Ia'].sort(
                    (a, b) => getCompetencyLevelOrdinal(a) - getCompetencyLevelOrdinal(b),
                ),
            ).toEqual(['Ia', 'Ib', 'V', 'nicht-teilgenommen']);
        });
    });
});

describe('payload-supplied descriptions', () => {
    /** A row carrying the scale's own prose plus one description per level. */
    function describedRow(levelNames, scaleText) {
        return {
            properties: scaleText ? [{ key: 'competenceScaleDescription', value: scaleText }] : [],
            competenceLevels: levelNames.map((nameShort, index) => ({
                id: String(index + 1),
                nameShort,
                name: nameShort,
                description: `<p>${nameShort}</p>`,
            })),
        };
    }

    it('reads prose off `description` without mistaking it for a color', () => {
        // The field is dual-carrier: prose on a value-group's levels, a hex literal on an
        // item's. Sniffing is what keeps both payload shapes working, so prose must not
        // land in the palette and a color must not land in the glossary.
        registerCompetenceLevelScales([describedRow(['A1', 'A2'], null)]);

        expect(getLevelDescriptions().get('a1')).toEqual({ name: 'A1', description: '<p>A1</p>' });
        // No color was shipped, so the "Landesvorgabe" theme must not be offered — which
        // is exactly what would break if prose were read as a color.
        expect(hasDataColors()).toBe(false);
    });

    it("keeps the container scale's prose when a truncated run folds into it", () => {
        // NRW ships several truncated ladders of one scale (a domain that only reached
        // `KS 2`…`KS 5`). Its prose enumerates only the bands that domain reached, so
        // letting it win would describe the full scale by a fragment of itself.
        const full = '<p>voll: k.h.N. bis KS 5</p>';
        const partial = '<p>teil: KS 2 bis KS 5</p>';
        registerCompetenceLevelScales([
            describedRow(['KS 2', 'KS 3', 'KS 4', 'KS 5'], partial),
            describedRow(['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'], full),
        ]);

        expect(getScaleDescriptions()).toEqual([full]);
    });

    it('reports one description per distinct scale on a multi-subject page', () => {
        // SL renders Deutsch, Englisch and Französisch together; each ladder describes
        // itself, so the concept popup cannot pick just one.
        const de = '<p>Deutsch-Skala</p>';
        const en = '<p>Englisch-Skala</p>';
        registerCompetenceLevelScales([
            describedRow(['k.h.N.', 'KS 1', 'KS 2'], de),
            describedRow(['A1', 'A2', 'B1'], en),
        ]);

        expect(getScaleDescriptions()).toEqual([de, en]);
    });

    it('keeps both texts when two subjects share one scale but describe it differently', () => {
        // An NRW school export can be exactly this: Deutsch and Englisch both run
        // `k.h.N., KS 1 … KS 5`, so they are one scaleId, and the Englisch prose may add a
        // sentence tying the stufen to the GER. No demo fixture exercises it — but keeping
        // one text per scale silently drops whichever the export wrote second, which is a
        // data-loss bug the moment any state describes a shared ladder two ways.
        const deutsch = '<p>Deutsch: k.h.N. bis KS 5</p>';
        const englisch = '<p>Englisch: k.h.N. bis KS 5, entspricht dem GER</p>';
        registerCompetenceLevelScales([
            describedRow(['k.h.N.', 'KS 1', 'KS 2'], deutsch),
            describedRow(['k.h.N.', 'KS 1', 'KS 2'], englisch),
        ]);

        expect(getScaleDescriptions()).toEqual([deutsch, englisch]);
    });

    it('falls back to the band for an item level the aggregate scale does not list', () => {
        // EN's aggregates ship `A1 … C1` while the same class's `items.json` grades every
        // item `A1.1 … C1.1`. Without the fallback every item level on those datasets
        // renders as plain text with no popup at all.
        registerCompetenceLevelScales([describedRow(GER_LEVELS, null)]);

        expect(getLevelGlossaryKey('A1.1')).toBe('a1');
        expect(getLevelGlossaryKey('C1')).toBe('c1');
        // A value that is no level in any spelling still stamps nothing.
        expect(getLevelGlossaryKey('N/A')).toBeNull();
    });

    it('prefers the sub-level over its band when the scale ships sub-levels', () => {
        // Niedersachsen's ladder is `A1.1 … B1.2`; those are levels in their own right
        // with their own text, so the band fallback must never shadow them.
        registerCompetenceLevelScales([describedRow(['A1.1', 'A1.2', 'A2.1'], null)]);

        expect(getLevelGlossaryKey('A1.2')).toBe('a1.2');
    });

    it('reports nothing for a payload that predates the field', () => {
        registerCompetenceLevelScales([row(GER_LEVELS)]);

        expect(getScaleDescriptions()).toEqual([]);
        expect(getLevelDescriptions().size).toBe(0);
        // And no text means no key, whatever the level: an empty popup is worse than none.
        expect(getLevelGlossaryKey('A1')).toBeNull();
    });
});

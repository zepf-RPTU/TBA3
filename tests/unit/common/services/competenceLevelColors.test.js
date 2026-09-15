import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
    getCompetencyBand,
    getScaleLevelNames,
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    DATA_THEME_ID,
    getBandColor,
    hasDataColors,
} from '@tba3/modules/common/services/competenceLevelColors.js';
import {
    RAMP_STOPS,
    SURFACES,
    contrastWithSurface,
} from '@tba3/modules/common/services/colorRamp.js';
import { scalePayloadRow } from '../../support/competenceScaleFixture.js';

/**
 * The five colors the app shipped as fixed `--ks-level-1…5` CSS variables before the
 * palette became data-driven. Every five-band scale must still resolve to exactly
 * these, or the change silently repainted every existing dashboard.
 */
const LEGACY_DEFAULT_RAMP = ['#d64550', '#c67f14', '#2f9e44', '#0c9ea3', '#3b5bd0'];
const LEGACY_GRAYSCALE_RAMP = ['#cccccc', '#a6a6a6', '#808080', '#595959', '#333333'];

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
 * @param {Array<string|null>} [colors] - Per-level `levelColor:<id>` row property, the
 *        only carrier a state's ramp arrives on. A `null` ships no key for that band.
 * @param {string[]} [names] - Per-level KMK standard wording.
 * @returns {{properties: Array<object>, competenceLevels: Array<object>}} The row.
 */
function row(levelNames, colors = [], names = []) {
    return scalePayloadRow(
        levelNames.map((nameShort, index) => ({ nameShort, name: names[index] ?? nameShort })),
        colors.flatMap((color, index) =>
            color ? [{ key: `levelColor:${index + 1}`, value: color }] : [],
        ),
    );
}

/**
 * The same row with prose in each level's `description` and no colour anywhere.
 * @param {string[]} levelNames - The ladder, lowest first.
 * @param {Array<string|null>} descriptions - Per-level `description` prose.
 * @returns {{properties: Array<object>, competenceLevels: Array<object>}} The row.
 */
function descriptionRow(levelNames, descriptions) {
    return scalePayloadRow(
        levelNames.map((nameShort, index) => ({
            nameShort,
            name: nameShort,
            description: descriptions[index] ?? null,
        })),
    );
}

/**
 * An NRW-style `competence-levels.json` row, trimmed to what the palette reads:
 * the six-band NRW ladder with the state's own ramp on the row, `description` empty.
 * `levelColor:2` is `#ffffff`, as NRW prescribes — the chart surface exactly.
 */
function nwRow() {
    const colors = ['#d9d9d9', '#ffffff', '#cadef2', '#9cc2e5', '#2e74b5', '#1f4e79'];
    const names = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];

    return {
        properties: [
            { key: 'competenceScale', value: 'nw-en-en-le' },
            ...colors.map((value, index) => ({ key: `levelColor:${index + 1}`, value })),
        ],
        competenceLevels: names.map((nameShort, index) => ({
            id: String(index + 1),
            nameShort,
            name: nameShort,
            description: null,
        })),
    };
}

const GER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const ROMAN_SPLIT_LEVELS = ['Ia', 'Ib', 'II', 'III', 'IV', 'V'];

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe('competenceLevelColors', () => {
    describe('generated ramps', () => {
        it('reproduces the historical five colors for a five-band scale', () => {
            // WHY: EN/MA/SL fixtures are all five-band. If sampling drifted by a single
            // channel here, every existing chart would change color for no stated reason.
            registerCompetenceLevelScales([row(GER_LEVELS)]);

            expect(GER_LEVELS.map((level) => getBandColor(level, 'default'))).toEqual(
                LEGACY_DEFAULT_RAMP,
            );
        });

        it('reproduces the historical five grays under the grayscale theme', () => {
            registerCompetenceLevelScales([row(GER_LEVELS)]);

            expect(GER_LEVELS.map((level) => getBandColor(level, 'grayscale'))).toEqual(
                LEGACY_GRAYSCALE_RAMP,
            );
        });

        it('gives a six-band scale six distinct colors', () => {
            // WHY: this is the whole point of the change — a state that publishes
            // "k.h.N., KS 1 … KS 5" must not have two of its bands collapse onto one
            // color, which is what the fixed five-variable palette forced.
            const levels = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
            registerCompetenceLevelScales([row(levels)]);

            const colors = levels.map((level) => getBandColor(level, 'default'));

            expect(colors).toHaveLength(6);
            expect(new Set(colors).size).toBe(6);
        });

        it('keeps the ramp endpoints anchored whatever the band count', () => {
            // WHY: the lowest band must stay the "below standard" end of the ramp and
            // the highest the "well above" end; only the steps between may be resampled.
            registerCompetenceLevelScales([row(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'])]);

            expect(getBandColor('S1', 'default')).toBe(LEGACY_DEFAULT_RAMP[0]);
            expect(getBandColor('S7', 'default')).toBe(LEGACY_DEFAULT_RAMP[4]);
        });
    });

    describe('sub-bands', () => {
        it('leaves an unsplit band exactly on its ramp step', () => {
            // WHY: this is the no-regression guarantee. Every scale in the repo except
            // SL's Roman one is entirely unsplit, so any shading that leaked into the
            // single-sub-band case would repaint EN, MA and SL's GER scale.
            registerCompetenceLevelScales([row(GER_LEVELS)]);

            expect(GER_LEVELS.map((level) => getBandColor(level, 'default'))).toEqual(
                LEGACY_DEFAULT_RAMP,
            );
        });

        it('treats a split first level as five bands, not six', () => {
            // WHY: Ia/Ib is one band split in two, so the Roman scale must resolve to
            // the same five ramp steps as the GER scale — II is the second band, not the
            // third. This is what proves shading did not shift the band ramp.
            registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS)]);

            expect(
                ['Ib', 'II', 'III', 'IV', 'V'].map((level) => getBandColor(level, 'default')),
            ).toEqual(LEGACY_DEFAULT_RAMP);
        });

        it('darkens the lower sub-band and leaves the higher one on the band color', () => {
            // WHY: Ia and Ib both carry real counts and render as adjacent segments, so
            // they must be tellable apart — but only Ia may move, since Ib was the band
            // color before sub-bands were shaded rather than striped.
            registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS)]);

            const ia = getBandColor('Ia', 'default');
            const ib = getBandColor('Ib', 'default');

            expect(ib).toBe(LEGACY_DEFAULT_RAMP[0]);
            expect(ia).not.toBe(ib);
            // Darker, so higher contrast against the white surface — never lighter.
            expect(contrastWithSurface(ia)).toBeGreaterThan(contrastWithSurface(ib));
        });

        it('never makes a sub-band harder to see than its band', () => {
            // WHY: shading must only ever darken. Lightening #d64550 by the same step
            // lands at ≈2.8:1 on white, under the floor the color ramps are validated
            // against — so a scatter dot or parallel-coordinate line, which carries no
            // label, would stop reading. Asserted relative to the band because the
            // grayscale ramp starts at #cccccc and never met an absolute floor; it
            // buys legibility with the per-band fill patterns instead.
            registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS)]);

            for (const theme of ['default', 'grayscale', 'colorblind']) {
                expect(
                    contrastWithSurface(getBandColor('Ia', theme)),
                    `Ia @ ${theme}`,
                ).toBeGreaterThan(contrastWithSurface(getBandColor('Ib', theme)));
            }
        });

        it('keeps the default ramp above the 3:1 chart-surface floor', () => {
            // WHY: the default ramp is the one documented as clearing 3:1 on white at
            // every step, so a color-only mark reads without a label. Shading a sub-band
            // must not introduce the first color that breaks it. (Only this ramp — the
            // grayscale and Okabe-Ito stops sit below 3:1 by their own design.)
            registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS)]);

            for (const level of ROMAN_SPLIT_LEVELS) {
                expect(
                    contrastWithSurface(getBandColor(level, 'default')),
                    level,
                ).toBeGreaterThanOrEqual(3);
            }
        });

        it('collapses dotted GER sub-levels onto their band', () => {
            // WHY: a state publishing A1.1/A1.2/… still has five GER bands; treating the
            // ten sub-levels as ten bands would lose the A1…C1 reading entirely.
            registerCompetenceLevelScales([
                row([
                    'A1.1',
                    'A1.2',
                    'A2.1',
                    'A2.2',
                    'B1.1',
                    'B1.2',
                    'B2.1',
                    'B2.2',
                    'C1.1',
                    'C1.2',
                ]),
            ]);

            expect(getCompetencyBand('A1.1')?.bandCount).toBe(5);
            // The higher sub-band holds the band color; the lower is a darker shade of it.
            expect(getBandColor('C1.2', 'default')).toBe(LEGACY_DEFAULT_RAMP[4]);
            expect(getBandColor('C1.1', 'default')).not.toBe(LEGACY_DEFAULT_RAMP[4]);
            expect(contrastWithSurface(getBandColor('A1.1', 'default'))).toBeGreaterThan(
                contrastWithSurface(getBandColor('A1.2', 'default')),
            );
        });
    });

    describe('the description field', () => {
        it('keeps a description as prose and never as a colour', () => {
            // WHY: `description` is prose, full stop — `levelColor:<id>` is the only
            // colour carrier. Even a hex there must not light up the Landesvorgabe theme
            // with nothing behind it.
            registerCompetenceLevelScales([
                descriptionRow(GER_LEVELS, [
                    'Kann Aussagen zu zentralen Aspekten begründen',
                    '#9cc2e5',
                ]),
            ]);

            expect(hasDataColors()).toBe(false);
            expect(getCompetencyBand('A1')).toMatchObject({
                dataColor: null,
                descriptionText: 'Kann Aussagen zu zentralen Aspekten begründen',
            });
            expect(getCompetencyBand('A2')).toMatchObject({
                dataColor: null,
                descriptionText: '#9cc2e5',
            });
        });

        it('reports no data colors for the all-null fixtures', () => {
            registerCompetenceLevelScales([row(GER_LEVELS)]);

            expect(hasDataColors()).toBe(false);
        });
    });

    describe('the levelColor properties', () => {
        it('takes the whole ramp from the row properties', () => {
            registerCompetenceLevelScales([
                row(GER_LEVELS, ['#ddebf7', '#bdd7ee', '#9bc2e6', '#2f75b5', '#1f4e78']),
            ]);

            expect(hasDataColors()).toBe(true);
            expect(GER_LEVELS.map((level) => getBandColor(level, DATA_THEME_ID))).toEqual([
                '#ddebf7',
                '#bdd7ee',
                '#9bc2e6',
                '#2f75b5',
                '#1f4e78',
            ]);
        });

        it('falls back to the generated ramp for levels the data left uncolored', () => {
            // WHY: a partially-colored payload must still paint every band rather than
            // leaving holes that render as the neutral "unknown field" gray.
            registerCompetenceLevelScales([row(GER_LEVELS, ['#ddebf7', null, '#9bc2e6'])]);

            expect(getBandColor('A1', DATA_THEME_ID)).toBe('#ddebf7');
            expect(getBandColor('A2', DATA_THEME_ID)).toBe(LEGACY_DEFAULT_RAMP[1]);
        });

        it("takes the row's levelColor:<id> as the level color", () => {
            // WHY: this is where a state export actually puts its ramp — the states
            // never fill `description`. Reading only `description` is what kept the
            // Landesvorgabe theme hidden on all three dashboards.
            registerCompetenceLevelScales([nwRow()]);

            expect(hasDataColors()).toBe(true);
            expect(getBandColor('KS 5', DATA_THEME_ID)).toBe('#1f4e79');
            expect(getBandColor('k.h.N.', DATA_THEME_ID)).toBe('#d9d9d9');
        });

        it('keys on the level id, not on array position', () => {
            // WHY: `id` is the export's band number and is the documented
            // join key. A scale whose ids do not start at 1 — or arrive out of order —
            // must still paint each band its own color rather than its neighbour's.
            registerCompetenceLevelScales([
                {
                    properties: [
                        { key: 'levelColor:7', value: '#1f4e79' },
                        { key: 'levelColor:6', value: '#2e74b5' },
                    ],
                    competenceLevels: [
                        { id: '6', nameShort: 'KS 4', name: 'KS 4', description: null },
                        { id: '7', nameShort: 'KS 5', name: 'KS 5', description: null },
                    ],
                },
            ]);

            expect(getBandColor('KS 4', DATA_THEME_ID)).toBe('#2e74b5');
            expect(getBandColor('KS 5', DATA_THEME_ID)).toBe('#1f4e79');
        });

        it('drops a shipped white to the generated ramp instead of painting nothing', () => {
            // WHY: NRW really does prescribe `#ffffff` for `KS 1`, which is the chart
            // surface exactly. MIN_SURFACE_CONTRAST exists for this band, and until
            // `levelColor:<id>` was read it could never fire on a state payload.
            registerCompetenceLevelScales([nwRow()]);

            expect(getCompetencyBand('KS 1')?.dataColor).toBe('#ffffff');
            expect(getBandColor('KS 1', DATA_THEME_ID)).toBe(getBandColor('KS 1', 'default'));
        });

        it('ignores a hex in description beside the row property', () => {
            // WHY: `description` is prose whatever it looks like, so an export that fills
            // both cannot repaint a band from the field the server documents as prose.
            registerCompetenceLevelScales([
                {
                    properties: [{ key: 'levelColor:1', value: '#ddebf7' }],
                    competenceLevels: [
                        { id: '1', nameShort: 'A1', name: 'A1', description: '#1f4e78' },
                    ],
                },
            ]);

            expect(getBandColor('A1', DATA_THEME_ID)).toBe('#ddebf7');
        });

        it('recovers a color from a truncated row folded into the full scale', () => {
            // WHY: `collectMaximalScales` merges a domain that only reached part of the
            // ladder into the full one. If the color were read after that merge, the
            // truncated row's properties would be the ones silently dropped.
            registerCompetenceLevelScales([
                {
                    properties: null,
                    competenceLevels: GER_LEVELS.map((nameShort, index) => ({
                        id: String(index + 1),
                        nameShort,
                        name: nameShort,
                        description: null,
                    })),
                },
                {
                    properties: [{ key: 'levelColor:3', value: '#9bc2e6' }],
                    competenceLevels: [{ id: '3', nameShort: 'B1', name: 'B1', description: null }],
                },
            ]);

            expect(getScaleLevelNames('B1')).toEqual(GER_LEVELS);
            expect(getBandColor('B1', DATA_THEME_ID)).toBe('#9bc2e6');
        });

        it('ignores a malformed color value', () => {
            // WHY: a non-hex value must degrade to the generated ramp, not reach the DOM
            // as a `fill` the browser silently discards.
            registerCompetenceLevelScales([
                {
                    properties: [{ key: 'levelColor:1', value: 'blau' }],
                    competenceLevels: [{ id: '1', nameShort: 'A1', name: 'A1', description: null }],
                },
            ]);

            expect(hasDataColors()).toBe(false);
            expect(getCompetencyBand('A1')?.dataColor).toBeNull();
        });
    });

    describe('unusable data colors', () => {
        it('drops a level whose shipped color is the chart surface itself', () => {
            // WHY: Nordrhein-Westfalen's ramp includes `#ffffff`. Painted as-is the
            // segment is not light, it is absent — the bar shows a gap where a whole
            // competence level should be.
            //
            // Constructed, not loaded: no checked-in fixture ships a levelColor ramp, so
            // no SL payload exercises this path today.
            registerCompetenceLevelScales([
                row(GER_LEVELS, ['#ffffff', '#cadef2', '#9cc2e5', '#2e74b5', '#1f4e79']),
            ]);

            expect(getBandColor('A1', DATA_THEME_ID)).toBe(LEGACY_DEFAULT_RAMP[0]);
            expect(getBandColor('A2', DATA_THEME_ID)).toBe('#cadef2');
        });

        it('keeps the shipped color on the entry and decides visibility per surface', () => {
            // WHY: whether `#ffffff` is visible depends on the surface, and the surface
            // follows the colour scheme, which the reader can switch after the payload was
            // registered. So the entry keeps what the state shipped and the palette
            // resolve applies the one rule against the active surface.
            registerCompetenceLevelScales([row(GER_LEVELS, ['#ffffff', '#cadef2'])]);

            expect(getCompetencyBand('A1')?.dataColor).toBe('#ffffff');
            expect(getCompetencyBand('A2')?.dataColor).toBe('#cadef2');
            expect(getBandColor('A1', DATA_THEME_ID)).toBe(LEGACY_DEFAULT_RAMP[0]);
        });

        it('offers no data theme when every shipped color is invisible', () => {
            registerCompetenceLevelScales([
                row(GER_LEVELS, ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff']),
            ]);

            expect(hasDataColors()).toBe(false);
        });

        it('keeps a merely light color, because that is the palette the state chose', () => {
            // The shipped ramps are Excel cell fills and most of every state's is under
            // 3:1 on white. Applying the generated ramps' contrast floor here would
            // discard the majority of each payload and leave a hybrid of both palettes.
            registerCompetenceLevelScales([
                row(GER_LEVELS, ['#ddebf7', '#bdd7ee', '#9bc2e6', '#2f75b5', '#1f4e78']),
            ]);

            expect(contrastWithSurface('#ddebf7')).toBeLessThan(3);
            expect(getBandColor('A1', DATA_THEME_ID)).toBe('#ddebf7');
        });
    });
});

describe('on the dark colour scheme', () => {
    // The palette reads `data-color-scheme` off <html> exactly as it reads the KS theme.
    // This file runs in Node, so <html> is a stub carrying only that attribute.
    /** @type {{colorScheme?: string}} */
    let dataset;
    beforeEach(() => {
        resetCompetenceLevelPalette();
        dataset = { colorScheme: 'dark' };
        vi.stubGlobal('document', { documentElement: { dataset } });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        resetCompetenceLevelPalette();
    });

    it('lands a five-band scale on the dark stops of every generated theme', () => {
        registerCompetenceLevelScales([row(GER_LEVELS)]);

        for (const theme of ['default', 'grayscale', 'colorblind']) {
            expect(
                GER_LEVELS.map((level) => getBandColor(level, theme)),
                theme,
            ).toEqual([...RAMP_STOPS.dark[theme]]);
        }
    });

    it('lightens the lower sub-band instead of darkening it', () => {
        registerCompetenceLevelScales([row(ROMAN_SPLIT_LEVELS)]);

        const ia = getBandColor('Ia', 'default');
        const ib = getBandColor('Ib', 'default');
        expect(ib).toBe(RAMP_STOPS.dark.default[0]);
        expect(contrastWithSurface(ia, SURFACES.dark)).toBeGreaterThan(
            contrastWithSurface(ib, SURFACES.dark),
        );
    });

    it('flips the Landesvorgabe gate: white is visible, the surface itself is not', () => {
        registerCompetenceLevelScales([
            row(GER_LEVELS, ['#ffffff', '#1e2430', '#9cc2e5', '#2e74b5', '#1f4e79']),
        ]);

        expect(hasDataColors()).toBe(true);
        expect(getBandColor('A1', DATA_THEME_ID)).toBe('#ffffff');
        expect(getBandColor('A2', DATA_THEME_ID)).toBe(RAMP_STOPS.dark.default[1]);
    });

    it('offers no data theme when every shipped color is the dark surface', () => {
        registerCompetenceLevelScales([
            row(GER_LEVELS, ['#1e2430', '#1e2430', '#1e2430', '#1e2430', '#1e2430']),
        ]);

        expect(hasDataColors()).toBe(false);
    });

    it('re-resolves when the scheme flips back without re-registering', () => {
        registerCompetenceLevelScales([row(GER_LEVELS)]);
        expect(getBandColor('A1', 'default')).toBe(RAMP_STOPS.dark.default[0]);

        dataset.colorScheme = 'light';
        expect(getBandColor('A1', 'default')).toBe(LEGACY_DEFAULT_RAMP[0]);
    });
});

// @vitest-browser
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompetenceLevelPalette } from '../../../src/common/services/competenceLevelPalette.js';

import {
    DATA_THEME_ID,
    hasDataColors,
} from '../../../src/common/services/competenceLevelColors.js';
import {
    SURFACES,
    contrastWithSurface,
    getRampStops,
} from '../../../src/common/services/colorRamp.js';
import {
    GER_LEVELS,
    KS_LEVELS,
    KS_SPLIT_LEVELS,
    ROMAN_LEVELS,
    bandColor,
    handWrittenScaleValueGroup,
    ladderValueGroup,
} from '../../support/competenceScaleFixture.js';
import { required } from '../../support/required.js';

/**
 * The five-step ramps. Every five-band scale must resolve to exactly these, or every
 * dashboard is repainted.
 */
const FIVE_BAND_DEFAULT_RAMP = ['#a8022a', '#9d6402', '#08a759', '#098380', '#164dc2'];
const FIVE_BAND_GRAYSCALE_RAMP = ['#909090', '#747474', '#595959', '#3f3f3f', '#272727'];

/** @type {CompetenceLevelPalette} */
let palette = new CompetenceLevelPalette();

beforeEach(() => {
    palette = new CompetenceLevelPalette();
});

describe('competenceLevelColors', () => {
    describe('generated ramps', () => {
        it('resolves a five-band scale to the pinned five colors', () => {
            palette.registerCompetenceLevelScales([ladderValueGroup(GER_LEVELS)]);

            expect(
                GER_LEVELS.map((level) => bandColor(palette, level, undefined, 'default')),
            ).toEqual(FIVE_BAND_DEFAULT_RAMP);
        });

        it('resolves a five-band scale to the pinned five grays under the grayscale theme', () => {
            palette.registerCompetenceLevelScales([ladderValueGroup(GER_LEVELS)]);

            expect(
                GER_LEVELS.map((level) => bandColor(palette, level, undefined, 'grayscale')),
            ).toEqual(FIVE_BAND_GRAYSCALE_RAMP);
        });

        it('gives a six-level scale six distinct colors', () => {
            // A state that publishes "k.h.N., KS 1 … KS 5" must not have two of its
            // bands collapse onto one color.
            palette.registerCompetenceLevelScales([ladderValueGroup(KS_LEVELS)]);

            const colors = KS_LEVELS.map((level) =>
                bandColor(palette, level, undefined, 'default'),
            );

            expect(colors).toHaveLength(6);
            expect(new Set(colors).size).toBe(6);
        });

        it('centres the default ramp on the lowest level tagged medium', () => {
            // NW Deutsch: KS 3 is the Regelstandard boundary, so KS 2 is one warm step
            // below the green centre and KS 4 one cool step above it.
            palette.registerCompetenceLevelScales([
                ladderValueGroup(KS_LEVELS, [], {
                    bands: ['low', null, null, 'medium', null, 'high'],
                }),
            ]);

            expect(
                ['KS 2', 'KS 3', 'KS 4'].map((level) =>
                    bandColor(palette, level, undefined, 'default'),
                ),
            ).toEqual(FIVE_BAND_DEFAULT_RAMP.slice(1, 4));
        });

        it('paints a level shared by two ladders the same when it sits as far from medium', () => {
            // KS 1a/KS 1b lengthen Mathematik's warm arm; KS 2 … KS 5 keep their colours.
            const bands = (/** @type {string[]} */ levels) =>
                levels.map((level) => (level === 'KS 3' ? 'medium' : null));
            palette.registerCompetenceLevelScales([
                ladderValueGroup(KS_LEVELS, [], { bands: bands(KS_LEVELS) }),
                ladderValueGroup(KS_SPLIT_LEVELS, [], { bands: bands(KS_SPLIT_LEVELS) }),
            ]);
            const mathe = required(palette.getCompetenceLevelEntry('KS 1a')).scaleId;
            const deutsch = required(palette.getCompetenceLevelEntry('KS 1')).scaleId;

            for (const level of ['KS 2', 'KS 3', 'KS 4', 'KS 5']) {
                expect(bandColor(palette, level, mathe, 'default'), level).toBe(
                    bandColor(palette, level, deutsch, 'default'),
                );
            }
        });
    });

    describe('levels sharing a name stem', () => {
        it('gives Ia and Ib a step each, like any two levels', () => {
            palette.registerCompetenceLevelScales([ladderValueGroup(ROMAN_LEVELS)]);

            const colors = ROMAN_LEVELS.map((level) =>
                bandColor(palette, level, undefined, 'default'),
            );
            expect(new Set(colors).size).toBe(ROMAN_LEVELS.length);
            expect(palette.getCompetenceLevelEntry('Ia')?.levelCount).toBe(6);
        });

        it('keeps the default ramp above the 3:1 chart-surface floor', () => {
            // The default ramp clears 3:1 on white at every step, so a color-only
            // mark reads without a label. The grayscale stops sit below 3:1 by
            // design.
            palette.registerCompetenceLevelScales([ladderValueGroup(ROMAN_LEVELS)]);

            for (const level of ROMAN_LEVELS) {
                expect(
                    contrastWithSurface(
                        required(bandColor(palette, level, undefined, 'default')),
                        SURFACES.light,
                    ),
                    level,
                ).toBeGreaterThanOrEqual(3);
            }
        });

        it('gives dotted GER sub-levels a step each', () => {
            palette.registerCompetenceLevelScales([
                ladderValueGroup(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2']),
            ]);

            expect(palette.getCompetenceLevelEntry('A1.1')?.levelCount).toBe(6);
            expect(bandColor(palette, 'A1.1', undefined, 'default')).not.toBe(
                bandColor(palette, 'A1.2', undefined, 'default'),
            );
        });
    });

    describe('the description field', () => {
        it('keeps a description as prose and never as a colour', () => {
            // `levelColor:<id>` is the only colour carrier; a hex in `description`
            // must not enable the Landesvorgabe theme.
            palette.registerCompetenceLevelScales([
                ladderValueGroup(GER_LEVELS, [], {
                    descriptions: ['Kann Aussagen zu zentralen Aspekten begründen', '#9cc2e5'],
                }),
            ]);

            expect(hasDataColors(palette)).toBe(false);
            expect(palette.getCompetenceLevelEntry('A1')).toMatchObject({
                dataColor: null,
                descriptionText: 'Kann Aussagen zu zentralen Aspekten begründen',
            });
            expect(palette.getCompetenceLevelEntry('A2')).toMatchObject({
                dataColor: null,
                descriptionText: '#9cc2e5',
            });
        });

        it('reports no data colors for fixtures that ship none', () => {
            palette.registerCompetenceLevelScales([ladderValueGroup(GER_LEVELS)]);

            expect(hasDataColors(palette)).toBe(false);
        });
    });

    describe('the levelColor properties', () => {
        it('takes the whole ramp from the value group properties', () => {
            palette.registerCompetenceLevelScales([
                ladderValueGroup(GER_LEVELS, [], {
                    colors: ['#ddebf7', '#bdd7ee', '#9bc2e6', '#2f75b5', '#1f4e78'],
                }),
            ]);

            expect(hasDataColors(palette)).toBe(true);
            expect(
                GER_LEVELS.map((level) => bandColor(palette, level, undefined, DATA_THEME_ID)),
            ).toEqual(['#ddebf7', '#bdd7ee', '#9bc2e6', '#2f75b5', '#1f4e78']);
        });

        it('falls back to the generated ramp for levels the data left uncolored', () => {
            // A partially-colored payload must still paint every band rather than
            // leaving holes that render as the neutral "unknown field" gray.
            palette.registerCompetenceLevelScales([
                ladderValueGroup(GER_LEVELS, [], { colors: ['#ddebf7', null, '#9bc2e6'] }),
            ]);

            expect(bandColor(palette, 'A1', undefined, DATA_THEME_ID)).toBe('#ddebf7');
            expect(bandColor(palette, 'A2', undefined, DATA_THEME_ID)).toBe(
                FIVE_BAND_DEFAULT_RAMP[1],
            );
        });

        it("takes the value group's levelColor:<id> as the level color", () => {
            palette.registerCompetenceLevelScales([
                ladderValueGroup(KS_LEVELS, [], {
                    colors: ['#d9d9d9', '#ffffff', '#cadef2', '#9cc2e5', '#2e74b5', '#1f4e79'],
                }),
            ]);

            expect(hasDataColors(palette)).toBe(true);
            expect(bandColor(palette, 'KS 5', undefined, DATA_THEME_ID)).toBe('#1f4e79');
            expect(bandColor(palette, 'k.h.N.', undefined, DATA_THEME_ID)).toBe('#d9d9d9');
        });

        it('keys on the level id, not on array position', () => {
            // `id` is the join key. A scale whose ids do not start at 1, or arrive
            // out of order, must still paint each band its own color.
            palette.registerCompetenceLevelScales([
                handWrittenScaleValueGroup({
                    properties: [
                        { key: 'levelColor:7', value: '#1f4e79' },
                        { key: 'levelColor:6', value: '#2e74b5' },
                    ],
                    competenceLevels: [
                        { id: '6', nameShort: 'KS 4', name: 'KS 4' },
                        { id: '7', nameShort: 'KS 5', name: 'KS 5' },
                    ],
                }),
            ]);

            expect(bandColor(palette, 'KS 4', undefined, DATA_THEME_ID)).toBe('#2e74b5');
            expect(bandColor(palette, 'KS 5', undefined, DATA_THEME_ID)).toBe('#1f4e79');
        });

        it('recovers a color from a truncated value group folded into the full scale', () => {
            // `collectMaximalScales` merges a domain that only reached part of the
            // ladder into the full one. A color read after that merge would lose the
            // truncated value group's properties.
            palette.registerCompetenceLevelScales([
                handWrittenScaleValueGroup({
                    competenceLevels: GER_LEVELS.map((nameShort, index) => ({
                        id: String(index + 1),
                        nameShort,
                        name: nameShort,
                    })),
                }),
                handWrittenScaleValueGroup({
                    properties: [{ key: 'levelColor:3', value: '#9bc2e6' }],
                    competenceLevels: [{ id: '3', nameShort: 'B1', name: 'B1' }],
                }),
            ]);

            expect(palette.getScaleLevelNames('B1')).toEqual(GER_LEVELS);
            expect(bandColor(palette, 'B1', undefined, DATA_THEME_ID)).toBe('#9bc2e6');
        });
    });

    describe('unusable data colors', () => {
        it('drops a level whose shipped color is the chart surface itself', () => {
            // A shipped `#ffffff` painted as-is leaves a gap where a competence
            // level should be. Visibility depends on the surface, which follows the
            // colour scheme, so the entry keeps what the state shipped and the resolve
            // applies the rule against the active surface.
            palette.registerCompetenceLevelScales([
                ladderValueGroup(GER_LEVELS, [], {
                    colors: ['#ffffff', '#cadef2', '#9cc2e5', '#2e74b5', '#1f4e79'],
                }),
            ]);

            expect(palette.getCompetenceLevelEntry('A1')?.dataColor).toBe('#ffffff');
            expect(bandColor(palette, 'A1', undefined, DATA_THEME_ID)).toBe(
                FIVE_BAND_DEFAULT_RAMP[0],
            );
            expect(bandColor(palette, 'A2', undefined, DATA_THEME_ID)).toBe('#cadef2');
        });

        it('offers no data theme when every shipped color is invisible', () => {
            palette.registerCompetenceLevelScales([
                ladderValueGroup(GER_LEVELS, [], {
                    colors: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'],
                }),
            ]);

            expect(hasDataColors(palette)).toBe(false);
        });

        it('keeps a merely light color, because that is the palette the state chose', () => {
            // Applying the generated ramps' 3:1 floor to a shipped ramp would discard its
            // light steps and leave a hybrid of both palettes.
            palette.registerCompetenceLevelScales([
                ladderValueGroup(GER_LEVELS, [], {
                    colors: ['#ddebf7', '#bdd7ee', '#9bc2e6', '#2f75b5', '#1f4e78'],
                }),
            ]);

            expect(contrastWithSurface('#ddebf7', SURFACES.light)).toBeLessThan(3);
            expect(bandColor(palette, 'A1', undefined, DATA_THEME_ID)).toBe('#ddebf7');
        });
    });
});

describe('on the dark colour scheme', () => {
    // The Landesvorgabe gate reads `data-color-scheme` off <html>.
    beforeEach(() => {
        palette = new CompetenceLevelPalette();
        document.documentElement.dataset.colorScheme = 'dark';
    });
    afterEach(() => {
        delete document.documentElement.dataset.colorScheme;
        palette = new CompetenceLevelPalette();
    });

    it('lands a five-band scale on the dark stops of every generated theme', () => {
        palette.registerCompetenceLevelScales([ladderValueGroup(GER_LEVELS)]);

        for (const theme of ['default', 'grayscale']) {
            expect(
                GER_LEVELS.map((level) => bandColor(palette, level, undefined, theme, 'dark')),
                theme,
            ).toEqual([...getRampStops(theme, 'dark')]);
        }
    });

    it('steps a longer warm arm lighter, away from the dark surface', () => {
        // Ia sits one step further from the centre than Ib, so it is the lighter one.
        palette.registerCompetenceLevelScales([ladderValueGroup(ROMAN_LEVELS)]);

        const ia = bandColor(palette, 'Ia', undefined, 'default', 'dark');
        const ib = bandColor(palette, 'Ib', undefined, 'default', 'dark');
        expect(contrastWithSurface(required(ia), SURFACES.dark)).toBeGreaterThan(
            contrastWithSurface(required(ib), SURFACES.dark),
        );
    });

    it('flips the Landesvorgabe gate: white is visible, the surface itself is not', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(GER_LEVELS, [], {
                colors: ['#ffffff', '#1e2430', '#9cc2e5', '#2e74b5', '#1f4e79'],
            }),
        ]);

        expect(hasDataColors(palette)).toBe(true);
        expect(bandColor(palette, 'A1', undefined, DATA_THEME_ID, 'dark')).toBe('#ffffff');
        expect(bandColor(palette, 'A2', undefined, DATA_THEME_ID, 'dark')).toBe(
            getRampStops('default', 'dark')[1],
        );
    });

    it('offers no data theme when every shipped color is the dark surface', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(GER_LEVELS, [], {
                colors: ['#1e2430', '#1e2430', '#1e2430', '#1e2430', '#1e2430'],
            }),
        ]);

        expect(hasDataColors(palette)).toBe(false);
    });

    it('paints both schemes from one registration', () => {
        palette.registerCompetenceLevelScales([ladderValueGroup(GER_LEVELS)]);
        expect(bandColor(palette, 'A1', undefined, 'default', 'dark')).toBe(
            getRampStops('default', 'dark')[0],
        );
        expect(bandColor(palette, 'A1', undefined, 'default')).toBe(FIVE_BAND_DEFAULT_RAMP[0]);
    });
});

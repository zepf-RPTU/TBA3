import { describe, it, expect } from 'vitest';
import {
    RAMP_STOPS,
    SURFACES,
    contrastWithSurface,
    getRampStops,
    inkOn,
    sampleRamp,
    shadeSubBand,
} from '@tba3/modules/common/services/colorRamp.js';

/** The validator's 3:1 floor a colour-only categorical mark must clear against its surface. */
const MARK_CONTRAST_FLOOR = 3;
/** The validator's 2:1 floor for the faint end of an ordinal ramp. */
const ORDINAL_END_CONTRAST_FLOOR = 2;

describe('sampleRamp', () => {
    it('returns the authored stops verbatim when the count matches', () => {
        expect(sampleRamp(RAMP_STOPS.light.default, 5)).toEqual([...RAMP_STOPS.light.default]);
    });

    it('interpolates evenly for other counts and keeps the ends', () => {
        const samples = sampleRamp(RAMP_STOPS.light.grayscale, 3);
        expect(samples).toHaveLength(3);
        expect(samples[0]).toBe(RAMP_STOPS.light.grayscale[0]);
        expect(samples[2]).toBe(RAMP_STOPS.light.grayscale[4]);
        expect(samples[1]).toBe(RAMP_STOPS.light.grayscale[2]);
    });

    it('draws the top stop for a single band and nothing for none', () => {
        expect(sampleRamp(RAMP_STOPS.light.default, 1)).toEqual([RAMP_STOPS.light.default[4]]);
        expect(sampleRamp(RAMP_STOPS.light.default, 0)).toEqual([]);
    });
});

describe('getRampStops', () => {
    it('selects by scheme and theme, falling back to light and default', () => {
        expect(getRampStops('default', 'light')).toBe(RAMP_STOPS.light.default);
        expect(getRampStops('grayscale', 'dark')).toBe(RAMP_STOPS.dark.grayscale);
        expect(getRampStops('unknown', 'dark')).toBe(RAMP_STOPS.dark.default);
        expect(getRampStops('colorblind', /** @type {any} */ ('sepia'))).toBe(
            RAMP_STOPS.light.colorblind,
        );
    });

    it('keeps every dark stop above its floor on the dark surface', () => {
        // WHY: the dark set is its own validated ramp, not an inversion of the light one.
        // The light `default` blue sits at 2.66:1 on the dark surface and the light
        // grayscale collapses to 1.23:1 there — the whole reason a second set exists.
        // The chromatic ramps clear the categorical 3:1 floor; the grayscale ramp is an
        // ordinal one whose dim end only has to clear the validator's 2:1 light-end floor
        // (its light twin starts at #cccccc, 1.6:1 on white).
        for (const theme of ['default', 'colorblind']) {
            for (const stop of RAMP_STOPS.dark[theme]) {
                expect(
                    contrastWithSurface(stop, SURFACES.dark),
                    `${theme} ${stop}`,
                ).toBeGreaterThanOrEqual(MARK_CONTRAST_FLOOR);
            }
        }
        for (const stop of RAMP_STOPS.dark.grayscale) {
            expect(contrastWithSurface(stop, SURFACES.dark), stop).toBeGreaterThanOrEqual(
                ORDINAL_END_CONTRAST_FLOOR,
            );
        }
    });

    it('re-lights the grayscale ramp so step 5 stays the emphatic end on both surfaces', () => {
        const light = RAMP_STOPS.light.grayscale;
        const dark = RAMP_STOPS.dark.grayscale;
        expect(contrastWithSurface(light[4], SURFACES.light)).toBeGreaterThan(
            contrastWithSurface(light[0], SURFACES.light),
        );
        expect(contrastWithSurface(dark[4], SURFACES.dark)).toBeGreaterThan(
            contrastWithSurface(dark[0], SURFACES.dark),
        );
    });
});

describe('shadeSubBand', () => {
    it('leaves an unsplit band untouched and darkens the lower sub-band on light', () => {
        expect(shadeSubBand('#2f9e44', { subBandCount: 1, subBandIndex: 0 })).toBe('#2f9e44');
        const top = shadeSubBand('#2f9e44', { subBandCount: 2, subBandIndex: 1 });
        const bottom = shadeSubBand('#2f9e44', { subBandCount: 2, subBandIndex: 0 });
        expect(top).toBe('#2f9e44');
        expect(contrastWithSurface(bottom)).toBeGreaterThan(contrastWithSurface(top));
    });

    it('lightens the lower sub-band on dark, so shading still raises contrast', () => {
        const base = RAMP_STOPS.dark.default[0];
        const top = shadeSubBand(base, { subBandCount: 2, subBandIndex: 1 }, 'dark');
        const bottom = shadeSubBand(base, { subBandCount: 2, subBandIndex: 0 }, 'dark');
        expect(top).toBe(base);
        expect(contrastWithSurface(bottom, SURFACES.dark)).toBeGreaterThan(
            contrastWithSurface(top, SURFACES.dark),
        );
        // Away from the surface means darker on white and lighter on dark.
        expect(contrastWithSurface(bottom, SURFACES.light)).toBeLessThan(
            contrastWithSurface(base, SURFACES.light),
        );
    });
});

describe('inkOn', () => {
    it('keeps white while it clears 3:1 on the fill and goes dark below it', () => {
        // Every stop of the light and dark default ramps keeps a white label …
        for (const stop of [...RAMP_STOPS.light.default, ...RAMP_STOPS.dark.default]) {
            expect(inkOn(stop), stop).toBe('#ffffff');
        }
        // … the light end of either grayscale ramp does not.
        expect(inkOn(RAMP_STOPS.light.grayscale[0])).not.toBe('#ffffff');
        expect(inkOn(RAMP_STOPS.dark.grayscale[4])).not.toBe('#ffffff');
        expect(inkOn(RAMP_STOPS.dark.grayscale[0])).toBe('#ffffff');
    });
});

describe('contrastWithSurface', () => {
    it('ranges from the surface to its opposite and composites alpha against it', () => {
        expect(contrastWithSurface('#ffffff')).toBeCloseTo(1, 5);
        expect(contrastWithSurface('#000000')).toBeCloseTo(21, 5);
        expect(contrastWithSurface('#00000000')).toBeCloseTo(1, 5);
        expect(contrastWithSurface('#fff')).toBeCloseTo(1, 5);
    });

    it('is symmetric and measures against the given surface', () => {
        expect(contrastWithSurface('#1e2430', SURFACES.dark)).toBeCloseTo(1, 5);
        expect(contrastWithSurface('#ffffff', SURFACES.dark)).toBeGreaterThan(15);
        expect(contrastWithSurface('#00000000', SURFACES.dark)).toBeCloseTo(1, 5);
        expect(contrastWithSurface('#1e2430', '#ffffff')).toBeCloseTo(
            contrastWithSurface('#ffffff', '#1e2430'),
            5,
        );
    });
});

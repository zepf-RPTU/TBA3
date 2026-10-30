import { describe, it, expect } from 'vitest';
import {
    SURFACES,
    contrastWithSurface,
    getLevelColors,
    getRampStops,
    inkOn,
} from '../../../src/common/services/colorRamp.js';

/** The validator's 3:1 floor a colour-only categorical mark must clear against its surface. */
const MARK_CONTRAST_FLOOR = 3;
/** The validator's 2:1 floor for the faint end of an ordinal ramp. */
const ORDINAL_END_CONTRAST_FLOOR = 2;

describe('a sampled theme', () => {
    it('returns the authored stops verbatim for five levels', () => {
        expect(getLevelColors('grayscale', 'light', 5, null)).toEqual([
            ...getRampStops('grayscale', 'light'),
        ]);
    });

    it('interpolates evenly for other counts and keeps the ends', () => {
        const stops = getRampStops('grayscale', 'light');
        expect(getLevelColors('grayscale', 'light', 3, null)).toEqual([
            stops[0],
            stops[2],
            stops[4],
        ]);
    });

    it('draws the top stop for a single level and nothing for none', () => {
        expect(getLevelColors('grayscale', 'light', 1, null)).toEqual([
            getRampStops('grayscale', 'light')[4],
        ]);
        expect(getLevelColors('grayscale', 'light', 0, null)).toEqual([]);
    });
});

describe('getRampStops', () => {
    it('falls back to the light scheme and the default theme', () => {
        expect(getRampStops('unknown', 'dark')).toBe(getRampStops('default', 'dark'));
        expect(getRampStops('grayscale', /** @type {any} */ ('sepia'))).toBe(
            getRampStops('grayscale', 'light'),
        );
    });

    it('keeps every dark stop above its floor on the dark surface', () => {
        // The dark set is its own validated ramp: the light `default` blue sits at
        // 2.66:1 on the dark surface and the light grayscale at 1.23:1. The chromatic
        // ramp clears the categorical 3:1 floor; the grayscale ramp is ordinal, so its
        // dim end only has to clear the 2:1 floor.
        for (const stop of getRampStops('default', 'dark')) {
            expect(contrastWithSurface(stop, SURFACES.dark), stop).toBeGreaterThanOrEqual(
                MARK_CONTRAST_FLOOR,
            );
        }
        for (const stop of getRampStops('grayscale', 'dark')) {
            expect(contrastWithSurface(stop, SURFACES.dark), stop).toBeGreaterThanOrEqual(
                ORDINAL_END_CONTRAST_FLOOR,
            );
        }
    });

    it('re-lights the grayscale ramp so step 5 stays the emphatic end on both surfaces', () => {
        const light = getRampStops('grayscale', 'light');
        const dark = getRampStops('grayscale', 'dark');
        expect(contrastWithSurface(light[4], SURFACES.light)).toBeGreaterThan(
            contrastWithSurface(light[0], SURFACES.light),
        );
        expect(contrastWithSurface(dark[4], SURFACES.dark)).toBeGreaterThan(
            contrastWithSurface(dark[0], SURFACES.dark),
        );
    });
});

/**
 * The default ramp's nine-stop path: a nine-level scale centred on its middle.
 * @param {'light'|'dark'} scheme
 * @returns {string[]} Warm end to cool end.
 */
const defaultPath = (scheme) => getLevelColors('default', scheme, 9, 4);

describe('getLevelColors', () => {
    it('paints a five-level scale centred on its middle with the five default stops', () => {
        expect(getLevelColors('default', 'light', 5, 2)).toEqual([
            ...getRampStops('default', 'light'),
        ]);
        expect(getLevelColors('default', 'dark', 5, null)).toEqual([
            ...getRampStops('default', 'dark'),
        ]);
    });

    it('takes each level from the path at its distance from the medium level', () => {
        const path = defaultPath('light');
        // NW Mathematik: k.h.N., KS 1a, KS 1b, KS 2, KS 3 (medium), KS 4, KS 5.
        expect(getLevelColors('default', 'light', 7, 4)).toEqual(path.slice(0, 7));
        // NW Deutsch: k.h.N., KS 1 … KS 5, KS 3 medium.
        expect(getLevelColors('default', 'light', 6, 3)).toEqual(path.slice(1, 7));
    });

    it('paints the same level the same on two ladders that share it above the gap', () => {
        // KS 2 … KS 5 sit at the same distance from KS 3 on both NW ladders.
        const mathe = getLevelColors('default', 'dark', 7, 4);
        const deutsch = getLevelColors('default', 'dark', 6, 3);
        expect(mathe.slice(3)).toEqual(deutsch.slice(2));
    });

    it('centres a scale that tags no medium level on its middle, the upper one when even', () => {
        const path = defaultPath('light');
        expect(getLevelColors('default', 'light', 6, null)).toEqual(path.slice(1, 7));
        expect(getLevelColors('default', 'light', 3, null)).toEqual(path.slice(3, 6));
    });

    it('samples an arm longer than the path along that arm, keeping its levels apart', () => {
        const colors = getLevelColors('default', 'light', 8, 6);
        expect(colors).toHaveLength(8);
        expect(new Set(colors).size).toBe(8);
        expect(colors.slice(6)).toEqual(defaultPath('light').slice(4, 6));
    });

    it('samples the grayscale theme to the level count, ignoring the centre', () => {
        expect(getLevelColors('grayscale', 'light', 6, 1)).toEqual(
            getLevelColors('grayscale', 'light', 6, null),
        );
    });
});

describe('inkOn', () => {
    it('picks whichever of white and dark ink contrasts more with the fill', () => {
        // The deep ends of the light default ramp keep white and its light green centre
        // goes dark; every stop of the dark ramp is light enough to take dark ink.
        expect(inkOn('#a8022a')).toBe('#ffffff');
        expect(inkOn('#164dc2')).toBe('#ffffff');
        expect(inkOn('#08a759')).toBe('#111827');
        expect(inkOn('#099f70')).toBe('#111827');
        expect(inkOn('#fea39b')).toBe('#111827');
        expect(inkOn(getRampStops('grayscale', 'light')[0])).toBe('#111827');
        expect(inkOn(getRampStops('grayscale', 'dark')[4])).toBe('#111827');
        expect(inkOn(getRampStops('grayscale', 'dark')[0])).toBe('#ffffff');
    });

    it('parses rgb() and rgba() strings rather than falling back to dark ink', () => {
        expect(inkOn('rgb(59, 91, 208)')).toBe('#ffffff');
        expect(inkOn('rgb(255, 255, 255)')).toBe('#111827');
        // Its own alpha composites over the surface like `opacity` does.
        expect(inkOn('rgba(0, 0, 0, 0.1)')).toBe('#111827');
    });

    it('composites a translucent fill over the scheme surface', () => {
        // Opaque navy takes white; a faint wash of it is mostly surface.
        expect(inkOn('#1e3a8a')).toBe('#ffffff');
        expect(inkOn('#1e3a8a', { opacity: 0.15 })).toBe('#111827');
        expect(inkOn('#1e3a8a', { opacity: 0.15, scheme: 'dark' })).toBe('#ffffff');
        // A light fill reads dark opaque, but over the dark surface it is mostly dark.
        expect(inkOn('#e6e8ec')).toBe('#111827');
        expect(inkOn('#e6e8ec', { opacity: 0.2, scheme: 'dark' })).toBe('#ffffff');
    });

    it('judges an unparsable fill on the surface alone', () => {
        expect(inkOn('var(--missing)')).toBe('#111827');
        expect(inkOn('var(--missing)', { scheme: 'dark' })).toBe('#ffffff');
    });
});

describe('contrastWithSurface', () => {
    it('ranges from the surface to its opposite and composites alpha against it', () => {
        expect(contrastWithSurface('#ffffff', SURFACES.light)).toBeCloseTo(1, 5);
        expect(contrastWithSurface('#000000', SURFACES.light)).toBeCloseTo(21, 5);
        expect(contrastWithSurface('#00000000', SURFACES.light)).toBeCloseTo(1, 5);
        expect(contrastWithSurface('#fff', SURFACES.light)).toBeCloseTo(1, 5);
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

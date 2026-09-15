// @vitest-browser
// (jsdom because the colour path reads getThemeColors, which reads getComputedStyle.)

/**
 * The comparison-series contract: how one delivered Vergleichsgruppe is drawn and
 * named.
 *
 * WHY this is worth pinning at unit level: the rule used to be written four times —
 * once inside each of the EN scatterplot, item lollipop, style lollipop and style
 * spider — and the only thing asserting it was an e2e spec, once per chart. Four
 * copies of a rule that must agree is exactly the shape of a drift bug: a chart that
 * numbers its Landesschnitte differently, or points an unknown population at the
 * Klassenschnitt glossary term, is wrong in a way no single chart's test can see.
 *
 * The shade ramp lives here too, module-private; what is asserted is that a group's
 * paint steps with its ordinal, so two groups of one role cannot paint identically.
 */

import { describe, expect, it, vi } from 'vitest';
import {
    comparisonLegendEntry,
    comparisonMarkerLegendPaint,
    comparisonSeriesColor,
    comparisonSeriesLabel,
    comparisonSeriesPaint,
    comparisonSeriesVisual,
    markerPaintForIndex,
} from '@tba3/modules/common/charts/comparisonSeries.js';
import { GLOSSARY_KEYS } from '@tba3/modules/common/glossary/glossaryKeys.js';
import { getThemeColors } from '@tba3/modules/common/services/themeService.js';

/**
 * The shade ramp reaches for `d3.color` as soon as the index is non-zero. This
 * stand-in records the step it was asked for instead of computing a real colour: the
 * exact shade is not the contract, only that a stepped group gets a different paint.
 */
vi.mock('d3', () => ({
    color: (input) => ({
        darker: (k) => `${input}/darker(${k})`,
        brighter: (k) => `${input}/brighter(${k})`,
        rgb: () => ({ r: 255, g: 255, b: 255 }),
        toString: () => String(input),
    }),
}));

/** One delivered comparison population, as `parseStyleAggregation` hands it over. */
const group = (over = {}) => ({
    id: 'state',
    type: 'state',
    name: 'Landesschnitt',
    shortLabel: null,
    typeIndex: 0,
    ...over,
});

describe('comparisonSeriesVisual', () => {
    it('gives each role its own silhouette', () => {
        // WHY: the shapes are a vocabulary. Two populations under one silhouette is
        // cardinality without identity — the reader sees two marks and cannot tell
        // which value belongs to whom.
        expect(comparisonSeriesVisual(group({ type: 'school' })).symbol).toBe('diamond');
        expect(comparisonSeriesVisual(group({ type: 'state' })).symbol).toBe('square');
        expect(comparisonSeriesVisual(group({ type: 'district' })).symbol).toBe('cross');
    });

    it('links only the roles the glossary actually defines', () => {
        // WHY: the old fallback pointed unrecognised types at "Klassenschnitt", which
        // defines a district average as the class's own. No term is better than a
        // wrong one — the group's payload name then carries the whole meaning.
        expect(comparisonSeriesVisual(group({ type: 'school' })).glossaryKey).toBe(
            GLOSSARY_KEYS.SCHULSCHNITT,
        );
        expect(comparisonSeriesVisual(group({ type: 'state' })).glossaryKey).toBe(
            GLOSSARY_KEYS.LANDESSCHNITT,
        );
        expect(comparisonSeriesVisual(group({ type: 'district' })).glossaryKey).toBeNull();
    });

    it('draws a type it has never seen rather than failing', () => {
        // WHY: `value-group.type` is an open string in the spec, so an exporter may
        // legitimately ship a Bezirksschnitt. Enumerating the known types and throwing
        // on the rest took the whole dashboard down over one unfamiliar row.
        expect(() => comparisonSeriesVisual(group({ type: 'brand-new-population' }))).not.toThrow();
        expect(comparisonSeriesVisual(group({ type: 'brand-new-population' })).symbol).toBe(
            'cross',
        );
    });
});

describe('comparisonSeriesColor', () => {
    it('paints a lone group with its role colour untouched', () => {
        // WHY: a payload delivering one group per role must render exactly as it did
        // before the shade ramp existed.
        const theme = getThemeColors(true);
        expect(comparisonSeriesColor(group({ typeIndex: 0 }), theme)).toBe(theme.chart.state);
    });

    it('steps every further group of the same role away from the first', () => {
        // WHY: nw ships four Landesschnitte. They share a shape and a base colour, so
        // an unstepped ramp would draw four identical marks at four different values.
        const theme = getThemeColors(true);
        const first = comparisonSeriesColor(group({ typeIndex: 0 }), theme);
        const second = comparisonSeriesColor(group({ typeIndex: 1 }), theme);
        const third = comparisonSeriesColor(group({ typeIndex: 2 }), theme);

        expect(second).not.toBe(first);
        expect(third).not.toBe(second);
    });
});

describe('comparisonSeriesLabel', () => {
    it('leaves the name of a lone group alone', () => {
        expect(comparisonSeriesLabel(group())).toBe('Landesschnitt');
    });

    it('prefixes the ordinal when one is needed to tell groups apart', () => {
        // WHY: the tag printed next to the mark is `L2`; the text that names it has to
        // repeat that tag or there is nothing to match it against.
        expect(comparisonSeriesLabel(group({ shortLabel: 'L2', name: 'Landesschnitt GY' }))).toBe(
            'L2 = Landesschnitt GY',
        );
    });
});

describe('comparisonLegendEntry', () => {
    it('keeps the glossary key on the whole label of an untagged group', () => {
        const entry = comparisonLegendEntry(
            group({ type: 'school', name: 'Schulschnitt' }),
            getThemeColors(true),
        );

        expect(entry.label).toBe('Schulschnitt');
        expect(entry.labelSegments).toBeNull();
        expect(entry.glossaryKey).toBe(GLOSSARY_KEYS.SCHULSCHNITT);
    });

    it('moves the glossary key onto the term half once the label carries an ordinal', () => {
        // WHY: the glossary defines "Landesschnitt", not "L1 = Landesschnitt". Stamping
        // the key over the whole string makes the index part of the term.
        const entry = comparisonLegendEntry(
            group({ shortLabel: 'L1', name: 'Landesschnitt GY' }),
            getThemeColors(true),
        );

        expect(entry.label).toBe('L1 = Landesschnitt GY');
        expect(entry.glossaryKey).toBeNull();
        expect(entry.labelSegments).toEqual([
            { text: 'L1 = ', glossaryKey: null },
            { text: 'Landesschnitt GY', glossaryKey: GLOSSARY_KEYS.LANDESSCHNITT },
        ]);
    });

    it('claims no glossary term for an unrecognised population', () => {
        const entry = comparisonLegendEntry(
            group({ type: 'district', name: 'Bezirksschnitt' }),
            getThemeColors(true),
        );

        expect(entry.glossaryKey).toBeNull();
        expect(entry.labelSegments).toBeNull();
        expect(entry.label).toBe('Bezirksschnitt');
    });

    it('carries the same paint the marks are drawn with', () => {
        // WHY: the legend swatch and the mark are the only link between a row and the
        // value it names; resolved apart they can drift.
        const theme = getThemeColors(true);
        const tagged = group({ shortLabel: 'L2', typeIndex: 1 });

        expect(comparisonLegendEntry(tagged, theme).color).toBe(
            comparisonSeriesColor(tagged, theme),
        );
    });
});

describe('comparisonSeriesPaint', () => {
    // WHY: several Landesschnitte share a shape; the shade step alone is a colour
    // channel. Fill mode is not: the first group is filled, every further one is
    // hollow, so L1 and L2 read apart at item density and after desaturation.
    it('fills the first group of a role and hollows every further one', () => {
        const theme = getThemeColors();
        const first = comparisonSeriesPaint(group({ typeIndex: 0 }), theme);
        const second = comparisonSeriesPaint(group({ typeIndex: 1 }), theme);

        expect(first.hollow).toBe(false);
        expect(first.fill).toBe(first.color);
        expect(second.hollow).toBe(true);
        expect(second.fill).toBe(theme.chrome.surface);
        expect(second.stroke).toBe(second.color);
        expect(second.strokeWidth).toBeGreaterThan(first.strokeWidth);
    });

    it('keeps the shade as the series colour a legend line or area uses', () => {
        const theme = getThemeColors();
        const paint = comparisonSeriesPaint(group({ typeIndex: 1 }), theme);
        expect(paint.color).toBe(comparisonSeriesColor(group({ typeIndex: 1 }), theme));
    });

    it('hands the legend swatch the same paint as the mark', () => {
        const theme = getThemeColors();
        const swatch = comparisonMarkerLegendPaint(group({ typeIndex: 1 }), theme);
        const paint = comparisonSeriesPaint(group({ typeIndex: 1 }), theme);
        expect(swatch).toEqual({
            color: paint.fill,
            stroke: paint.stroke,
            strokeWidth: paint.strokeWidth,
            dotFill: paint.dotFill,
        });
    });

    it('marks the third and fourth group of a role with a centre dot', () => {
        // WHY: NW delivers four Landesschnitt tracks; filled vs hollow only separates
        // the first from the rest. The dot is the third channel: in the colour on a
        // hollow marker, in the surface colour on a filled one.
        const theme = getThemeColors();
        const paints = [0, 1, 2, 3, 4].map((i) =>
            comparisonSeriesPaint(group({ typeIndex: i }), theme),
        );
        expect(paints.map((p) => p.hollow)).toEqual([false, true, true, false, false]);
        expect(paints[0].dotFill).toBeNull();
        expect(paints[1].dotFill).toBeNull();
        expect(paints[2].dotFill).toBe(paints[2].color);
        expect(paints[3].dotFill).toBe(theme.chrome.surface);
        expect(paints[4].dotFill).toBeNull();
        // Four distinct (fill mode, dot) forms before the cycle repeats.
        const forms = paints.slice(0, 4).map((p) => `${p.hollow}/${p.dotFill === null}`);
        expect(new Set(forms).size).toBe(4);
        expect(comparisonMarkerLegendPaint(group({ typeIndex: 2 }), theme).dotFill).toBe(
            paints[2].color,
        );
    });

    it('applies the same rule to a chart that resolves its base colour itself', () => {
        const theme = getThemeColors();
        expect(markerPaintForIndex('#123456', 0, theme).fill).toBe('#123456');
        expect(markerPaintForIndex('#123456', 2, theme).hollow).toBe(true);
    });
});

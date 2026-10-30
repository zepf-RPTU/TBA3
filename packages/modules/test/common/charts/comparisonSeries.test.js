// @vitest-browser
// (browser because a shade token resolves its base colour through getComputedStyle.)

/**
 * The comparison-series contract: how one delivered Vergleichsgruppe is drawn and
 * named.
 *
 * The EN scatterplot, item lollipop, style lollipop and style spider all draw by this
 * one rule. A chart that numbers its Landesschnitte differently, or points an unknown
 * population at the Lerngruppenschnitt glossary term, is wrong in a way no single chart's
 * test can see.
 *
 * The shade ramp is module-private; what is asserted is that a group's paint steps with
 * its ordinal, so two groups of one role cannot paint identically.
 */

import { describe, expect, it } from 'vitest';
import {
    comparisonMarkerLegendItem,
    comparisonSeriesColor,
    comparisonSeriesLabel,
    comparisonSeriesPaint,
    comparisonSeriesVisual,
    comparisonTooltipRows,
    markerPaintForIndex,
} from '../../../src/common/charts/comparisonSeries.js';
import { GLOSSARY_KEYS } from '../../../src/common/glossary/glossaryKeys.js';

/** One delivered comparison population, as `parseStyleAggregation` hands it over. */
const group = (over = {}) => ({
    id: 'state',
    type: 'state',
    name: 'Landesschnitt',
    shortLabel: null,
    roleIndex: 0,
    ...over,
});

describe('comparisonSeriesVisual', () => {
    it('gives each role its own silhouette', () => {
        // With two populations under one silhouette the reader sees two marks and
        // cannot tell which value belongs to whom.
        expect(comparisonSeriesVisual(group({ type: 'school' })).symbol).toBe('diamond');
        expect(comparisonSeriesVisual(group({ type: 'state' })).symbol).toBe('square');
        expect(comparisonSeriesVisual(group({ type: 'district' })).symbol).toBe('cross');
    });

    it('links only the roles the glossary actually defines', () => {
        // Pointing unrecognised types at "Lerngruppenschnitt" would define a district
        // average as the group's own. No term is better than a
        // wrong one — the group's payload name then carries the whole meaning.
        expect(comparisonSeriesVisual(group({ type: 'school' })).glossaryKey).toBe(
            GLOSSARY_KEYS.SCHULSCHNITT,
        );
        expect(comparisonSeriesVisual(group({ type: 'state' })).glossaryKey).toBe(
            GLOSSARY_KEYS.LANDESSCHNITT,
        );
        expect(comparisonSeriesVisual(group({ type: 'district' })).glossaryKey).toBeNull();
    });
});

describe('comparisonSeriesColor', () => {
    it('paints a lone group with its role colour untouched', () => {
        // The shade ramp steps only further groups of a role; a payload delivering
        // one group per role renders in the plain role colours.
        expect(comparisonSeriesColor(group({ roleIndex: 0 }))).toBe('var(--state-average-color)');
    });

    it('steps every further group of the same role away from the first', () => {
        // A payload may ship four Landesschnitte. They share a shape and a base colour,
        // so an unstepped ramp would draw four identical marks at four different values.
        const first = comparisonSeriesColor(group({ roleIndex: 0 }));
        const second = comparisonSeriesColor(group({ roleIndex: 1 }));
        const third = comparisonSeriesColor(group({ roleIndex: 2 }));

        expect(second).not.toBe(first);
        expect(third).not.toBe(second);
    });
});

describe('comparisonSeriesLabel', () => {
    it('leaves the name of a lone group alone', () => {
        expect(comparisonSeriesLabel(group())).toBe('Landesschnitt');
    });

    it('prefixes the ordinal when one is needed to tell groups apart', () => {
        // The tag printed next to the mark is `L2`; the text that names it has to
        // repeat that tag or there is nothing to match it against.
        expect(comparisonSeriesLabel(group({ shortLabel: 'L2', name: 'Landesschnitt GY' }))).toBe(
            'L2 = Landesschnitt GY',
        );
    });
});

describe('comparisonMarkerLegendItem', () => {
    it('keeps the glossary key on the whole label of an untagged group', () => {
        const entry = comparisonMarkerLegendItem(group({ type: 'school', name: 'Schulschnitt' }));

        expect(entry.label).toBe('Schulschnitt');
        expect(entry.labelSegments).toBeNull();
        expect(entry.glossaryKey).toBe(GLOSSARY_KEYS.SCHULSCHNITT);
    });

    it('moves the glossary key onto the term half once the label carries an ordinal', () => {
        // The glossary defines "Landesschnitt", not "L1 = Landesschnitt". Stamping
        // the key over the whole string makes the index part of the term.
        const entry = comparisonMarkerLegendItem(
            group({ shortLabel: 'L1', name: 'Landesschnitt GY' }),
        );

        expect(entry.label).toBe('L1 = Landesschnitt GY');
        expect(entry.glossaryKey).toBeNull();
        expect(entry.labelSegments).toEqual([
            { text: 'L1 = ', glossaryKey: null },
            { text: 'Landesschnitt GY', glossaryKey: GLOSSARY_KEYS.LANDESSCHNITT },
        ]);
    });

    it('claims no glossary term for an unrecognised population', () => {
        const entry = comparisonMarkerLegendItem(
            group({ type: 'district', name: 'Bezirksschnitt' }),
        );

        expect(entry.glossaryKey).toBeNull();
        expect(entry.labelSegments).toBeNull();
        expect(entry.label).toBe('Bezirksschnitt');
    });

    it('carries the same paint the marks are drawn with', () => {
        // The legend swatch and the mark are the only link between a row and the
        // value it names; resolved apart they can drift.
        const tagged = group({ shortLabel: 'L2', roleIndex: 1 });
        const paint = comparisonSeriesPaint(tagged);

        const item = comparisonMarkerLegendItem(tagged);

        expect([item.color, item.stroke, item.hollow]).toEqual([
            paint.fill,
            paint.stroke,
            paint.hollow,
        ]);
    });
});

describe('comparisonSeriesPaint', () => {
    // Several Landesschnitte share a shape; the shade step alone is a colour
    // channel. Fill mode is not: the first group is filled and the second hollow, so
    // L1 and L2 read apart at item density and after desaturation.
    it('fills the first group of a role and hollows every further one', () => {
        const first = comparisonSeriesPaint(group({ roleIndex: 0 }));
        const second = comparisonSeriesPaint(group({ roleIndex: 1 }));

        expect(first.hollow).toBe(false);
        expect(first.fill).toBe(comparisonSeriesColor(group({ roleIndex: 0 })));
        expect(second.hollow).toBe(true);
        expect(second.fill).toBe('var(--color-card-background)');
        expect(second.stroke).toBe(comparisonSeriesColor(group({ roleIndex: 1 })));
        expect(second.strokeWidth).toBeGreaterThan(first.strokeWidth);
    });

    it('hands the legend swatch the same paint as the mark', () => {
        const swatch = comparisonMarkerLegendItem(group({ roleIndex: 1 }));
        const paint = comparisonSeriesPaint(group({ roleIndex: 1 }));
        expect(swatch).toMatchObject({
            color: paint.fill,
            stroke: paint.stroke,
            strokeWidth: paint.strokeWidth,
            dotFill: paint.dotFill,
        });
    });

    it('marks the third and fourth group of a role with a centre dot', () => {
        // A payload may deliver four Landesschnitt tracks; filled vs hollow only separates
        // the first from the rest. The dot is the third channel: in the colour on a
        // hollow marker, in the surface colour on a filled one.
        const paints = [0, 1, 2, 3, 4].map((i) => comparisonSeriesPaint(group({ roleIndex: i })));
        expect(paints.map((p) => p.hollow)).toEqual([false, true, true, false, false]);
        expect(paints[0].dotFill).toBeNull();
        expect(paints[1].dotFill).toBeNull();
        expect(paints[2].dotFill).toBe(comparisonSeriesColor(group({ roleIndex: 2 })));
        expect(paints[3].dotFill).toBe('var(--color-card-background)');
        expect(paints[4].dotFill).toBeNull();
        // Four distinct (fill mode, dot) forms before the cycle repeats.
        const forms = paints.slice(0, 4).map((p) => `${p.hollow}/${p.dotFill === null}`);
        expect(new Set(forms).size).toBe(4);
        expect(comparisonMarkerLegendItem(group({ roleIndex: 2 })).dotFill).toBe(paints[2].dotFill);
    });

    it('applies the same rule to a chart that resolves its base colour itself', () => {
        expect(markerPaintForIndex('var(--x)', 0).fill).toBe('var(--x)');
        expect(markerPaintForIndex('var(--x)', 2).hollow).toBe(true);
    });
});

describe('comparisonTooltipRows', () => {
    it('lists each shown group with a value, and nothing for a hidden or missing one', () => {
        // The tooltip says what the plot shows. A hidden group draws no marker,
        // and neither does one without a value for the hovered mark, so a row for
        // either would name a value the reader cannot find.
        const school = group({ id: 'school', type: 'school', name: 'Schulschnitt' });
        const state = group({ id: 'state' });
        const gy = group({ id: 'gy', name: 'Landesschnitt GY', shortLabel: 'L2', roleIndex: 1 });
        const values = /** @type {{[id: string]: number|null}} */ ({
            school: 50,
            state: 62.5,
            gy: null,
        });

        const rows = comparisonTooltipRows(
            [school, state, gy],
            { school: false, state: true, gy: true },
            (g) => values[g.id],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].label).toBe(comparisonSeriesLabel(state));
        expect(rows[0].value).toMatch(/^62,5\s?%$/);
    });
});

// @vitest-browser
// The figure itself needs no DOM, but it imports the hover-effect helper from
// chartRenderer.js, which transitively brings up resizeService and touches `window`.

import { describe, it, expect, beforeAll } from 'vitest';

import {
    computeTickRadii,
    expectedSolutionRate,
    getTickTooltipTitle,
    isSubsetSelected,
} from '@tba3/modules/ma/modules/charts/taskRing/taskRingFigure.js';
import { initGlossaryForTests } from '../../../../support/glossaryFixture.js';

/**
 * The figure's pure geometry and the values its two ticks point at.
 *
 * Not the drawing: `taskRingFocus.test.js` renders the figure through the focus chart
 * (the Ø tick left out without pilot values), and end to end `ma-overview-ks-filter.spec.js`
 * reads the student tick and `item-scale-bridge.spec.js` the niveau arc fills.
 *
 * What is pinned here is the part with an intent that a reader cannot recover from the
 * arithmetic, and that a rendering test would not fail on either.
 */

const RADIUS = 100;

// Ratios the figure is built on, restated so a change to them fails here loudly rather
// than silently moving the expectations with the implementation.
const MIDDLE = 0.65;
const OUTER = 0.85;
const GAP = 0.05;
const HIDDEN_INNER = 0.35;
const EXTENSION = 0.5;

const visibleAnnulusInner = RADIUS * (MIDDLE + GAP);
const hiddenAnnulusInner = RADIUS * HIDDEN_INNER;
const normalThickness = RADIUS * (OUTER - MIDDLE - GAP);

describe('computeTickRadii', () => {
    it('spans the annulus and protrudes past its outer edge', () => {
        const { tickInnerRadius, tickOuterRadius } = computeTickRadii(
            RADIUS,
            true,
            visibleAnnulusInner,
        );

        // A tick that started outside the annulus would read as a detached mark rather
        // than a reading off the ring.
        expect(tickInnerRadius).toBe(visibleAnnulusInner);
        expect(tickOuterRadius).toBeCloseTo(RADIUS * OUTER + normalThickness * EXTENSION);
        expect(tickOuterRadius).toBeGreaterThan(RADIUS * OUTER);
    });

    it('keeps the protrusion the same length when the inner ring is hidden', () => {
        // Hiding the niveau ring widens the annulus inwards, so the tick gets longer —
        // but the part that sticks out past the ring must not grow with it, or the same
        // ring would appear to sprout longer ticks purely from a display toggle. That is
        // why the extension is anchored to the *visible-ring* thickness rather than to
        // the annulus the tick is actually spanning.
        const visible = computeTickRadii(RADIUS, true, visibleAnnulusInner);
        const hidden = computeTickRadii(RADIUS, false, hiddenAnnulusInner);

        const protrusion = (t) => t.tickOuterRadius - RADIUS * OUTER;
        expect(protrusion(hidden)).toBeCloseTo(protrusion(visible));

        // ...and the tick does still reach further in, following the widened annulus.
        expect(hidden.tickInnerRadius).toBeLessThan(visible.tickInnerRadius);
    });
});

describe('expectedSolutionRate', () => {
    it('averages the pilot values, as a percentage', () => {
        // Pilot values arrive as proportions; the ring is drawn in percent.
        expect(
            expectedSolutionRate([{ pilotierungswert: 0.4 }, { pilotierungswert: 0.6 }]),
        ).toBeCloseTo(50);
    });

    it('skips items whose pilot value is absent, null or unparseable', () => {
        // WHY: an item nobody piloted arrives as `pilotierungswert: null` (the adapter's
        // `selectPilotierungswert` finds no solution frequency). `Number(null)` is 0, so it
        // used to enter the mean as "piloted, nobody solved it" and drag the Ø tick toward
        // 0 %, claiming the class beat a benchmark that was never measured.
        expect(
            expectedSolutionRate([
                { pilotierungswert: 0.8 },
                { pilotierungswert: null },
                { pilotierungswert: 'k.A.' },
                { pilotierungswert: undefined },
                {},
            ]),
        ).toBeCloseTo(80);
    });

    it('still counts a real zero — an item piloted and solved by nobody', () => {
        expect(
            expectedSolutionRate([{ pilotierungswert: 0 }, { pilotierungswert: 0.5 }]),
        ).toBeCloseTo(25);
    });

    it('reports no rate when nothing was piloted', () => {
        // WHY: the tick used to fall back to 50 % — a benchmark no pilot study measured,
        // with a tooltip naming "Pilotstudien" as its basis. No value, no tick.
        expect(expectedSolutionRate([{ pilotierungswert: null }, {}])).toBeNull();
        expect(expectedSolutionRate([])).toBeNull();
        expect(expectedSolutionRate(null)).toBeNull();
    });
});

describe('isSubsetSelected', () => {
    const students = [{ studentId: 'a' }, { studentId: 'b' }, { studentId: 'c' }];

    it('is true for a proper, non-empty subset', () => {
        expect(isSubsetSelected(['a', 'b'], students)).toBe(true);
    });

    it('is false when everyone is selected', () => {
        // Selecting the whole class says the same thing as selecting nobody, and the
        // student tick would then sit on top of the class average it is meant to be
        // compared against.
        expect(isSubsetSelected(['a', 'b', 'c'], students)).toBe(false);
    });

    it('is false when nothing is selected, and when no id matches', () => {
        expect(isSubsetSelected(null, students)).toBe(false);
        expect(isSubsetSelected([], students)).toBe(false);
        expect(isSubsetSelected(['zzz'], students)).toBe(false);
    });
});

describe('getTickTooltipTitle', () => {
    const students = [
        { studentId: 'a', firstName: 'Ada', lastName: 'Lovelace' },
        { studentId: 'b', firstName: 'Bo', lastName: 'Berg' },
    ];

    // The group label is glossary copy (`ma.items.item-donuts.tooltips`).
    beforeAll(() => initGlossaryForTests('ma'));

    it('names the student when exactly one is selected', () => {
        expect(getTickTooltipTitle(['a'], students)).toBe('Ada Lovelace');
    });

    it('falls back to the group label for several students', () => {
        expect(getTickTooltipTitle(['a', 'b'], students)).toBe('Ausgewählte Schüler:innen');
    });

    it('falls back to the group label when the one id has no name on record', () => {
        // A tooltip reading "undefined undefined" is worse than a generic label.
        expect(getTickTooltipTitle(['ghost'], students)).toBe('Ausgewählte Schüler:innen');
        expect(getTickTooltipTitle(['a'], [{ studentId: 'a' }])).toBe('Ausgewählte Schüler:innen');
    });
});

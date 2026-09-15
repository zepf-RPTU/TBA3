// @vitest-browser
import { describe, it, expect, beforeEach } from 'vitest';
import {
    isItemBelowReportedLevel,
    isItemAboveReportedLevel,
} from '@tba3/modules/common/tables/baseStudentDataTableModule.js';
import {
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    registerStandardItemScales,
    scalePayloadRow,
} from '../../support/competenceScaleFixture.js';

/**
 * WHY these tests exist: the presets used to compare against hardcoded `A1…C1` / `I…V`
 * lists, which selected nothing on any VERA-8 state scale other than those two. Every scale below is one a state actually ships;
 * `names` are the KMK standards the payload carries as `name`.
 */
function row(levelNames, names = []) {
    return scalePayloadRow(
        levelNames.map((nameShort, index) => ({
            nameShort,
            name: names[index] ?? nameShort,
        })),
    );
}

const KMK = [
    'unter Mindeststandard',
    'Mindeststandard',
    'Regelstandard',
    'Regelstandard plus',
    'Optimalstandard',
];

beforeEach(() => {
    resetCompetenceLevelPalette();
    // The Aufgabenniveau vocabulary is registered from `items.json`, not recognised by a
    // regex — without it every item level here resolves to nothing and both presets go empty.
    registerStandardItemScales();
});

describe('EN presets on the A1…C1 reporting scale (item sub-levels collapse to their band)', () => {
    beforeEach(() => registerCompetenceLevelScales([row(['A1', 'A2', 'B1', 'B2', 'C1'])]));
    const achieved = 'B2';

    // Intent: "Unter KS" shows items the student FAILED that are strictly below
    // their achieved band — unexpected failures. Same-band items are NOT below.
    it('includes only items whose band is strictly below the achieved band', () => {
        expect(isItemBelowReportedLevel('A2.2', achieved)).toBe(true); // A2 < B2
        expect(isItemBelowReportedLevel('B1.2', achieved)).toBe(true); // B1 < B2
        expect(isItemBelowReportedLevel('B2.1', achieved)).toBe(false); // same band
        expect(isItemBelowReportedLevel('B2.2', achieved)).toBe(false); // same band
        expect(isItemBelowReportedLevel('C1.1', achieved)).toBe(false); // above
    });

    // Intent: "Über KS" surfaces strengths — items above the achieved band.
    it('includes only items whose band is strictly above the achieved band', () => {
        expect(isItemAboveReportedLevel('C1.1', achieved)).toBe(true);
        expect(isItemAboveReportedLevel('B2.2', achieved)).toBe(false); // same band, not above
        expect(isItemAboveReportedLevel('B1.2', achieved)).toBe(false);
    });

    it('excludes everything when the achieved level is unknown', () => {
        expect(isItemBelowReportedLevel('A1.1', 'N/A')).toBe(false);
        expect(isItemAboveReportedLevel('C1.1', 'N/A')).toBe(false);
        expect(isItemAboveReportedLevel('C1.1', undefined)).toBe(false);
    });

    // WHY: the demo EN scale names no KMK standard, so the only bridge is the shared
    // vocabulary. That must be enough — the demo is the control group.
    it('does not need KMK standards when the vocabularies match', () => {
        expect(isItemBelowReportedLevel('A1.1', 'A2')).toBe(true);
    });
});

describe('EN presets on the A1.1…B1.2 reporting scale (Niedersachsen)', () => {
    beforeEach(() =>
        registerCompetenceLevelScales([
            row(
                ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'],
                [KMK[0], KMK[0], KMK[1], KMK[1], KMK[2], KMK[2]],
            ),
        ]),
    );

    // WHY: on this scale `A2.1` and `A2.2` are distinct levels a student is placed on, so
    // an item at `A2.1` IS below a student at `A2.2` — band collapsing would hide that.
    it('compares by sub-level where the scale defines sub-levels', () => {
        expect(isItemBelowReportedLevel('A2.1', 'A2.2')).toBe(true);
        expect(isItemBelowReportedLevel('A2.2', 'A2.2')).toBe(false);
        expect(isItemAboveReportedLevel('B1.1', 'A2.2')).toBe(true);
    });

    // WHY: items graded above the top of the ladder (`B2.x` on a scale ending at `B1.2`)
    // are not registered; they still count as "above" through their KMK standard.
    it('places items beyond the top of the ladder above every student', () => {
        expect(isItemAboveReportedLevel('B2.1', 'B1.2')).toBe(true);
        expect(isItemBelowReportedLevel('B2.1', 'B1.2')).toBe(false);
    });
});

describe('MA presets on the demo I…V scale (item and reporting vocabularies coincide)', () => {
    beforeEach(() => registerCompetenceLevelScales([row(['I', 'II', 'III', 'IV', 'V'], KMK)]));
    const achieved = 'III';

    it('includes only items strictly below the achieved Kompetenzstufe', () => {
        expect(isItemBelowReportedLevel('I', achieved)).toBe(true);
        expect(isItemBelowReportedLevel('II', achieved)).toBe(true);
        expect(isItemBelowReportedLevel('III', achieved)).toBe(false); // equal
        expect(isItemBelowReportedLevel('IV', achieved)).toBe(false); // above
    });

    it('includes only items strictly above the achieved Kompetenzstufe', () => {
        expect(isItemAboveReportedLevel('IV', achieved)).toBe(true);
        expect(isItemAboveReportedLevel('V', achieved)).toBe(true);
        expect(isItemAboveReportedLevel('III', achieved)).toBe(false); // equal
        expect(isItemAboveReportedLevel('II', achieved)).toBe(false);
    });

    it('excludes everything when the achieved Kompetenzstufe is unknown', () => {
        expect(isItemBelowReportedLevel('I', '')).toBe(false);
        expect(isItemAboveReportedLevel('V', null)).toBe(false);
    });
});

describe('presets across vocabularies — the KMK-standard bridge', () => {
    // WHY: no MA state scale shares a vocabulary with the `Ia…V` item scale, and NRW's
    // English reports `KS 1…KS 5` against `A1.1…C1.1` items. The only thing both sides can
    // name is the KMK standard, and since 2026-08-31 both read it off the payload —
    // `standardRank:<level id>`, on the competence-levels row and on the items row alike.
    it('relates Ia…V items to MiStd-…OptStd students by standard (Niedersachsen Mathematik)', () => {
        registerCompetenceLevelScales([row(['MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'], KMK)]);
        expect(isItemBelowReportedLevel('Ia', 'ReStd')).toBe(true);
        expect(isItemBelowReportedLevel('II', 'ReStd')).toBe(true);
        expect(isItemBelowReportedLevel('III', 'ReStd')).toBe(false); // III is Regelstandard
        expect(isItemAboveReportedLevel('IV', 'ReStd')).toBe(true);
    });

    it('relates A1.1…C1.1 items to KS 1…KS 5 students by standard (NRW Englisch)', () => {
        registerCompetenceLevelScales([
            row(['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'], ['k.h.N.', ...KMK]),
        ]);
        expect(isItemBelowReportedLevel('A2.2', 'KS 3')).toBe(true);
        expect(isItemBelowReportedLevel('B1.1', 'KS 3')).toBe(false); // B1 is Regelstandard
        expect(isItemAboveReportedLevel('B2.1', 'KS 3')).toBe(true);
    });

    // WHY: `k.h.N.` names no standard. "Unknown" must mean unknown, not "below everything".
    it('excludes everything for a student on a level that names no standard', () => {
        registerCompetenceLevelScales([
            row(['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'], ['k.h.N.', ...KMK]),
        ]);
        expect(isItemBelowReportedLevel('A1.1', 'k.h.N.')).toBe(false);
        expect(isItemAboveReportedLevel('C1.1', 'k.h.N.')).toBe(false);
    });

    it('excludes everything when the reporting scale names no standard and shares no vocabulary', () => {
        registerCompetenceLevelScales([row(['S1', 'S2', 'S3'])]);
        expect(isItemBelowReportedLevel('Ia', 'S3')).toBe(false);
        expect(isItemAboveReportedLevel('V', 'S1')).toBe(false);
    });
});

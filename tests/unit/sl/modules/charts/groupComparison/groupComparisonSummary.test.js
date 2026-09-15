// @vitest-browser
// The summary reads theme colours, and getThemeColors() calls getComputedStyle.
import { describe, it, expect, beforeEach } from 'vitest';

import {
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { buildGroupComparisonSummary } from '@tba3/modules/sl/modules/charts/groupComparison/groupComparisonSummary.js';
import { scalePayloadRow } from '../../../../support/competenceScaleFixture.js';
import { initGlossaryForTests } from '../../../../support/glossaryFixture.js';

/**
 * The Vergleich's info box is the only consumer of this summary, and until the module
 * was split out of `groupComparisonDataUtils.js` it had no test at any level: it
 * re-derived the chart's filter pipeline from the raw payloads, so the sentence under
 * the chart could describe a different population than the chart drew and nothing
 * would have noticed.
 *
 * It now takes the rows the chart actually drew (`cachedFilteredData`) and does two
 * things to them: split them into the two compared groups, and format the figures.
 * These tests pin both, and — first test below — pin that it does *not* filter.
 */

/** A scale whose bands name their KMK standard, so a Regelstandard share is expressible. */
const STANDARD_SCALE = [
    { nameShort: 'I', name: 'weit unter Mindeststandard' },
    { nameShort: 'II', name: 'Mindeststandard' },
    { nameShort: 'III', name: 'Regelstandard' },
    { nameShort: 'IV', name: 'Regelstandard plus' },
    { nameShort: 'V', name: 'Optimalstandard' },
];

/** The same ladder as the server ships it — with the rank as a row property. */
const STANDARD_SCALE_ROW = scalePayloadRow(STANDARD_SCALE);

/** Bremen-style bands that name no standard — a share over them is unknown, not zero. */
const UNNAMED_SCALE = ['MiStd', 'ReStd', 'OptStd'].map((nameShort) => ({
    nameShort,
    name: nameShort,
}));

const student = (
    competencyLevel,
    { gender = 'female', klass = '8a', subject = 'Deutsch' } = {},
) => ({ competencyLevel, gender, class: klass, subject });

const rater = (mean, { gender = 'female', klass = '8a', subject = 'Deutsch' } = {}) => ({
    mean,
    gender,
    class: klass,
    subject,
});

beforeEach(() => {
    resetCompetenceLevelPalette();
    // The empty-state sentence is glossary copy; without the annotator it reads as a gap marker.
    initGlossaryForTests('sl');
});

describe('buildGroupComparisonSummary — the rows are taken as given', () => {
    it('counts every row it is handed, without re-applying the scope or subject filter', () => {
        // WHY: this is the whole point of the split. The module used to take
        // `domainResults` plus a scope filter and re-run the chart's filtering itself — a
        // second implementation of a pipeline the chart had already run and cached. Here
        // the rows deliberately span two classes and two subjects: a module that still
        // filtered would report fewer than every row it was handed.
        registerCompetenceLevelScales([STANDARD_SCALE_ROW]);

        const summary = buildGroupComparisonSummary({
            chartType: 'ks',
            category: 'gender',
            group1Value: 'female',
            group2Value: 'male',
            filteredData: [
                student('III', { gender: 'female', klass: '8a', subject: 'Deutsch' }),
                student('IV', { gender: 'female', klass: '8b', subject: 'Englisch' }),
                student('II', { gender: 'male', klass: '8a', subject: 'Deutsch' }),
                student('V', { gender: 'male', klass: '8b', subject: 'Englisch' }),
            ],
        });

        expect(summary.group1.n).toBe(2);
        expect(summary.group2.n).toBe(2);
    });

    it('reports nothing drawn when the chart drew nothing', () => {
        // The chart leaves `cachedFilteredData` null between clearing it and filling it,
        // and when its render bails out with no data. Both must read as "no data", not throw.
        const summary = buildGroupComparisonSummary({
            chartType: 'ks',
            category: 'gender',
            filteredData: null,
        });

        expect(summary.group1.n).toBe(0);
        expect(summary.group2.n).toBe(0);
    });
});

describe('buildGroupComparisonSummary — Kompetenzstufen', () => {
    it('reports the share at or above Regelstandard for each group', () => {
        registerCompetenceLevelScales([STANDARD_SCALE_ROW]);

        const summary = buildGroupComparisonSummary({
            chartType: 'ks',
            category: 'gender',
            group1Value: 'female',
            group2Value: 'male',
            filteredData: [
                student('III', { gender: 'female' }),
                student('V', { gender: 'female' }),
                student('I', { gender: 'female' }),
                student('II', { gender: 'male' }),
                student('IV', { gender: 'male' }),
            ],
        });

        // The label names the Kompetenzstufe the `ge_3` rank resolves to on the loaded
        // scale, never the KMK standard behind it: which Kompetenzstufe counts as the
        // Regelstandard depends on the Schulabschluss the payload does not carry, so
        // printing the standard states a conditional as a fact. It is also the wording the
        // info box beside this summary uses.
        expect(summary.shareLabel).toBe('Anteil auf oder oberhalb von Kompetenzstufe III');
        expect(summary.shareLabel).not.toMatch(/Regelstandard|Mindeststandard|Optimalstandard/i);

        expect(summary.group1.shareGe3).toBeCloseTo(2 / 3, 10);
        expect(summary.group2.shareGe3).toBe(0.5);
    });

    it('leaves the share null for a scale that names no standard, rather than reporting 0 %', () => {
        // WHY: a share the scale cannot express is unknown, not zero — `null` is what
        // lets the template leave the sentence out. Reporting 0 % would read as a
        // measurement of failure.
        registerCompetenceLevelScales([{ competenceLevels: UNNAMED_SCALE }]);

        const summary = buildGroupComparisonSummary({
            chartType: 'ks',
            category: 'gender',
            group1Value: 'female',
            group2Value: 'male',
            filteredData: [
                student('ReStd', { gender: 'female' }),
                student('OptStd', { gender: 'male' }),
            ],
        });

        expect(summary.group1.shareGe3).toBeNull();
        expect(summary.group2.shareGe3).toBeNull();
    });

    it('returns the empty skeleton when the split cannot find two groups', () => {
        // A Klassen comparison needs two classes. One class is not "0 %" — there is no
        // comparison to report at all, so no figures are invented.
        registerCompetenceLevelScales([STANDARD_SCALE_ROW]);

        const summary = buildGroupComparisonSummary({
            chartType: 'ks',
            category: 'class',
            filteredData: [student('III', { klass: '8a' }), student('IV', { klass: '8a' })],
        });

        expect(summary.group1.n).toBe(0);
        expect(summary.group2.n).toBe(0);
    });
});

describe('buildGroupComparisonSummary — ratings and labels', () => {
    it('summarises rating values per group and names the measure family', () => {
        const summary = buildGroupComparisonSummary({
            chartType: 'teachingQuality',
            category: 'gender',
            group1Value: 'female',
            group2Value: 'male',
            filteredData: [
                rater(4, { gender: 'female' }),
                rater(2, { gender: 'female' }),
                rater(3, { gender: 'male' }),
            ],
        });

        expect(summary.group1.n).toBe(2);
        expect(summary.group1.mean).toBeCloseTo(3, 10);
        expect(summary.group2.mean).toBeCloseTo(3, 10);
        expect(summary.metricMode).toBe('rating');
    });

    it('keeps every figure null when no row carries a usable value', () => {
        const summary = buildGroupComparisonSummary({
            chartType: 'selfEfficacy',
            category: 'gender',
            group1Value: 'female',
            group2Value: 'male',
            filteredData: [rater(null, { gender: 'female' }), rater(undefined, { gender: 'male' })],
        });

        expect(summary.group1.mean).toBeNull();
        expect(summary.group1.standardDeviation).toBeNull();
        expect(summary.group1.n).toBe(0);
    });

    it('labels the two sides of a Fach comparison with their subjects', () => {
        // WHY: in a Fach comparison the subject is what the two sides differ in, so the
        // labels are the only place the compared Fächer are named.
        const summary = buildGroupComparisonSummary({
            chartType: 'teachingQuality',
            category: 'fach',
            group1Value: 'Deutsch',
            group2Value: 'Englisch',
            filteredData: [rater(4, { subject: 'Deutsch' }), rater(3, { subject: 'Englisch' })],
        });

        expect(summary.group1.label).toBe('Deutsch');
        expect(summary.group2.label).toBe('Englisch');
    });
});

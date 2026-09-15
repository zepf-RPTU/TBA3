import { describe, it, expect, beforeEach } from 'vitest';
import { resetCompetenceLevelPalette } from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    AT_OR_ABOVE_REGULAR,
    ROMAN_AT_OR_ABOVE_REGULAR,
    buildDashboardHelper as helper,
    competenceRow,
    helperFor,
    romanLevels,
} from '../../support/slInfoBoxFixture.js';

/**
 * The two share verbs every info box prints: one subject×domain of a target, and a
 * whole Fach pooled over its Domänen. Everything a box says is one of these numbers,
 * so a wrong weighting here is a wrong percentage in German prose.
 *
 * The shared fixture documents the numbers; each case below states the rule the
 * numbers were chosen to expose.
 */

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe('getCompetenceLevelShare — the share every box now prints', () => {
    it('reads the school row for a Fach and Domäne', () => {
        const query = helper();

        expect(
            query.getCompetenceLevelShare({
                target: 'school',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.5, 10);
        expect(
            query.getCompetenceLevelShare({
                target: '8a',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.6, 10);
    });

    it('returns null when the scale cannot express the levels asked about', () => {
        // WHY: this is the gate every selector above inherits, and the single biggest risk
        // in the swap. Englisch is measured on the GER ladder, which has no band called
        // "III". Counting matches against it yields 0 out of 10 — a finite zero that
        // survives every "is this a number?" check downstream and is drawn as a real
        // measurement, so the box would state that nobody in 8a reaches Kompetenzstufe III
        // in Englisch when in fact 80 % reach the equivalent band.
        //
        // A share the scale cannot express is unknown, not zero. infoBoxLinks refuses
        // to rank on such a scale for the same reason: it would otherwise name a GER
        // Englisch the school's weakest Fach.
        const query = helper();

        expect(
            query.getCompetenceLevelShare({
                target: '8a',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                subjectName: 'Englisch',
                domainId: 'ho',
            }),
        ).toBeNull();
        expect(
            query.getCompetenceLevelShare({
                target: '8a',
                levelNames: AT_OR_ABOVE_REGULAR,
                subjectName: 'Englisch',
                domainId: 'ho',
            }),
        ).toBeCloseTo(0.8, 10);
    });

    it('divides by the row total, so a student without a level still counts', () => {
        // WHY: the spec's `total` is every student of the value-group, and `mean` is
        // frequency / total. Summing the level frequencies instead left out a student the
        // payload assigns no level, so the box printed a higher share than the competency
        // chart and the Entwicklung view show for the same row.
        const row = competenceRow({
            id: 'schule',
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        });
        // 10 students with a level, 5 more without one: 4 of 15 reach III or above.
        for (const level of row.competenceLevels) level.descriptiveStatistics.total = 15;

        expect(
            helperFor({ competenceLevels: [row] }).getCompetenceLevelShare({
                target: 'school',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(4 / 15, 10);
    });

    it('returns null for a Klasse that never sat the Fach', () => {
        // WHY: absent is not zero. 8c sits only Mathematik.
        expect(
            helper().getCompetenceLevelShare({
                target: '8c',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeNull();
    });
});

describe('getSubjectCompetenceShare — one number for a whole Fach', () => {
    it('weights by students rather than averaging the Domänen', () => {
        // WHY: the verb has to sum frequencies and totals, not average the Domänen's
        // ratios — the two diverge the moment a Domäne has a different cohort size,
        // which is the normal case in real payloads. The fixture makes Deutsch's
        // cohorts unequal so the two methods cannot agree by accident:
        //
        //   - 8a is 0.60 over 10 students in Lesen and 0.40 over 20 in Zuhören, so the
        //     weighted answer is 14/30 ≈ 0.4667 where the mean of the ratios is 0.50
        //   - the school sums its *Klassen* rows — 22/50 = 0.44 — which is neither the
        //     mean of the Domänen (0.45) nor the same sum over the school's own rows
        //     (70/150 ≈ 0.4667), so this also pins which rows "school" means here
        const query = helper();

        expect(
            query.getSubjectCompetenceShare({
                target: 'school',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
            }),
        ).toBeCloseTo(0.44, 10);
        expect(
            query.getSubjectCompetenceShare({
                target: '8a',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
            }),
        ).toBeCloseTo(14 / 30, 10);
    });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { resetCompetenceLevelPalette } from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    AT_OR_ABOVE_REGULAR,
    buildCompetenceRows,
    buildExportShapedRows,
    buildStateComparisonItems,
    helperFor,
    selectionsFor,
    solutionRatesFor,
    stateComparisonFor,
} from '../../support/slInfoBoxFixture.js';

/**
 * CONTRACT — an item row's Klasse is resolved by joining its group id against the
 * competence-levels class rows, so a Lösungsquote reads the same on any spelling.
 *
 * It used to be read out of the *shape* of the row's id and name, matching
 * `^(\d+[a-z])`. That fails on export spellings in two different ways:
 *
 *   - Kürzel and timetable codes (`G-BM`, `E-DL`, `D_E_08a_WXYZ`): **no match at all**;
 *   - per-subject names (`8aDeu`, `8aEng`, `8aMat`): the pattern **matched and truncated**,
 *     yielding `8a` where the competence rows are named `8aDeu`, so the class name it
 *     produced was one no caller could target.
 *
 * Either way the Klassen-scoped Lösungsquote came back null. What went blank was
 * the Überblick's `Lösungsquote` metric (`slSchoolSummaryMetrics.js`, still a live
 * option) and the Material pages' per-Klasse rows, and it went blank silently: the
 * school-scoped rate selects by `id === schoolId` and kept printing, and the
 * competence *shares* beside them never touch an item row. Twice fixed as a pattern,
 * twice wrong.
 *
 * The join replaces the pattern because both payloads are built from one scope and
 * carry the same group ids — `data/sl/sl/` ships an identical set of 13 in each file.
 *
 * These tests are written as an **equivalence**: `buildExportShapedRows` is the
 * dashboard fixture with its groups re-identified and renamed and nothing else
 * changed, so every rate must come out *equal*, not merely non-null. A rate that is
 * non-null but wrong is the failure mode a "not null" assertion cannot see.
 */

function exportShaped() {
    return solutionRatesFor(buildExportShapedRows());
}

function dashboardShaped() {
    return solutionRatesFor({
        competenceLevels: buildCompetenceRows(),
        items: buildStateComparisonItems(),
    });
}

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe('item-row class join, on export-shaped Lerngruppen', () => {
    it('gives the Überblick Lösungsquote metric the same value under either spelling', () => {
        // `schoolSummaryMetrics` resolves its `solution_rate` metric once per Klasse
        // through exactly this call. Before the join it returned null here, `buildRow`
        // dropped the row, and the card left the view.
        expect(
            exportShaped().getSolutionRate({
                target: 'G-BM',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBe(
            dashboardShaped().getSolutionRate({
                target: '8a',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        );
        expect(
            exportShaped().getSolutionRate({
                target: 'G-BM',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.9, 10);
    });

    it('resolves a Klasse across every Testgruppe it sits, not just the first', () => {
        // The join is many ids to one name: 8a sits four Testgruppen with four distinct
        // opaque ids, and a Fach-scoped rate has to sum the ones belonging to that Fach.
        // Deutsch spans two Domänen (two groups), Englisch and Mathematik one each.
        const query = exportShaped();
        const dashboard = dashboardShaped();

        expect(query.getSubjectSolutionRate({ target: 'G-BM', subjectName: 'Deutsch' })).toBe(
            dashboard.getSubjectSolutionRate({ target: '8a', subjectName: 'Deutsch' }),
        );
        expect(query.getSubjectSolutionRate({ target: 'G-BM', subjectName: 'Englisch' })).toBe(
            dashboard.getSubjectSolutionRate({ target: '8a', subjectName: 'Englisch' }),
        );
        expect(query.getSubjectSolutionRate({ target: 'G-BM', subjectName: 'Mathematik' })).toBe(
            dashboard.getSubjectSolutionRate({ target: '8a', subjectName: 'Mathematik' }),
        );

        // 8a Deutsch is (90 + 45) / 200 across Lesen and Zuhören — one group's 0.9
        // alone would pass a "not null" check and be wrong.
        expect(
            query.getSubjectSolutionRate({ target: 'G-BM', subjectName: 'Deutsch' }),
        ).toBeCloseTo(0.675, 10);
    });

    it('takes the Material pages with it — including their school aggregate', () => {
        // `materialContentResolver` asks per Klasse and, for the school aggregate, by
        // summing every row that names one. The aggregate is where the join replaced a
        // property rather than a lookup: "has a class name" used to mean "belongs to
        // some Klasse", and now means "its id is a known class row's".
        const query = exportShaped();
        const dashboard = dashboardShaped();

        expect(query.getSubjectSolutionRate({ target: 'G-BM', subjectName: 'Deutsch' })).toBe(
            dashboard.getSubjectSolutionRate({ target: '8a', subjectName: 'Deutsch' }),
        );
        expect(query.getSubjectSolutionRate({ target: 'school', subjectName: 'Deutsch' })).toBe(
            dashboard.getSubjectSolutionRate({ target: 'school', subjectName: 'Deutsch' }),
        );

        // Both sides anchored, not just paired: a join that resolves nothing takes the
        // dashboard spelling down with the export one, and the equality above holds on
        // two nulls. These are the values, and they are what the pages print.
        expect(
            query.getSubjectSolutionRate({ target: 'G-BM', subjectName: 'Deutsch' }),
        ).toBeCloseTo(0.675, 10);
        expect(
            query.getSubjectSolutionRate({ target: 'school', subjectName: 'Deutsch' }),
        ).toBeCloseTo(0.5, 10);
    });

    it('keeps the Landesschnitt and the school row out of the school aggregate', () => {
        // What the old non-null-class-name property bought, restated against the join:
        // the Deutsch aggregate is the four Klassen rows (90 + 30 + 45 + 35) / 400 = 0.5.
        // Neither the school's own rows (110/200, 80/200) nor the Landesschnitt's
        // (50/100 twice) may enter it — both would move the number, and the state row is
        // the one the id join must exclude on a payload where only `type` marks it.
        expect(
            exportShaped().getSubjectSolutionRate({ target: 'school', subjectName: 'Deutsch' }),
        ).toBeCloseTo(0.5, 10);
        expect(
            exportShaped().getSubjectSolutionRate({ target: 'state', subjectName: 'Deutsch' }),
        ).toBeCloseTo(0.5, 10);
    });

    it('leaves the one rate that never asks which Klasse a row is exactly where it was', () => {
        // `getSolutionRate({target: 'school'})` selects by `id === schoolId`. It is the
        // control: it printed correctly all through the bug and must not move now.
        expect(
            exportShaped().getSolutionRate({
                target: 'school',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.55, 10);
    });

    it('leaves the competence-share verbs alone, as they were throughout', () => {
        // Shares read the class rows out of the competence-level index by `name` and
        // never touch an item row, so they rendered correctly on exports whose
        // Lösungsquoten did not. Unchanged from the reproduction this file replaces —
        // the control showing the fix is confined to the item-row side.
        const shares = helperFor(buildExportShapedRows());
        const query = selectionsFor(shares);
        const best = query.selectClassBySubjectShareRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(best?.className).toBe('G-BM');
        expect(best?.shareRange).toBeCloseTo(0.4, 10);
        expect(
            query.getSubjectCompetenceShareClassRange({
                levelNames: AT_OR_ABOVE_REGULAR,
                subjectName: 'Mathematik',
            })?.maxShare,
        ).toBeCloseTo(0.7, 10);
        expect(
            stateComparisonFor(shares).listClassesByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'gt',
            }),
        ).toEqual(['E_E1_08_ABCD', 'E-DL', 'G-BM']);
    });
});

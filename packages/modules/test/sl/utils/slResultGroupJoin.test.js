import { describe, it, expect } from 'vitest';
import {
    buildCompetenceValueGroups,
    buildExportShapedValueGroups,
    buildStateComparisonResults,
    solutionRatesFor,
} from '../../support/slInfoBoxFixture.js';

/**
 * A result value group's Lerngruppe is resolved by joining its group id against the
 * competence-levels groups, so a Lösungsquote reads the same on any spelling. Parsing
 * the name instead (`^(\d+[a-z])`) matches nothing on Kürzel and timetable codes
 * (`G-BM`, `D_E_08a_WXYZ`) and truncates per-subject names (`8aDeu` → `8a`), and the
 * Lerngruppen-scoped Lösungsquote goes blank while the school-scoped rate keeps printing.
 *
 * `buildExportShapedValueGroups` is the dashboard fixture with its groups re-identified
 * and renamed and nothing else changed, so every rate must come out equal, not merely
 * non-null.
 */

async function exportShaped() {
    return solutionRatesFor(buildExportShapedValueGroups());
}

async function dashboardShaped() {
    return solutionRatesFor({
        competenceLevels: buildCompetenceValueGroups(),
        aggregation: buildStateComparisonResults(),
    });
}

describe('result group join, on export-shaped Lerngruppen', () => {
    it('gives the Überblick Lösungsquote metric the same value under either spelling', async () => {
        // `slSchoolSummaryMetrics` resolves its `solution_rate` metric once per Lerngruppe
        // through exactly this call. A null here makes `buildRow` drop the row, and the
        // card leaves the view.
        expect(
            (await exportShaped()).getSolutionRate({
                target: 'G-BM',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBe(
            (await dashboardShaped()).getSolutionRate({
                target: '8a',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        );
        expect(
            (await exportShaped()).getSolutionRate({
                target: 'G-BM',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.9, 10);
    });

    it('resolves a Lerngruppe across every Testgruppe it sits, not just the first', async () => {
        // The join is many ids to one name: 8a sits four Testgruppen with four distinct
        // opaque ids, and a whole-Fach rate (`domainId: null`) has to sum the ones belonging to that Fach.
        // Deutsch spans two Domänen (two groups), Englisch and Mathematik one each.
        const query = await exportShaped();
        const dashboard = await dashboardShaped();

        expect(
            query.getSolutionRate({ target: 'G-BM', subjectName: 'Deutsch', domainId: null }),
        ).toBe(dashboard.getSolutionRate({ target: '8a', subjectName: 'Deutsch', domainId: null }));
        expect(
            query.getSolutionRate({ target: 'G-BM', subjectName: 'Englisch', domainId: null }),
        ).toBe(
            dashboard.getSolutionRate({ target: '8a', subjectName: 'Englisch', domainId: null }),
        );
        expect(
            query.getSolutionRate({ target: 'G-BM', subjectName: 'Mathematik', domainId: null }),
        ).toBe(
            dashboard.getSolutionRate({ target: '8a', subjectName: 'Mathematik', domainId: null }),
        );

        // 8a Deutsch is (90 + 45) / 200 across Lesen and Zuhören — one group's 0.9
        // alone would pass a "not null" check and be wrong.
        expect(
            query.getSolutionRate({ target: 'G-BM', subjectName: 'Deutsch', domainId: null }),
        ).toBeCloseTo(0.675, 10);
    });
});

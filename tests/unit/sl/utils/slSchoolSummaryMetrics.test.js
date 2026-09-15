import { describe, it, expect, beforeEach } from 'vitest';
import { slDataFromStore } from '../../../../src/sl/slDataPort.js';
import {
    ABSENCE_REASONS,
    buildSummaryRows,
    isDeviationFavourable,
    isEntryFavourable,
} from '@tba3/modules/sl/utils/slSchoolSummaryMetrics.js';
import {
    getSummaryMetric,
    SUMMARY_METRICS,
    DEFAULT_SUMMARY_METRIC_ID,
} from '@tba3/modules/sl/utils/slSchoolSummaryMetricRegistry.js';
import { CompetenceShareQueries } from '@tba3/modules/sl/utils/slCompetenceShares.js';
import { SolutionRateQueries } from '@tba3/modules/sl/utils/slSolutionRates.js';
import { DataStore } from '../../../../src/common/services/dataStore.js';
import { defineSlDatasets } from '../../../../src/sl/slDataService.js';
import { SL_DATA_KEYS } from '../../../../src/sl/slDataKeys.js';
import {
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    buildSummaryMetricsFixture as buildFixture,
    competenceRow,
    helperFor,
    romanLevels,
    solutionRatesFor,
} from '../../support/slInfoBoxFixture.js';
import { slGlossary } from '../../../../src/sl/slGlossary.js';

/**
 * The four metrics feed the Überblick view's deviation bars. Every assertion here
 * pins a property the chart depends on: a wrong aggregate, a wrong unit, a
 * zero-filled gap or a per-row scale would each render a plausible-looking but
 * misleading picture, which no rendering test would catch.
 */

beforeEach(() => {
    // The registry is module-level state; a scale left over from another case would
    // let a metric resolve against levels the fixture under test never shipped.
    resetCompetenceLevelPalette();
});

function build(metricId, activeAverageIds) {
    const { competenceLevels, queries } = buildFixture();
    return {
        ...buildSummaryRows({ queries, competenceLevels, metricId, activeAverageIds }),
        queries,
    };
}

function findRow(rows, rowLabel) {
    return rows.find((row) => row.rowLabel === rowLabel);
}

/** Class columns only — averages lead each row and would shift every index. */
function classesOf(row) {
    return row.entries.filter((entry) => entry.kind === 'class');
}

function classDelta(row, className) {
    return classesOf(row).find((entry) => entry.name === className)?.deltaPP;
}

describe('buildSummaryRows — school value', () => {
    it('aggregates class rows by student count rather than averaging class shares', () => {
        // 8a is 80 % over 10 students, 8b is 30 % over 90. The mean of the shares
        // (55 %) is the wrong answer; the weighted aggregate is 35 %. A future
        // "simplify to average(classValues)" would silently pass every visual check.
        const { rows, queries } = build('regular_standard');
        const row = findRow(rows, 'Deutsch: Leseverstehen');

        expect(row.schoolValue).toBeCloseTo(0.35, 10);
        expect(row.schoolValue).not.toBeCloseTo(0.55, 2);
        expect(row.schoolValue).toBeCloseTo(
            queries.shares.getCompetenceLevelShare({
                target: 'school',
                levelNames: ['III', 'IV', 'V'],
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
            10,
        );
    });

    it('ignores the Landesschnitt row when aggregating the school', () => {
        // The state row shares a subject/domain with a real row and carries a
        // different distribution (40 % at ≥ III over 100 students). Counting it
        // into the school would move it to 75/200 = 37.5 % and shift every
        // deviation; the Landesschnitt is a reference, never part of "us".
        const { rows } = build('regular_standard');
        const row = findRow(rows, 'Deutsch: Leseverstehen');

        expect(row.schoolValue).toBeCloseTo(0.35, 10);
        expect(row.schoolValue).not.toBeCloseTo(0.375, 3);
        expect(classesOf(row).map((entry) => entry.name)).toEqual(['8a', '8b']);
    });
});

describe('buildSummaryRows — reference averages', () => {
    it('plots an active average as an ordinary deviation column, measured against the school', () => {
        // Landesschnitt is 40 % at ≥ III, the school 35 % → +5 PP, in the same
        // unit and against the same baseline as a class bar.
        const { rows } = build('regular_standard');
        const row = findRow(rows, 'Deutsch: Leseverstehen');
        const average = row.entries.find((entry) => entry.kind === 'average');

        expect(average).toMatchObject({ name: 'Landesschnitt', kind: 'average' });
        expect(average.value).toBeCloseTo(0.4, 10);
        expect(average.deltaPP).toBeCloseTo(5, 10);
    });

    it('uses the persisted state row name for the reference average column', () => {
        // WHY: a split state export may name the selected reference "Landesschnitt GY".
        // The Überblick deviation column should preserve that payload identity instead
        // of rewriting every state row to the generic label.
        const { competenceLevels, queries } = buildFixture();
        const state = competenceLevels.find((entry) => entry.type === 'state');
        state.name = 'Landesschnitt GY';

        const { rows } = buildSummaryRows({
            queries,
            competenceLevels,
            metricId: 'regular_standard',
        });
        const row = findRow(rows, 'Deutsch: Leseverstehen');

        expect(row.entries.find((entry) => entry.kind === 'average')).toMatchObject({
            name: 'Landesschnitt GY',
            sourceName: 'Landesschnitt GY',
            sourceType: 'state',
        });
        expect(row.entries[0]).toMatchObject({ name: 'Landesschnitt GY', kind: 'average' });
    });

    it('keeps multiple state reference averages as separate prefix columns', () => {
        // WHY: state tracks are alternative comparison populations. Collapsing them to
        // the first state row hides which reference the school is being compared to.
        const { competenceLevels, queries } = buildFixture();
        competenceLevels.push(
            competenceRow({
                id: 'state-gy',
                type: 'state',
                name: 'Landesschnitt GY',
                subject: 'Deutsch',
                domainId: 'le',
                domainName: 'Leseverstehen',
                levels: romanLevels([10, 10, 30, 20, 20, 10]),
            }),
        );

        const { rows, averages } = buildSummaryRows({
            queries,
            competenceLevels,
            metricId: 'regular_standard',
        });
        const row = findRow(rows, 'Deutsch: Leseverstehen');

        expect(averages.map((average) => average.id)).toEqual(['state:state', 'state:state-gy']);
        expect(
            row.entries.filter((entry) => entry.kind === 'average').map((entry) => entry.name),
        ).toEqual(['Landesschnitt', 'Landesschnitt GY']);
        expect(row.entries.slice(0, 2).map((entry) => [entry.name, entry.kind])).toEqual([
            ['Landesschnitt', 'average'],
            ['Landesschnitt GY', 'average'],
        ]);
        expect(row.entries[2].kind).toBe('class');
    });

    it('gives a row no column for an average that does not resolve there', () => {
        // WHY: NRW ships several Landesschnitt tracks and they do not all cover every
        // subject. Under a shared column band such a track kept a slot on every card and
        // rendered as a muted "–" wherever it had no value — a reference the school
        // cannot actually be read against. Averages follow the same rule as classes:
        // a column exists only where a bar does.
        const { competenceLevels, queries } = buildFixture();
        competenceLevels.push(
            competenceRow({
                id: 'state-gy',
                type: 'state',
                name: 'Landesschnitt GY',
                subject: 'Deutsch',
                domainId: 'le',
                domainName: 'Leseverstehen',
                levels: romanLevels([10, 10, 30, 20, 20, 10]),
            }),
        );

        const { rows } = buildSummaryRows({
            queries,
            competenceLevels,
            metricId: 'regular_standard',
        });

        expect(
            findRow(rows, 'Deutsch: Leseverstehen').entries.map((entry) => entry.name),
        ).toContain('Landesschnitt GY');
        expect(findRow(rows, 'Mathematik').entries.map((entry) => entry.name)).not.toContain(
            'Landesschnitt GY',
        );
    });

    it('reports no reference average at all when the payload carries no state row', () => {
        // WHY: this list is what the card's ⌀ dropdown is built from. Falling back to the
        // static Landesschnitt descriptor put an entry in that menu which no row could
        // ever plot — `buildRow` skips an average whose metric does not resolve — so the
        // control offered a comparison the data cannot make.
        const { competenceLevels, queries } = buildFixture();
        const withoutState = competenceLevels.filter((entry) => entry.type !== 'state');

        const { rows, averages } = buildSummaryRows({
            queries,
            competenceLevels: withoutState,
            metricId: 'regular_standard',
        });

        expect(averages).toEqual([]);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.entries.every((entry) => entry.kind === 'class'))).toBe(
            true,
        );
    });

    it('puts the averages before the classes in every row', () => {
        // The chart draws a divider after the last average, so the split has to
        // be a prefix — an average sorted in among the classes would land on the
        // wrong side of it. The entries *are* the column band, so this is the
        // order the divider is placed against.
        const { rows } = build('regular_standard');

        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            const kinds = row.entries.map((entry) => entry.kind);
            expect(kinds.lastIndexOf('average')).toBeLessThan(kinds.indexOf('class'));
        }
    });

    it('omits the average column entirely when it is toggled off', () => {
        const { rows } = build('regular_standard', []);

        expect(rows.every((row) => row.entries.every((entry) => entry.kind === 'class'))).toBe(
            true,
        );
    });

    it('drops a row that has no class of its own, even when the average resolves', () => {
        // A card showing only a Landesschnitt bar would claim to describe this
        // school while containing none of its data.
        const { rows } = buildSummaryRows({
            queries: {
                shares: {
                    getCompetenceLevelShare: ({ target }) => (target === 'state' ? 0.5 : null),
                },
                rates: { getSolutionRate: () => null },
            },
            competenceLevels: [
                competenceRow({
                    id: 'schule',
                    type: 'school',
                    name: 'Testschule',
                    subject: 'Mathematik',
                    levels: romanLevels([1, 1, 1, 1, 1, 1]),
                }),
                competenceRow({
                    id: 'state',
                    type: 'state',
                    name: 'Landesschnitt',
                    subject: 'Mathematik',
                    levels: romanLevels([1, 1, 1, 1, 1, 1]),
                }),
            ],
            metricId: 'regular_standard',
        });

        expect(rows).toEqual([]);
    });

    it('plots every delivered average when no ids are given, and exactly the listed ones otherwise', () => {
        // WHY: the app seeds its comparison state with one key per delivered track and
        // passes the active ids as an exact list — there is no catch-all left that could
        // widen a one-track selection back to every track. A caller without app state
        // (no ids at all) still gets the full picture.
        const { competenceLevels, queries } = buildFixture();
        competenceLevels.push(
            competenceRow({
                id: 'state-gy',
                type: 'state',
                name: 'Landesschnitt GY',
                subject: 'Deutsch',
                domainId: 'le',
                domainName: 'Leseverstehen',
                levels: romanLevels([10, 10, 30, 20, 20, 10]),
            }),
        );

        const all = buildSummaryRows({
            queries,
            competenceLevels,
            metricId: 'regular_standard',
        });
        expect(all.averages.map((average) => average.id)).toEqual([
            'state:state',
            'state:state-gy',
        ]);

        const one = buildSummaryRows({
            queries,
            competenceLevels,
            metricId: 'regular_standard',
            activeAverageIds: ['state:state-gy'],
        });
        const row = findRow(one.rows, 'Deutsch: Leseverstehen');
        expect(
            row.entries.filter((entry) => entry.kind === 'average').map((entry) => entry.name),
        ).toEqual(['Landesschnitt GY']);
        // `averages` stays the full delivered list: it is what the ⌀ menu offers, and a
        // toggled-off average must remain on offer or it could never be switched back on.
        expect(one.averages.map((average) => average.id)).toEqual([
            'state:state',
            'state:state-gy',
        ]);
    });
});

describe('buildSummaryRows — row order', () => {
    it('ranks rows best-first, flipping direction for a metric where low is good', () => {
        // The Schulleitung reads the grid top-left first; on "unter Mindeststandard"
        // the strongest subject is the one with the LOWEST school value, so a fixed
        // descending sort would put the worst result in the most prominent card.
        const better = build('regular_standard').rows;
        expect(better.map((row) => row.rowLabel)).toEqual(
            [...better].sort((a, b) => b.schoolValue - a.schoolValue).map((row) => row.rowLabel),
        );

        const lower = build('below_minimum').rows;
        expect(lower.map((row) => row.rowLabel)).toEqual(
            [...lower].sort((a, b) => a.schoolValue - b.schoolValue).map((row) => row.rowLabel),
        );

        // Guard against a fixture where every value ties and any order would pass.
        expect(new Set(better.map((row) => row.schoolValue)).size).toBeGreaterThan(1);
    });
});

describe('buildSummaryRows — deviations', () => {
    it('expresses deltaPP as signed percentage POINTS, not a ratio', () => {
        // The bar labels read "+45 PP". Returning a ratio (0.45) would render bars
        // ~100× too short while still looking self-consistent.
        const { rows } = build('regular_standard');
        const row = findRow(rows, 'Deutsch: Leseverstehen');

        expect(classDelta(row, '8a')).toBeCloseTo((0.8 - 0.35) * 100, 10);
        expect(classDelta(row, '8b')).toBeCloseTo((0.3 - 0.35) * 100, 10);
        expect(classDelta(row, '8a')).toBeGreaterThan(0);
        expect(classDelta(row, '8b')).toBeLessThan(0);
    });
});

describe('buildSummaryRows — ragged classes', () => {
    it('omits a class that has no data for a row instead of zero-filling it', () => {
        // Only Mathematik has an 8d. A zero-filled 8d in Deutsch would draw a
        // zero-height bar, which reads as "exactly at the school average".
        const { rows } = build('regular_standard');

        expect(classesOf(findRow(rows, 'Deutsch: Leseverstehen')).map((c) => c.name)).toEqual([
            '8a',
            '8b',
        ]);
        expect(classesOf(findRow(rows, 'Mathematik')).map((c) => c.name)).toEqual(['8a', '8d']);
    });

    it('gives a row no column for a class it has no value for', () => {
        // WHY: a card's entries are its column band. A shared union across rows put a
        // slot on every card for every class in the payload, so a card carried columns
        // that could never hold a bar — with live data, where a test group sits exactly
        // one subject, that is most of them.
        // A column now exists if and only if there is a bar for it.
        const { rows } = build('regular_standard');

        const deutsch = findRow(rows, 'Deutsch: Leseverstehen');
        expect(deutsch.entries.map((entry) => entry.name)).not.toContain('8d');
        expect(findRow(rows, 'Mathematik').entries.map((entry) => entry.name)).not.toContain('8b');
    });
});

describe('buildSummaryRows — column labels', () => {
    // WHY: on live data a test group's `name` is the school's free text (`8aDeu`,
    // `D-G 8a`) and restates the subject the row heading already names. The server
    // ships the Stammklasse in a repeatable `homeroom` covariate; the column is
    // labelled by it when that is unambiguous, while `name` stays the key every
    // query resolves — a label that replaced the key would break the metric lookup.
    const homeroom = (value) => ({ type: 'homeroom', label: 'Stammklasse', value });

    function buildWithCovariates(assign) {
        const { competenceLevels, queries } = buildFixture();
        for (const entry of competenceLevels) {
            if (entry.type === 'group' && entry.id in assign) entry.covariates = assign[entry.id];
        }
        return findRow(
            buildSummaryRows({ queries, competenceLevels, metricId: 'regular_standard' }).rows,
            'Deutsch: Leseverstehen',
        );
    }

    it('labels a single-homeroom group by its Stammklasse and keeps the group name as the key', () => {
        const { competenceLevels, queries } = buildFixture();
        for (const entry of competenceLevels) {
            if (entry.id === '8a-deutsch') {
                entry.name = '8aDeu';
                entry.covariates = [homeroom('8a')];
            }
        }
        const row = findRow(
            buildSummaryRows({ queries, competenceLevels, metricId: 'regular_standard' }).rows,
            'Deutsch: Leseverstehen',
        );

        expect(classesOf(row).map((entry) => [entry.name, entry.label])).toEqual([
            ['8aDeu', '8a'],
            ['8b', '8b'],
        ]);
        // 8a: 8 of 10 at ≥ III → 80 % — resolved via the name, so the value is real, not NaN.
        expect(classDelta(row, '8aDeu')).toBeCloseTo((0.8 - 0.35) * 100, 10);
    });

    it('falls back to the group name when the group spans several homerooms or none', () => {
        const row = buildWithCovariates({
            '8a-deutsch': [homeroom('8a'), homeroom('8b')],
            '8b-deutsch': null,
        });

        expect(classesOf(row).map((entry) => entry.label)).toEqual(['8a', '8b']);
        expect(classesOf(row).map((entry) => entry.name)).toEqual(['8a', '8b']);
    });

    it('keeps both names when two groups in one row would claim the same Stammklasse', () => {
        // 8a's Deutsch G-Kurs and E-Kurs: one class, two bars — labelling both `8a`
        // would make them indistinguishable on the card face.
        const row = buildWithCovariates({
            '8a-deutsch': [homeroom('8c')],
            '8b-deutsch': [homeroom('8c')],
        });

        expect(classesOf(row).map((entry) => entry.label)).toEqual(['8a', '8b']);
    });

    it('does not let a homeroom label shadow another column that carries that name itself', () => {
        const row = buildWithCovariates({
            '8a-deutsch': [homeroom('8b')],
            '8b-deutsch': null,
        });

        expect(classesOf(row).map((entry) => entry.label)).toEqual(['8a', '8b']);
    });

    it('labels an average column by its own name', () => {
        const row = buildWithCovariates({});
        const average = row.entries.find((entry) => entry.kind === 'average');

        expect(average.label).toBe(average.name);
    });
});

describe('buildSummaryRows — shared scale', () => {
    it('returns one symmetric yDomain sized to the largest deviation across ALL rows', () => {
        // Rows share a scale so a 5 pp bar never looks as tall as a 45 pp bar.
        // Per-row autoscaling would make the bars incomparable between subjects.
        const { rows, yDomain } = build('regular_standard');

        const maxExtent = Math.max(
            ...rows.flatMap((row) => row.entries.map((c) => Math.abs(c.deltaPP))),
        );
        expect(yDomain).toEqual([-maxExtent, maxExtent]);
        expect(maxExtent).toBeCloseTo(45, 10); // 8a in Deutsch: Leseverstehen
    });

    it('never collapses to a zero-height scale when every class matches the school', () => {
        const { yDomain } = buildSummaryRows({
            queries: {
                shares: { getCompetenceLevelShare: () => 0.5 },
                rates: { getSolutionRate: () => 0.5 },
            },
            competenceLevels: [
                competenceRow({
                    id: 'schule',
                    type: 'school',
                    name: 'Testschule',
                    subject: 'Mathematik',
                    levels: romanLevels([1, 1, 1, 1, 1, 1]),
                }),
                competenceRow({
                    id: '8a-mathe',
                    type: 'group',
                    name: '8a',
                    subject: 'Mathematik',
                    levels: romanLevels([1, 1, 1, 1, 1, 1]),
                }),
            ],
            metricId: 'regular_standard',
        });

        expect(yDomain[0]).toBeLessThan(0);
        expect(yDomain[1]).toBeGreaterThan(0);
    });
});

describe('buildSummaryRows — metric definitions', () => {
    it('reads "Regelstandard oder höher" off each scale\'s own level names, whatever the notation', () => {
        // WHY: the two ladders share no level name. A metric that enumerated level
        // names could only ever serve the scales someone thought to list, which is how
        // every non-demo dataset came to report 0 %.
        const { rows } = build('regular_standard');

        // Deutsch 8a: 4 III + 3 IV + 1 V of 10 → 80 %
        expect(classesOf(findRow(rows, 'Deutsch: Leseverstehen'))[0].value).toBeCloseTo(0.8, 10);
        // Englisch 8a: 3 B1 + 2 B2 + 2 C1 of 10 → 70 %
        expect(classesOf(findRow(rows, 'Englisch: Hörverstehen'))[0].value).toBeCloseTo(0.7, 10);
    });

    it('reads "unter Mindeststandard" off the names, folding a split rank (Ia + Ib) into one', () => {
        const { rows } = build('below_minimum');

        // Deutsch 8a: 1 Ia + 1 Ib of 10 → 20 %; both name "Unter Mindeststandard"
        expect(classesOf(findRow(rows, 'Deutsch: Leseverstehen'))[0].value).toBeCloseTo(0.2, 10);
        // Englisch 8b: 4 A1 of 10 → 40 %
        expect(classesOf(findRow(rows, 'Englisch: Hörverstehen'))[1].value).toBeCloseTo(0.4, 10);
    });

    it('reads "Optimalstandard" as the top named standard only', () => {
        const { rows } = build('optimal_standard');

        // Deutsch 8a: 1 V of 10 → 10 %
        expect(classesOf(findRow(rows, 'Deutsch: Leseverstehen'))[0].value).toBeCloseTo(0.1, 10);
        // Englisch 8b: 0 C1 of 10 → 0 % — a real zero, because C1 *is* in this scale
        expect(classesOf(findRow(rows, 'Englisch: Hörverstehen'))[1].value).toBeCloseTo(0, 10);
    });

    // ── The labels ──────────────────────────────────────────────────────────
    // WHY these are pinned: which Kompetenzstufe counts as the Regelstandard depends on
    // the Schulabschluss a student is working toward, which the payload does not carry,
    // and a GER ladder has no correspondence to a standard name at all. Any label that
    // writes a standard's name into the string states that conditional as a fact on most
    // of the scales SL loads.

    it('names the Kompetenzstufe each rank alias resolves to, across every loaded ladder', () => {
        buildFixture();

        expect(getSummaryMetric('regular_standard').label()).toBe(
            'Anteil ab Kompetenzstufe III bzw. B1',
        );
        expect(getSummaryMetric('regular_standard').caption()).toBe(
            'erreichen mindestens Kompetenzstufe III bzw. B1',
        );
        // `le_1` names the *ceiling* of the qualifying set, and Ia/Ib fold onto band I.
        expect(getSummaryMetric('below_minimum').label()).toBe(
            'Anteil höchstens Kompetenzstufe I bzw. A1',
        );
        expect(getSummaryMetric('optimal_standard').label()).toBe(
            'Anteil Kompetenzstufe V bzw. C1',
        );
    });

    it('resolves the label per call, so one built before the payload loads is not frozen bandless', () => {
        // WHY: SUMMARY_METRICS is a module-level constant and `buildSlViewHeaderConfigs`
        // runs in the SL app constructor — before `fetchSlData` has registered a scale.
        // A label captured at that moment would name no band for the life of the page,
        // which is why the header control fills its items in `injectState`.
        const metric = getSummaryMetric('regular_standard');
        expect(metric.label()).toBe('Anteil obere Kompetenzstufen');

        buildFixture();
        expect(metric.label()).toBe('Anteil ab Kompetenzstufe III bzw. B1');
    });

    it('puts no KMK standard name on screen, on any metric', () => {
        buildFixture();

        for (const metric of SUMMARY_METRICS) {
            expect(`${metric.label()} ${metric.caption()}`).not.toMatch(
                /Regelstandard|Mindeststandard|Optimalstandard/i,
            );
        }
    });

    it('leaves the Lösungsquote wording alone — it reports no competence level', () => {
        buildFixture();

        expect(getSummaryMetric('solution_rate').label()).toBe('Lösungsquote');
        expect(getSummaryMetric('solution_rate').caption()).toBe('der Aufgaben korrekt gelöst');
    });

    it('derives the Lösungsquote from solved items, weighting the school by item count', () => {
        const { rows } = build('solution_rate');
        const row = findRow(rows, 'Deutsch: Leseverstehen');

        expect(row.schoolValue).toBeCloseTo(0.3, 10); // (40 + 20) / (100 + 100)
        expect(classDelta(row, '8a')).toBeCloseTo(10, 10); // 40 % − 30 %
        expect(classDelta(row, '8b')).toBeCloseTo(-10, 10); // 20 % − 30 %
    });

    it('omits a row whose scale names no standards instead of reporting it as 0 %', () => {
        // WHY: this is the defect the whole rework exists for. A scale the metric
        // cannot express (Niedersachsen measures Englisch on A1.1…B1.2, Nordrhein-
        // Westfalen everything on k.h.N./KS 1…KS 5) used to reach
        // `#extractCompetenceLevelCounts` and come back as `0 / 40` — finite, so it
        // survived every "is this a number?" guard downstream and was drawn as a
        // measurement. A Schulleitung was told its school had zero students at
        // Regelstandard. Unknown must not be representable as zero.
        resetCompetenceLevelPalette();

        const unnamedScale = [
            competenceRow({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Deutsch',
                domainId: 'le',
                domainName: 'Leseverstehen',
                levels: romanLevels([2, 2, 2, 2, 1, 1]),
                namesStandards: false,
            }),
            competenceRow({
                id: '8a',
                type: 'group',
                name: '8a',
                subject: 'Deutsch',
                domainId: 'le',
                domainName: 'Leseverstehen',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
                namesStandards: false,
            }),
        ];
        registerCompetenceLevelScales(unnamedScale);

        const dataStore = new DataStore();
        defineSlDatasets(dataStore);
        dataStore.setRawData(SL_DATA_KEYS.COMPETENCE_LEVELS, unnamedScale);
        const slData = slDataFromStore(dataStore);
        const unnamedQueries = {
            shares: new CompetenceShareQueries({ moduleId: 'test', slData }),
            rates: new SolutionRateQueries({ moduleId: 'test', slData }),
        };

        const share = unnamedQueries.shares.getCompetenceLevelShare({
            target: 'school',
            levelNames: ['III', 'IV', 'V'],
            subjectName: 'Deutsch',
            domainId: 'le',
        });
        expect(share).toBeCloseTo(0.4, 10); // levels named explicitly still resolve

        const { rows } = buildSummaryRows({
            queries: unnamedQueries,
            competenceLevels: unnamedScale,
            metricId: 'regular_standard',
        });
        expect(rows).toEqual([]);
    });

    it('drops rows whose metric has no source data rather than emitting NaN deviations', () => {
        // The item fixture only covers Deutsch: Leseverstehen; every other row's
        // solution rate is unresolvable and must disappear, not become NaN.
        const { rows } = build('solution_rate');

        expect(rows.map((row) => row.rowLabel)).toEqual(['Deutsch: Leseverstehen']);
        expect(
            rows.flatMap((row) => row.entries.map((c) => c.deltaPP)).every(Number.isFinite),
        ).toBe(true);
    });
});

describe('buildSummaryRows — subject coverage', () => {
    it('emits a row for every subject the payload carries, Französisch included', () => {
        // WHY: Französisch used to be dropped by a hardcoded `EXCLUDED_SUBJECTS` list
        // whose comment said "no data available". Measured, the fixture ships complete
        // Französisch data — school row, state row and class rows — so the list was
        // silently discarding a subject the dataset covers. Removed 2026-08-12.
        const { rows } = build('regular_standard');

        expect(rows.some((row) => row.subjectName === 'Französisch')).toBe(true);
    });

    it('accounts for every subject×domain, as either a row or a typed absence', () => {
        // WHY: the grid draws one card per subject×domain and the card shows the reason
        // when there is no row. A combination in neither list would be a hole in the
        // view that no message explains.
        for (const metric of SUMMARY_METRICS) {
            const { rows, absences } = build(metric.id);
            const covered = [...rows, ...absences].map(
                (entry) => `${entry.subjectName}|${entry.domainId ?? ''}`,
            );

            expect(new Set(covered).size).toBe(covered.length);
            // Deutsch/le, Englisch/ho, Mathematik (domain-less) and Französisch/le.
            expect(covered.sort()).toEqual([
                'Deutsch|le',
                'Englisch|ho',
                'Französisch|le',
                'Mathematik|',
            ]);
            expect(absences.every((absence) => typeof absence.reason === 'string')).toBe(true);
        }
    });

    it('distinguishes "this metric cannot be answered here" from "there are no classes"', () => {
        // WHY: the two have different remedies — one is a permanent property of the
        // state's scale, the other a gap in the export — and the card prints a
        // different sentence for each. Collapsing them to "keine Daten" is what this
        // whole item exists to undo.
        const { competenceLevels, queries } = buildFixture();

        // Mathematik keeps its classes but the solution-rate fixture covers only
        // Deutsch: Leseverstehen, so the metric is unanswerable there.
        const { absences } = buildSummaryRows({
            queries,
            competenceLevels,
            metricId: 'solution_rate',
        });
        const mathematik = absences.find((absence) => absence.subjectName === 'Mathematik');

        expect(mathematik.reason).toBe(ABSENCE_REASONS.METRIC_UNSUPPORTED);

        // A subject×domain the payload describes with a Landesschnitt and nothing else.
        const stateOnly = buildSummaryRows({
            queries,
            competenceLevels: [
                competenceRow({
                    id: 'schule',
                    type: 'school',
                    name: 'Testschule',
                    subject: 'Physik',
                    levels: romanLevels([1, 1, 1, 1, 1, 1]),
                }),
                competenceRow({
                    id: 'state',
                    type: 'state',
                    name: 'Landesschnitt',
                    subject: 'Physik',
                    levels: romanLevels([1, 1, 1, 1, 1, 1]),
                }),
            ],
            metricId: 'regular_standard',
        });

        expect(stateOnly.rows).toEqual([]);
        expect(stateOnly.absences.map((absence) => absence.reason)).toEqual([
            ABSENCE_REASONS.NO_CLASS_DATA,
        ]);
    });

    it('says the school row is missing rather than blaming the scale', () => {
        // WHY: the query layer resolves the school only against a payload that carries
        // the school's own row. Without one no metric has a school value, and that is a
        // gap in the export — the card used to report it as a scale that knows no level.
        const classRows = [
            competenceRow({
                id: '8a',
                type: 'group',
                name: '8a',
                subject: 'Physik',
                levels: romanLevels([1, 2, 3, 4, 5, 6]),
            }),
            competenceRow({
                id: '8b',
                type: 'group',
                name: '8b',
                subject: 'Physik',
                levels: romanLevels([2, 2, 2, 2, 2, 2]),
            }),
        ];
        const withoutSchool = buildSummaryRows({
            queries: {
                shares: helperFor({ competenceLevels: classRows }),
                rates: solutionRatesFor({ competenceLevels: classRows }),
            },
            competenceLevels: classRows,
            metricId: 'regular_standard',
        });

        expect(withoutSchool.rows).toEqual([]);
        expect(withoutSchool.absences.map((absence) => absence.reason)).toEqual([
            ABSENCE_REASONS.NO_SCHOOL_ROW,
        ]);

        // The same classes with the school row resolve: the scale was never the problem.
        const withSchool = [
            competenceRow({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Physik',
                levels: romanLevels([3, 4, 5, 6, 7, 8]),
            }),
            ...classRows,
        ];
        const resolved = buildSummaryRows({
            queries: {
                shares: helperFor({ competenceLevels: withSchool }),
                rates: solutionRatesFor({ competenceLevels: withSchool }),
            },
            competenceLevels: withSchool,
            metricId: 'regular_standard',
        });
        expect(resolved.absences).toEqual([]);
        expect(resolved.rows).toHaveLength(1);
    });

    it('names a glossary sentence for every absence reason and every metric', () => {
        // WHY: the card reads its sentence at `messages.<reason>`, or at the metric's
        // `unsupportedMessage`; a key the glossary lacks renders MISSING FROM GLOSSARY.
        const messages = slGlossary.sl.summary.deviation.messages;
        const keys = [
            ...Object.values(ABSENCE_REASONS).filter(
                (reason) => reason !== ABSENCE_REASONS.METRIC_UNSUPPORTED,
            ),
            ...SUMMARY_METRICS.map((metric) => metric.unsupportedMessage),
        ];

        for (const key of keys) {
            expect(typeof messages[key], key).toBe('string');
        }
    });
});

describe('getSummaryMetric', () => {
    it('falls back to the default metric for an unknown id so a stale URL/state cannot blank the view', () => {
        expect(getSummaryMetric('does-not-exist').id).toBe(DEFAULT_SUMMARY_METRIC_ID);
        expect(getSummaryMetric(undefined).id).toBe(DEFAULT_SUMMARY_METRIC_ID);
    });
});

describe('isDeviationFavourable', () => {
    it('flips good/bad for metrics where a lower value is better', () => {
        // The trickiest semantic in the feature: on `below_minimum`
        // a class ABOVE the school has more struggling students, so an upward bar
        // must be red. Colouring by raw sign would invert the message.
        expect(isDeviationFavourable(5, true)).toBe(true);
        expect(isDeviationFavourable(-5, true)).toBe(false);

        expect(isDeviationFavourable(5, false)).toBe(false);
        expect(isDeviationFavourable(-5, false)).toBe(true);

        expect(getSummaryMetric('below_minimum').higherIsBetter).toBe(false);
        expect(getSummaryMetric('regular_standard').higherIsBetter).toBe(true);
        expect(getSummaryMetric('optimal_standard').higherIsBetter).toBe(true);
        expect(getSummaryMetric('solution_rate').higherIsBetter).toBe(true);
    });
});

describe('isEntryFavourable', () => {
    it('inverts an average bar, because it shows the reference and not us', () => {
        // Both bars are +5 PP on "Regelstandard oder höher". A class 5 PP above
        // the school is good news; a Landesschnitt 5 PP above the school means we
        // trail the state — same geometry, opposite message, so the same colour
        // for both would tell the Schulleitung the wrong thing.
        const klass = { kind: 'class', deltaPP: 5 };
        const average = { kind: 'average', deltaPP: 5 };

        expect(isEntryFavourable(klass, true)).toBe(true);
        expect(isEntryFavourable(average, true)).toBe(false);

        expect(isEntryFavourable({ kind: 'average', deltaPP: -5 }, true)).toBe(true);
    });

    it('still respects a metric where a lower value is better', () => {
        // `below_minimum`: a Landesschnitt BELOW us means the state
        // has fewer struggling students than we do — bad news for the school.
        expect(isEntryFavourable({ kind: 'average', deltaPP: -5 }, false)).toBe(false);
        expect(isEntryFavourable({ kind: 'average', deltaPP: 5 }, false)).toBe(true);
        expect(isEntryFavourable({ kind: 'class', deltaPP: 5 }, false)).toBe(false);
    });
});

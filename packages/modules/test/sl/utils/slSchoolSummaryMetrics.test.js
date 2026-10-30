import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildSummaryRows,
    entryVerdict,
    selectActiveAverages,
} from '../../../src/sl/utils/slSchoolSummaryMetrics.js';
import {
    ABSENCE_REASONS,
    getSummaryMetric,
    SUMMARY_METRICS,
    DEFAULT_SUMMARY_METRIC_ID,
} from '../../../src/sl/utils/slSchoolSummaryMetricRegistry.js';
import { buildCompetenceLevelIndex } from '../../../src/sl/slCompetenceLevelIndex.js';
import {
    competenceValueGroup,
    domainBookletSubject,
    gerLevels,
    romanLevels,
    twoBookletSubject,
} from '../../support/slValueGroupFactories.js';
import { buildSummaryMetricsFixture as buildFixture } from '../../support/slSchoolSummaryFixture.js';
import { ratesOf, sharesOf, slContextFor } from '../../support/slInfoBoxFixture.js';
import { slGlossaryFragments } from '../../../src/sl/slGlossaryFragments.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { required } from '../../support/required.js';

/** @typedef {import('../../../src/sl/utils/slSchoolSummaryMetrics.js').SummaryRow} SummaryRow */
/** @typedef {import('../../../src/sl/utils/slSchoolSummaryMetrics.js').SummaryEntry} SummaryEntry */
/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/**
 * The four metrics feed the Überblick view's deviation bars. Every assertion here
 * pins a property the chart depends on: a wrong aggregate, a wrong unit, a
 * zero-filled gap or a per-row scale would each render a plausible-looking but
 * misleading picture, which no rendering test would catch.
 */

/** @type {import('../../../src/common/context/index.js').ModuleContext} */
let context;

beforeEach(() => {
    // A fresh palette per case: a scale left over from another case would let a metric
    // resolve against levels the fixture under test never shipped.
    context = createTestContext('sl');
});

/**
 * The queries `buildSummaryRows` reads, over one context holding the value groups.
 * @param {import('../../support/slInfoBoxFixture.js').SlPayload} payload - The school's value groups.
 * @returns {Promise<Awaited<ReturnType<typeof buildFixture>>['queries']>} The share and Lösungsquote queries and the palette.
 */
async function summaryQueriesFor(payload) {
    const payloadContext = await slContextFor(payload);
    return {
        shares: sharesOf(payloadContext),
        rates: ratesOf(payloadContext),
        palette: payloadContext.palette,
    };
}

/**
 * The fixture's summary for one metric, with the queries it was built from.
 * @param {string} metricId
 * @param {string[]|null} [activeAverageIds] - The active averages; `null` for every one.
 * @returns {Promise<import('../../../src/sl/utils/slSchoolSummaryMetrics.js').SummarySelection & {queries: Awaited<ReturnType<typeof buildFixture>>['queries']}>}
 */
async function build(metricId, activeAverageIds = null) {
    const { competenceLevels, queries } = await buildFixture();
    return {
        ...selectActiveAverages(
            buildSummaryRows({
                queries,
                index: buildCompetenceLevelIndex(competenceLevels),
                metric: getSummaryMetric(metricId),
            }),
            activeAverageIds,
        ),
        queries,
    };
}

/**
 * @param {SummaryRow[]} rows
 * @param {string} rowLabel - The heading of the row wanted.
 * @returns {SummaryRow}
 */
function findRow(rows, rowLabel) {
    return required(
        rows.find((row) => row.rowLabel === rowLabel),
        rowLabel,
    );
}

/**
 * Group columns only — averages lead each row and would shift every index.
 * @param {SummaryRow} row
 * @returns {SummaryEntry[]}
 */
function groupsOf(row) {
    return row.entries.filter((entry) => entry.kind === 'group');
}

/**
 * @param {SummaryRow} row
 * @param {string} groupName
 * @returns {number|undefined} The group's deviation, if it has a column.
 */
function groupDelta(row, groupName) {
    return groupsOf(row).find((entry) => entry.name === groupName)?.deltaPP;
}

/**
 * A second Landesschnitt track that covers Deutsch: Lesen only.
 * @param {CompetenceLevelsValueGroup[]} competenceLevels - The fixture value groups, changed in place.
 */
function withGyTrack(competenceLevels) {
    competenceLevels.push(
        competenceValueGroup({
            id: 'state-gy',
            type: 'state',
            name: 'Landesschnitt GY',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([10, 10, 30, 20, 20, 10]),
        }),
    );
}

describe('buildSummaryRows — school value', () => {
    it('aggregates the groups by student count rather than averaging group shares', async () => {
        // 8a is 80 % over 10 students, 8b is 30 % over 90. The mean of the shares
        // (55 %) is the wrong answer; the weighted aggregate is 35 %. Averaging the
        // group values would pass every visual check.
        const { rows, queries } = await build('ge_medium');
        const row = findRow(rows, 'Deutsch: Lesen');

        expect(row.schoolValue).toBeCloseTo(0.35, 10);
        expect(row.schoolValue).toBeCloseTo(
            required(
                queries.shares.getCompetenceLevelShare({
                    target: 'school',
                    levelAlias: 'ge_medium',
                    subjectName: 'Deutsch',
                    domainId: 'le',
                }),
            ),
            10,
        );
    });
});

describe('buildSummaryRows — reference averages', () => {
    it('plots an active average as an ordinary deviation column, measured against the school', async () => {
        // Landesschnitt is 40 % at ≥ III, the school 35 % → +5 PP, in the same
        // unit and against the same baseline as a group bar.
        const { rows } = await build('ge_medium');
        const row = findRow(rows, 'Deutsch: Lesen');
        const average = required(row.entries.find((entry) => entry.kind === 'average'));

        expect(average).toMatchObject({ name: 'Landesschnitt', kind: 'average' });
        expect(average.value).toBeCloseTo(0.4, 10);
        expect(average.deltaPP).toBeCloseTo(5, 10);
    });

    it("uses the persisted state value group's name for the reference average column", async () => {
        // A split state export may name the selected reference "Landesschnitt GY".
        // The Überblick deviation column should preserve that payload identity instead
        // of rewriting every state value group to the generic label.
        const { competenceLevels, queries } = await buildFixture((valueGroups) => {
            required(valueGroups.find((entry) => entry.type === 'state')).name = 'Landesschnitt GY';
        });

        const { rows } = buildSummaryRows({
            queries,
            index: buildCompetenceLevelIndex(competenceLevels),
            metric: getSummaryMetric('ge_medium'),
        });
        const row = findRow(rows, 'Deutsch: Lesen');

        expect(row.entries.find((entry) => entry.kind === 'average')).toMatchObject({
            name: 'Landesschnitt GY',
            label: 'Landesschnitt GY',
        });
        expect(row.entries[0]).toMatchObject({ name: 'Landesschnitt GY', kind: 'average' });
    });

    it('plots a comparison population of a type it has no name for', async () => {
        // The spec's `type` is open, and the EN and MA dashboards of the same export
        // draw such a population; keeping `state` value groups only would drop it from the
        // Überblick.
        const { competenceLevels, queries } = await buildFixture((valueGroups) => {
            valueGroups.push(
                competenceValueGroup({
                    id: 'bezirk',
                    type: 'district',
                    name: 'Bezirksschnitt',
                    subject: 'Deutsch',
                    domainId: 'le',
                    domainName: 'Lesen',
                    levels: romanLevels([10, 10, 30, 20, 20, 10]),
                }),
            );
        });

        const { rows, averages } = buildSummaryRows({
            queries,
            index: buildCompetenceLevelIndex(competenceLevels),
            metric: getSummaryMetric('ge_medium'),
        });

        expect(averages.map((average) => [average.id, average.label])).toEqual([
            ['state', 'Landesschnitt'],
            ['bezirk', 'Bezirksschnitt'],
        ]);
        expect(
            findRow(rows, 'Deutsch: Lesen')
                .entries.filter((entry) => entry.kind === 'average')
                .map((entry) => entry.name),
        ).toEqual(['Landesschnitt', 'Bezirksschnitt']);
    });

    it('gives a row no column for an average that does not resolve there', async () => {
        // A state export may ship several Landesschnitt tracks that do not all cover
        // every subject. Under a shared column band such a track would keep a slot on
        // every card and render as a muted "–" wherever it has no value. Averages follow
        // the same rule as groups: a column exists only where a bar does.
        const { competenceLevels, queries } = await buildFixture(withGyTrack);

        const { rows } = buildSummaryRows({
            queries,
            index: buildCompetenceLevelIndex(competenceLevels),
            metric: getSummaryMetric('ge_medium'),
        });

        expect(findRow(rows, 'Deutsch: Lesen').entries.map((entry) => entry.name)).toContain(
            'Landesschnitt GY',
        );
        expect(findRow(rows, 'Mathematik').entries.map((entry) => entry.name)).not.toContain(
            'Landesschnitt GY',
        );
    });

    it('reports no reference average at all when the payload carries no state value group', async () => {
        // The card's ⌀ dropdown is built from this list. A static Landesschnitt entry
        // would offer a comparison no row can plot: `buildRow` skips an average whose
        // metric does not resolve.
        const { competenceLevels, queries } = await buildFixture();
        const withoutState = competenceLevels.filter((entry) => entry.type !== 'state');

        const { rows, averages } = buildSummaryRows({
            queries,
            index: buildCompetenceLevelIndex(withoutState),
            metric: getSummaryMetric('ge_medium'),
        });

        expect(averages).toEqual([]);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.entries.every((entry) => entry.kind === 'group'))).toBe(
            true,
        );
    });

    it('puts the averages before the groups in every row', async () => {
        // The chart draws a divider after the last average and the entries are the
        // column band, so the averages have to be a prefix: one sorted in among the
        // groups would land on the wrong side of the divider.
        const { rows } = await build('ge_medium');

        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            const kinds = row.entries.map((entry) => entry.kind);
            expect(kinds.lastIndexOf('average')).toBeLessThan(kinds.indexOf('group'));
        }
    });

    it('omits the average column entirely when it is toggled off', async () => {
        const { rows } = await build('ge_medium', []);

        expect(rows.every((row) => row.entries.every((entry) => entry.kind === 'group'))).toBe(
            true,
        );
    });

    it('drops a row that has no group of its own, even when the average resolves', async () => {
        // A card showing only a Landesschnitt bar would claim to describe this
        // school while containing none of its data.
        const competenceLevels = [
            competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Mathematik',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
            }),
            competenceValueGroup({
                id: 'state',
                type: 'state',
                name: 'Landesschnitt',
                subject: 'Mathematik',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
            }),
        ];
        const queries = await summaryQueriesFor({ competenceLevels });
        const metric = getSummaryMetric('ge_medium');
        // School and Landesschnitt both answer, so the row gets past the school check
        // to the rule under test.
        expect(metric.resolve(queries, 'school', 'Mathematik', null)).toBeTypeOf('number');
        expect(
            metric.resolve(queries, { type: 'comparison', id: 'state' }, 'Mathematik', null),
        ).toBeTypeOf('number');

        const { rows, averages, absences } = buildSummaryRows({
            queries,
            index: buildCompetenceLevelIndex(competenceLevels),
            metric,
        });

        expect(averages.map((average) => average.id)).toEqual(['state']);
        expect(rows).toEqual([]);
        expect(absences.map((absence) => absence.reason)).toEqual([ABSENCE_REASONS.NO_GROUP_DATA]);
    });

    it('says its groups produced no value when they are there but none answers', async () => {
        // 8a was measured on a ladder that names no standard, so the Regelstandard share
        // is unknown for it while the school's is not: the card blames the groups'
        // values, not their absence.
        const competenceLevels = [
            competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Mathematik',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
            }),
            competenceValueGroup({
                id: '8a',
                type: 'group',
                name: '8a',
                subject: 'Mathematik',
                levels: gerLevels([1, 1, 1, 1, 1]),
                namesStandards: false,
            }),
        ];
        const queries = await summaryQueriesFor({ competenceLevels });
        const metric = getSummaryMetric('ge_medium');
        expect(metric.resolve(queries, 'school', 'Mathematik', null)).toBeTypeOf('number');

        const { rows, absences } = buildSummaryRows({
            queries,
            index: buildCompetenceLevelIndex(competenceLevels),
            metric,
        });

        expect(rows).toEqual([]);
        expect(absences.map((absence) => absence.reason)).toEqual([
            ABSENCE_REASONS.NO_GROUP_VALUES,
        ]);
    });

    it('plots every delivered average when no ids are given, and exactly the listed ones otherwise', async () => {
        // The app seeds its comparison state with one key per delivered track and
        // passes the active ids as an exact list, so a one-track selection is never
        // widened to every track. A caller without app state (no ids) gets them all.
        const { competenceLevels, queries } = await buildFixture(withGyTrack);

        const all = buildSummaryRows({
            queries,
            index: buildCompetenceLevelIndex(competenceLevels),
            metric: getSummaryMetric('ge_medium'),
        });
        expect(all.averages.map((average) => average.id)).toEqual(['state', 'state-gy']);
        expect(
            findRow(all.rows, 'Deutsch: Lesen')
                .entries.slice(0, 3)
                .map((entry) => [entry.name, entry.kind]),
        ).toEqual([
            ['Landesschnitt', 'average'],
            ['Landesschnitt GY', 'average'],
            ['8a', 'group'],
        ]);

        const one = selectActiveAverages(all, ['state-gy']);
        const row = findRow(one.rows, 'Deutsch: Lesen');
        expect(
            row.entries.filter((entry) => entry.kind === 'average').map((entry) => entry.name),
        ).toEqual(['Landesschnitt GY']);
        // `averages` stays the full delivered list: it is what the ⌀ menu offers, and a
        // toggled-off average must remain on offer or it could never be switched back on.
        expect(one.averages.map((average) => average.id)).toEqual(['state', 'state-gy']);
    });
});

describe('buildSummaryRows — mixed booklets', () => {
    /**
     * The summary of a Deutsch tested with two booklets.
     * @param {string} metricId
     * @returns {Promise<import('../../../src/sl/utils/slSchoolSummaryMetrics.js').SummarySelection>}
     */
    const summaryOf = async (metricId) => {
        const competenceLevels = twoBookletSubject();
        const slContext = await slContextFor({ competenceLevels });
        return buildSummaryRows({
            queries: { shares: sharesOf(slContext), rates: ratesOf(slContext) },
            index: buildCompetenceLevelIndex(competenceLevels),
            metric: getSummaryMetric(metricId),
        });
    };

    it('drops the Lösungsquote of a Fach tested with several booklets, saying why', async () => {
        const { rows, absences } = await summaryOf('solution_rate');

        expect(rows).toEqual([]);
        expect(absences.map((absence) => absence.reason)).toEqual([ABSENCE_REASONS.MIXED_BOOKLETS]);
    });

    it('drops only the Lösungsquote of a Domäne sat in several booklets', async () => {
        // NW: each Deutsch booklet covers two Domänen, so Lesen was sat in two booklets
        // and Rechtschreibung and Sprachgebrauch in one each. Counting per Fach withheld
        // all three cards.
        const payload = domainBookletSubject();
        const slContext = await slContextFor(payload);
        const { rows, absences } = buildSummaryRows({
            queries: {
                shares: sharesOf(slContext),
                rates: ratesOf(slContext),
            },
            index: buildCompetenceLevelIndex(payload.competenceLevels),
            metric: getSummaryMetric('solution_rate'),
        });

        expect(rows.map((row) => [row.domainId, row.schoolValue])).toEqual([
            ['rs', 0.5],
            ['sp', 0.5],
        ]);
        expect(absences.map((absence) => [absence.domainId, absence.reason])).toEqual([
            ['le', ABSENCE_REASONS.MIXED_BOOKLETS],
        ]);
    });

    it('keeps the competence shares, which are equated per booklet', async () => {
        const { rows, absences } = await summaryOf('ge_medium');

        expect(rows.map((row) => row.subjectName)).toEqual(['Deutsch']);
        expect(absences).toEqual([]);
    });
});

describe('buildSummaryRows — row order', () => {
    it('keeps the payload order of subjects and domains under every metric', async () => {
        // The Überblick shows the subjects as the data delivers them; ranking them by
        // school value would reshuffle the grid on every metric change.
        const payloadOrder = ['Deutsch|le', 'Englisch|ho', 'Französisch|le', 'Mathematik|'];
        /** @param {{subjectName: string, domainId: string|null}} entry - A card, row or absence. */
        const key = (entry) => `${entry.subjectName}|${entry.domainId ?? ''}`;
        for (const metric of SUMMARY_METRICS) {
            const { cards, rows, absences } = await build(metric.id);

            expect(cards.map(key)).toEqual(payloadOrder);
            expect(rows.map(key)).toEqual(
                payloadOrder.filter((k) => rows.some((r) => key(r) === k)),
            );
            expect(absences.map(key)).toEqual(
                payloadOrder.filter((k) => absences.some((a) => key(a) === k)),
            );
        }
    });
});

describe('buildSummaryRows — deviations', () => {
    it('expresses deltaPP as signed percentage POINTS, not a ratio', async () => {
        // The bar labels read "+45 PP". Returning a ratio (0.45) would render bars
        // ~100× too short while still looking self-consistent.
        const { rows } = await build('ge_medium');
        const row = findRow(rows, 'Deutsch: Lesen');

        expect(groupDelta(row, '8a')).toBeCloseTo((0.8 - 0.35) * 100, 10);
        expect(groupDelta(row, '8b')).toBeCloseTo((0.3 - 0.35) * 100, 10);
        expect(groupDelta(row, '8a')).toBeGreaterThan(0);
        expect(groupDelta(row, '8b')).toBeLessThan(0);
    });
});

describe('buildSummaryRows — ragged groups', () => {
    it('omits a group that has no data for a row instead of zero-filling it', async () => {
        // Only Mathematik has an 8d. A zero-filled 8d in Deutsch would draw a
        // zero-height bar, which reads as "exactly at the school average".
        const { rows } = await build('ge_medium');

        expect(groupsOf(findRow(rows, 'Deutsch: Lesen')).map((c) => c.name)).toEqual(['8a', '8b']);
        expect(groupsOf(findRow(rows, 'Mathematik')).map((c) => c.name)).toEqual(['8a', '8d']);
    });
});

describe('buildSummaryRows — column labels', () => {
    // A test group's `name` can be the school's free text (`8aDeu`, `D-G 8a`)
    // and restate the subject the row heading already names. The server ships the
    // Stammklasse in a repeatable `homeroom` covariate; the column is labelled by it
    // when that is unambiguous, while `name` stays the key every query resolves — a
    // label that replaced the key would break the metric lookup.
    /**
     * @param {string} value - The Stammklasse.
     * @returns {{type: string, label: string, value: string}} The `homeroom` covariate.
     */
    const homeroom = (value) => ({ type: 'homeroom', label: 'Stammklasse', value });

    /**
     * The Deutsch: Lesen row, its groups' covariates replaced.
     * @param {Record<string, CompetenceLevelsValueGroup['covariates']>} assign - Group id → its covariates.
     * @returns {Promise<SummaryRow>}
     */
    async function buildWithCovariates(assign) {
        const { competenceLevels, queries } = await buildFixture((valueGroups) => {
            for (const entry of valueGroups) {
                if (entry.type === 'group' && entry.id in assign)
                    entry.covariates = assign[entry.id];
            }
        });
        return findRow(
            buildSummaryRows({
                queries,
                index: buildCompetenceLevelIndex(competenceLevels),
                metric: getSummaryMetric('ge_medium'),
            }).rows,
            'Deutsch: Lesen',
        );
    }

    it('labels a single-homeroom group by its Stammklasse and keeps the group name as the key', async () => {
        const { competenceLevels, queries } = await buildFixture((valueGroups) => {
            for (const entry of valueGroups) {
                if (entry.id === '8a-deutsch') {
                    entry.name = '8aDeu';
                    entry.covariates = [homeroom('8a')];
                }
            }
        });
        const row = findRow(
            buildSummaryRows({
                queries,
                index: buildCompetenceLevelIndex(competenceLevels),
                metric: getSummaryMetric('ge_medium'),
            }).rows,
            'Deutsch: Lesen',
        );

        expect(groupsOf(row).map((entry) => [entry.name, entry.label])).toEqual([
            ['8aDeu', '8a'],
            ['8b', '8b'],
        ]);
        // 8a: 8 of 10 at ≥ III → 80 % — resolved via the name, so the value is real, not NaN.
        expect(groupDelta(row, '8aDeu')).toBeCloseTo((0.8 - 0.35) * 100, 10);
    });

    it('falls back to the group name when the group spans several homerooms or none', async () => {
        const row = await buildWithCovariates({
            '8a-deutsch': [homeroom('8a'), homeroom('8b')],
            '8b-deutsch': undefined,
        });

        expect(groupsOf(row).map((entry) => entry.label)).toEqual(['8a', '8b']);
        expect(groupsOf(row).map((entry) => entry.name)).toEqual(['8a', '8b']);
    });

    it('keeps both names when two groups in one row would claim the same Stammklasse', async () => {
        // 8a's Deutsch G-Kurs and E-Kurs: one group, two bars — labelling both `8a`
        // would make them indistinguishable on the card face.
        const row = await buildWithCovariates({
            '8a-deutsch': [homeroom('8c')],
            '8b-deutsch': [homeroom('8c')],
        });

        expect(groupsOf(row).map((entry) => entry.label)).toEqual(['8a', '8b']);
    });

    it('does not let a homeroom label shadow another column that carries that name itself', async () => {
        const row = await buildWithCovariates({
            '8a-deutsch': [homeroom('8b')],
            '8b-deutsch': undefined,
        });

        expect(groupsOf(row).map((entry) => entry.label)).toEqual(['8a', '8b']);
    });

    it('labels an average column by its own name', async () => {
        const row = await buildWithCovariates({});
        const average = required(row.entries.find((entry) => entry.kind === 'average'));

        expect(average.label).toBe(average.name);
    });
});

describe('buildSummaryRows — shared scale', () => {
    it('returns one symmetric yDomain sized to the largest deviation across ALL rows', async () => {
        // Rows share a scale so a 5 pp bar never looks as tall as a 45 pp bar.
        // Per-row autoscaling would make the bars incomparable between subjects.
        const { rows, yDomain } = await build('ge_medium');

        const maxExtent = Math.max(
            ...rows.flatMap((row) => row.entries.map((c) => Math.abs(c.deltaPP))),
        );
        expect(yDomain).toEqual([-maxExtent, maxExtent]);
        expect(maxExtent).toBeCloseTo(45, 10); // 8a in Deutsch: Lesen
    });

    it('never collapses to a zero-height scale when every group matches the school', async () => {
        const competenceLevels = [
            competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Mathematik',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
            }),
            competenceValueGroup({
                id: '8a-mathe',
                type: 'group',
                name: '8a',
                subject: 'Mathematik',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
            }),
        ];
        const slContext = await slContextFor({ competenceLevels });
        const { rows, yDomain } = buildSummaryRows({
            queries: { shares: sharesOf(slContext), rates: ratesOf(slContext) },
            index: buildCompetenceLevelIndex(competenceLevels),
            metric: getSummaryMetric('ge_medium'),
        });

        // The one group bar sits at no difference.
        expect(rows.flatMap((row) => row.entries.map((entry) => entry.deltaPP))).toEqual([0]);
        expect(yDomain[0]).toBeLessThan(0);
        expect(yDomain[1]).toBeGreaterThan(0);
    });
});

describe('buildSummaryRows — metric definitions', () => {
    it('reads "Regelstandard oder höher" off each scale\'s own level names, whatever the notation', async () => {
        // The two ladders share no level name. A metric that enumerated level
        // names could only ever serve the scales someone thought to list, and every
        // other dataset would report 0 %.
        const { rows } = await build('ge_medium');

        // Deutsch 8a: 4 III + 3 IV + 1 V of 10 → 80 %
        expect(groupsOf(findRow(rows, 'Deutsch: Lesen'))[0].value).toBeCloseTo(0.8, 10);
        // Englisch 8a: 3 B1 + 2 B2 + 2 C1 of 10 → 70 %
        expect(groupsOf(findRow(rows, 'Englisch: Hören'))[0].value).toBeCloseTo(0.7, 10);
    });

    it('reads "unter Mindeststandard" off the band tags, counting Ia and Ib alike', async () => {
        const { rows } = await build('le_low');

        // Deutsch 8a: 1 Ia + 1 Ib of 10 → 20 %; both are tagged low
        expect(groupsOf(findRow(rows, 'Deutsch: Lesen'))[0].value).toBeCloseTo(0.2, 10);
        // Englisch 8b: 4 A1 of 10 → 40 %
        expect(groupsOf(findRow(rows, 'Englisch: Hören'))[1].value).toBeCloseTo(0.4, 10);
    });

    it('reads "Optimalstandard" as the top named standard only', async () => {
        const { rows } = await build('e_high');

        // Deutsch 8a: 1 V of 10 → 10 %
        expect(groupsOf(findRow(rows, 'Deutsch: Lesen'))[0].value).toBeCloseTo(0.1, 10);
        // Englisch 8b: 0 C1 of 10 → 0 % — a real zero, because C1 *is* in this scale
        expect(groupsOf(findRow(rows, 'Englisch: Hören'))[1].value).toBeCloseTo(0, 10);
    });

    // ── The labels ──────────────────────────────────────────────────────────
    // WHY these are pinned: which Kompetenzstufe counts as the Regelstandard depends on
    // the Schulabschluss a student is working toward, which the payload does not carry,
    // and a GER ladder has no correspondence to a standard name at all. Any label that
    // writes a standard's name into the string states that conditional as a fact on most
    // of the scales SL loads.

    it('names the Kompetenzstufe each band alias resolves to, across every loaded ladder', async () => {
        const { palette } = (await buildFixture()).queries;

        expect(getSummaryMetric('ge_medium').label(palette)).toBe(
            'Anteil ab Kompetenzstufe III bzw. B1',
        );
        expect(getSummaryMetric('ge_medium').caption(palette)).toBe(
            'erreichen mindestens Kompetenzstufe III bzw. B1',
        );
        // `le_low` names the *ceiling* of the qualifying set: Ib, the top of Ia/Ib.
        expect(getSummaryMetric('le_low').label(palette)).toBe(
            'Anteil höchstens Kompetenzstufe Ib bzw. A1',
        );
        expect(getSummaryMetric('e_high').label(palette)).toBe('Anteil Kompetenzstufe V bzw. C1');
    });

    it('resolves the label per call, so one built before the payload loads is not frozen bandless', async () => {
        // SUMMARY_METRICS is a module-level constant and `buildSlViewHeaderControls`
        // runs in the SL app constructor — before the store has registered a scale.
        // A label captured at that moment would name no band for the life of the page,
        // which is why the header control fills its items in `injectState`.
        const metric = getSummaryMetric('ge_medium');
        expect(metric.label(context.palette)).toBe('Anteil obere Kompetenzstufen');

        const { palette } = (await buildFixture()).queries;
        expect(metric.label(palette)).toBe('Anteil ab Kompetenzstufe III bzw. B1');
    });

    it('leaves the Lösungsquote wording alone — it reports no competence level', async () => {
        const { palette } = (await buildFixture()).queries;

        expect(getSummaryMetric('solution_rate').label(palette)).toBe('Lösungsquote');
        expect(getSummaryMetric('solution_rate').caption(palette)).toBe(
            'der Teilaufgaben korrekt gelöst',
        );
    });

    it('derives the Lösungsquote from the solved share of the school value group', async () => {
        const { rows } = await build('solution_rate');
        const row = findRow(rows, 'Deutsch: Lesen');

        expect(row.schoolValue).toBeCloseTo(0.3, 10); // (40 + 20) / (100 + 100)
        expect(groupDelta(row, '8a')).toBeCloseTo(10, 10); // 40 % − 30 %
        expect(groupDelta(row, '8b')).toBeCloseTo(-10, 10); // 20 % − 30 %
    });

    it('omits a row whose scale names no standards instead of reporting it as 0 %', async () => {
        // A scale the metric cannot express (A1.1…B1.2, k.h.N./KS 1…KS 5) that
        // reached `#extractCompetenceLevelCounts` would come back as `0 / 40` — finite,
        // so it would pass every numeric guard downstream and be drawn as a measurement
        // of zero students at Regelstandard. Unknown must not be representable as zero.
        const unnamedScale = [
            competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Deutsch',
                domainId: 'le',
                domainName: 'Lesen',
                levels: romanLevels([2, 2, 2, 2, 1, 1]),
                namesStandards: false,
            }),
            competenceValueGroup({
                id: '8a',
                type: 'group',
                name: '8a',
                subject: 'Deutsch',
                domainId: 'le',
                domainName: 'Lesen',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
                namesStandards: false,
            }),
        ];
        const unnamedQueries = await summaryQueriesFor({ competenceLevels: unnamedScale });

        const share = unnamedQueries.shares.getCompetenceLevelShare({
            target: 'school',
            levelAlias: 'ge_medium',
            subjectName: 'Deutsch',
            domainId: 'le',
        });
        expect(share).toBeNull(); // no band alias reaches a ladder that names no standard

        const { rows } = buildSummaryRows({
            queries: unnamedQueries,
            index: buildCompetenceLevelIndex(unnamedScale),
            metric: getSummaryMetric('ge_medium'),
        });
        expect(rows).toEqual([]);
    });

    it('drops rows whose metric has no source data rather than emitting NaN deviations', async () => {
        // The result fixture only covers Deutsch: Lesen; every other row's
        // solution rate is unresolvable and must disappear, not become NaN.
        const { rows } = await build('solution_rate');

        expect(rows.map((row) => row.rowLabel)).toEqual(['Deutsch: Lesen']);
        expect(
            rows.flatMap((row) => row.entries.map((c) => c.deltaPP)).every(Number.isFinite),
        ).toBe(true);
    });
});

describe('buildSummaryRows — subject coverage', () => {
    it('emits a row for every subject the payload carries, Französisch included', async () => {
        // The fixture ships complete Französisch data — school, state and group value
        // groups — so no hardcoded subject list may discard it.
        const { rows } = await build('ge_medium');

        expect(rows.some((row) => row.subjectName === 'Französisch')).toBe(true);
    });

    it('accounts for every subject×domain, as either a row or a typed absence', async () => {
        // The grid draws one card per subject×domain and the card shows the reason
        // when there is no row. A combination in neither list would be a hole in the
        // view that no message explains.
        for (const metric of SUMMARY_METRICS) {
            const { rows, absences } = await build(metric.id);
            const covered = [...rows, ...absences].map(
                (entry) => `${entry.subjectName}|${entry.domainId ?? ''}`,
            );

            expect(new Set(covered).size).toBe(covered.length);
            expect(covered.sort()).toEqual([
                'Deutsch|le',
                'Englisch|ho',
                'Französisch|le',
                'Mathematik|',
            ]);
            expect(absences.every((absence) => typeof absence.reason === 'string')).toBe(true);
        }
    });

    it('distinguishes "this metric cannot be answered here" from "there are no groups"', async () => {
        // The two have different remedies — one is a permanent property of the
        // state's scale, the other a gap in the export — and the card prints a
        // different sentence for each; collapsing them to "keine Daten" would lose that.
        const { competenceLevels, queries } = await buildFixture();

        // Mathematik keeps its groups but the solution-rate fixture covers only
        // Deutsch: Lesen, so the metric is unanswerable there.
        const { absences } = buildSummaryRows({
            queries,
            index: buildCompetenceLevelIndex(competenceLevels),
            metric: getSummaryMetric('solution_rate'),
        });
        const mathematik = required(
            absences.find((absence) => absence.subjectName === 'Mathematik'),
        );

        expect(mathematik.reason).toBe(ABSENCE_REASONS.METRIC_UNSUPPORTED);

        // A subject×domain the payload describes with a Landesschnitt and nothing else,
        // read through queries over that same payload.
        const physik = [
            competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Physik',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
            }),
            competenceValueGroup({
                id: 'state',
                type: 'state',
                name: 'Landesschnitt',
                subject: 'Physik',
                levels: romanLevels([1, 1, 1, 1, 1, 1]),
            }),
        ];
        const stateOnly = buildSummaryRows({
            queries: await summaryQueriesFor({ competenceLevels: physik }),
            index: buildCompetenceLevelIndex(physik),
            metric: getSummaryMetric('ge_medium'),
        });

        expect(stateOnly.rows).toEqual([]);
        expect(stateOnly.absences.map((absence) => absence.reason)).toEqual([
            ABSENCE_REASONS.NO_GROUP_DATA,
        ]);
    });

    it('says the school value group is missing rather than blaming the scale', async () => {
        // The query layer resolves the school only against a payload that carries
        // the school's own value group. Without one no metric has a school value, and that is a
        // gap in the export, not a scale that knows no level.
        const groups = [
            competenceValueGroup({
                id: '8a',
                type: 'group',
                name: '8a',
                subject: 'Physik',
                levels: romanLevels([1, 2, 3, 4, 5, 6]),
            }),
            competenceValueGroup({
                id: '8b',
                type: 'group',
                name: '8b',
                subject: 'Physik',
                levels: romanLevels([2, 2, 2, 2, 2, 2]),
            }),
        ];
        const withoutSchool = buildSummaryRows({
            queries: await summaryQueriesFor({ competenceLevels: groups }),
            index: buildCompetenceLevelIndex(groups),
            metric: getSummaryMetric('ge_medium'),
        });

        expect(withoutSchool.rows).toEqual([]);
        expect(withoutSchool.absences.map((absence) => absence.reason)).toEqual([
            ABSENCE_REASONS.NO_SCHOOL,
        ]);

        // The same groups with the school value group resolve: the scale was never the problem.
        const withSchool = [
            competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Physik',
                levels: romanLevels([3, 4, 5, 6, 7, 8]),
            }),
            ...groups,
        ];
        const resolved = buildSummaryRows({
            queries: await summaryQueriesFor({ competenceLevels: withSchool }),
            index: buildCompetenceLevelIndex(withSchool),
            metric: getSummaryMetric('ge_medium'),
        });
        expect(resolved.absences).toEqual([]);
        expect(resolved.rows).toHaveLength(1);
    });

    it('says the school value group is missing for the one Fach that lacks it', async () => {
        // A school value group for Physik says nothing about Chemie: without one there,
        // Chemie has no school value either, and the scale is not to blame.
        const valueGroups = [
            competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Testschule',
                subject: 'Physik',
                levels: romanLevels([3, 4, 5, 6, 7, 8]),
            }),
            ...['Physik', 'Chemie'].map((subject) =>
                competenceValueGroup({
                    id: `8a-${subject}`,
                    type: 'group',
                    name: '8a',
                    subject,
                    levels: romanLevels([1, 2, 3, 4, 5, 6]),
                }),
            ),
        ];
        const summary = buildSummaryRows({
            queries: await summaryQueriesFor({ competenceLevels: valueGroups }),
            index: buildCompetenceLevelIndex(valueGroups),
            metric: getSummaryMetric('ge_medium'),
        });

        expect(summary.rows.map((row) => row.subjectName)).toEqual(['Physik']);
        expect(summary.absences.map(({ subjectName, reason }) => [subjectName, reason])).toEqual([
            ['Chemie', ABSENCE_REASONS.NO_SCHOOL],
        ]);
    });

    it('names a glossary sentence for every absence reason and every metric', () => {
        // The card reads its sentence at `messages.<reason>`, or at the metric's
        // `unsupportedMessage`; a key the glossary lacks renders the missing-entry marker.
        /** @type {Record<string, string|undefined>} */
        const messages = slGlossaryFragments['sl.summary.deviation'].messages;
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

describe('entryVerdict — the metric direction', () => {
    it('flips good/bad for metrics where a lower value is better', () => {
        // On `le_low` a group above the school has more struggling students, so
        // an upward bar must be red. Colouring by raw sign would invert the message.
        /**
         * @param {number} deltaPP
         * @returns {{kind: string, deltaPP: number}} A group bar.
         */
        const groupBar = (deltaPP) => ({ kind: 'group', deltaPP });
        expect(entryVerdict(groupBar(5), true)).toBe('favourable');
        expect(entryVerdict(groupBar(-5), true)).toBe('unfavourable');

        expect(entryVerdict(groupBar(5), false)).toBe('unfavourable');
        expect(entryVerdict(groupBar(-5), false)).toBe('favourable');

        expect(getSummaryMetric('le_low').higherIsBetter).toBe(false);
        expect(getSummaryMetric('ge_medium').higherIsBetter).toBe(true);
        expect(getSummaryMetric('e_high').higherIsBetter).toBe(true);
        expect(getSummaryMetric('solution_rate').higherIsBetter).toBe(true);
    });
});

describe('entryVerdict', () => {
    it('inverts an average bar, because it shows the reference and not us', () => {
        // Both bars are +5 PP on "Regelstandard oder höher". A group 5 PP above the
        // school is good news; a Landesschnitt 5 PP above it means the school trails
        // the state — same geometry, opposite message, so not the same colour.
        const groupBar = { kind: 'group', deltaPP: 5 };
        const average = { kind: 'average', deltaPP: 5 };

        expect(entryVerdict(groupBar, true)).toBe('favourable');
        expect(entryVerdict(average, true)).toBe('unfavourable');

        expect(entryVerdict({ kind: 'average', deltaPP: -5 }, true)).toBe('favourable');
    });

    it('still respects a metric where a lower value is better', () => {
        // `le_low`: a Landesschnitt below the school means the state has fewer
        // struggling students — bad news for the school.
        expect(entryVerdict({ kind: 'average', deltaPP: -5 }, false)).toBe('unfavourable');
        expect(entryVerdict({ kind: 'average', deltaPP: 5 }, false)).toBe('favourable');
        expect(entryVerdict({ kind: 'group', deltaPP: 5 }, false)).toBe('unfavourable');
    });

    it('reads no difference, as the card prints it, as neither good nor bad news', () => {
        // A bar labelled "0,0 PP" read "günstig" as a group and "ungünstig" as an
        // average, the other way round on `le_low`; the verdict would carry a sign
        // the label does not show.
        for (const higherIsBetter of [true, false]) {
            for (const kind of ['group', 'average']) {
                for (const deltaPP of [0, -0, 0.04, -0.049]) {
                    expect(entryVerdict({ kind, deltaPP }, higherIsBetter)).toBe('neutral');
                }
            }
        }
        // The smallest difference the card prints keeps its verdict.
        expect(entryVerdict({ kind: 'group', deltaPP: 0.05 }, true)).toBe('favourable');
        expect(entryVerdict({ kind: 'group', deltaPP: -0.05 }, true)).toBe('unfavourable');
        expect(entryVerdict({ kind: 'average', deltaPP: 0.05 }, false)).toBe('favourable');
    });
});

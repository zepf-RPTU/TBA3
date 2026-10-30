import { describe, it, expect } from 'vitest';
import { ALL_DOMAINS } from '../../../../src/sl/utils/slQueryPrimitives.js';
import { STATE_ID } from '../../../support/slValueGroupFactories.js';
import { required } from '../../../support/required.js';
import {
    buildCompetenceValueGroups,
    buildDashboardHelper,
    helperFor,
} from '../../../support/slInfoBoxFixture.js';
import * as stateComparison from '../../../../src/sl/modules/infoBox/infoBoxStateComparison.js';

/**
 * The three verbs that compare a school to its Landesschnitt.
 *
 * These decide the praise/alarm sentences of the SL info boxes — which Fächer are named
 * a strength, which Lerngruppen a concern. They compare competence-level shares, never a
 * Lösungsquote difference: that would subtract two pooled item aggregates with no item-id
 * matching, a school's booklet pool against the state's.
 *
 * Every case below turns on a distinction a plausible reimplementation would collapse —
 * pooled vs. per-domain comparison, strictly-greater vs. at-least, absent vs. zero.
 */

describe('listSubjectsByStateComparison — which Fächer beat the Landesschnitt', () => {
    it('names a Fach both a strength and a weakness when its domains disagree', async () => {
        // `anyDomain` asks "is ANY Domäne of this Fach above the Landesschnitt".
        // Deutsch is below it in Lesen and above it in Zuhören, so it belongs in the
        // praise list and the alarm list. Making the lists mutually exclusive by comparing
        // one pooled number per Fach is the question `aggregation: 'subject'` answers below.
        const query = await buildDashboardHelper();

        expect(
            stateComparison.listSubjectsByStateComparison(query, {
                target: 'school',
                levelAlias: 'ge_medium',
                comparison: 'gt',
                aggregation: 'anyDomain',
            }),
        ).toEqual(['Deutsch', 'Englisch']);
        expect(
            stateComparison.listSubjectsByStateComparison(query, {
                target: 'school',
                levelAlias: 'ge_medium',
                comparison: 'lt',
                aggregation: 'anyDomain',
            }),
        ).toEqual(['Deutsch', 'Mathematik']);
    });

    it('drops that same Fach from both lists once its domains are pooled', async () => {
        // Only the aggregation differs from the case above. Pooled over both Domänen,
        // Deutsch is 0.44 against a Landesschnitt of 0.44: neither above nor below, so it
        // belongs in neither list. `gt` is strictly greater, and an exact tie must not be
        // rounded into a strength. A change that makes these two cases agree has answered
        // one question with the other's method.
        const query = await buildDashboardHelper();

        expect(
            stateComparison.listSubjectsByStateComparison(query, {
                target: 'school',
                levelAlias: 'ge_medium',
                comparison: 'gt',
                aggregation: 'subject',
            }),
        ).toEqual(['Englisch']);
        expect(
            stateComparison.listSubjectsByStateComparison(query, {
                target: 'school',
                levelAlias: 'ge_medium',
                comparison: 'lt',
                aggregation: 'subject',
            }),
        ).toEqual(['Mathematik']);
    });

    it('returns nothing for the Landesschnitt itself', async () => {
        // No box asks whether the Landesschnitt is above itself; an empty list keeps
        // a mis-targeted placeholder silent instead of printing "0 Fächer liegen über dem
        // Landesschnitt".
        expect(
            stateComparison.listSubjectsByStateComparison(await buildDashboardHelper(), {
                target: { type: 'comparison', id: STATE_ID },
                levelAlias: 'ge_medium',
                comparison: 'gt',
                aggregation: 'anyDomain',
            }),
        ).toEqual([]);
    });

    it('returns nothing when the loaded scales tag no level the alias asked for', async () => {
        // An empty level list is what a placeholder hands over when its `levelAlias`
        // resolved to nothing — an export whose scale names no KMK standard, or a band no
        // loaded ladder tags. Comparing "no levels" against the Landesschnitt would make
        // every Fach 0 % on both sides, an exact tie, and the box would report that the
        // school matches the state everywhere.
        expect(
            stateComparison.listSubjectsByStateComparison(await buildDashboardHelper(), {
                target: 'school',
                levelAlias: '',
                comparison: 'lt',
                aggregation: 'anyDomain',
            }),
        ).toEqual([]);
    });
});

describe('listGroupsByStateComparison — which Lerngruppen beat the Landesschnitt', () => {
    it('lists a Lerngruppe as above when any of its Fächer is, not only when all are', async () => {
        // Same "any selection qualifies" rule as the Fach list, and the same
        // consequence — 8a and 8b are each above the Landesschnitt somewhere and below
        // it somewhere else, so both belong in both lists.
        //
        // 8c keeps the two lists from being each other's complement: it sits only
        // Mathematik, where it is above, so it is in the "above" list and absent from the
        // "below" one. Deriving one list by negating the other would call 8c a concern.
        const query = await buildDashboardHelper();

        expect(
            stateComparison.listGroupsByStateComparison(query, {
                target: 'school',
                levelAlias: 'ge_medium',
                comparison: 'gt',
            }),
        ).toEqual(['8a', '8b', '8c']);
        expect(
            stateComparison.listGroupsByStateComparison(query, {
                target: 'school',
                levelAlias: 'ge_medium',
                comparison: 'lt',
            }),
        ).toEqual(['8a', '8b']);
    });

    it('omits a Lerngruppe that never sat the Fach instead of scoring it zero', async () => {
        // 8c has no Englisch value groups, and a Lerngruppe that did not sit Englisch
        // is not one performing badly at it. A verb that turns "no value groups" into 0
        // names the wrong Lerngruppe and nothing looks broken.
        const query = await buildDashboardHelper();
        const above = stateComparison.listGroupsByStateComparison(query, {
            target: 'school',
            levelAlias: 'ge_medium',
            comparison: 'gt',
            subjectName: 'Englisch',
        });
        const below = stateComparison.listGroupsByStateComparison(query, {
            target: 'school',
            levelAlias: 'ge_medium',
            comparison: 'lt',
            subjectName: 'Englisch',
        });

        expect(above).not.toContain('8c');
        expect(below).not.toContain('8c');
        // Both Lerngruppen that did sit Englisch are above the Landesschnitt there, so the
        // "below" list is legitimately empty rather than a fallback.
        expect(above).toEqual(['8a', '8b']);
        expect(below).toEqual([]);
    });

    it('never offers the Landesschnitt as one of the Lerngruppen', async () => {
        // The candidate Lerngruppen come from the competence-level index's `groups`,
        // which discriminate on `type` (`isExternalPopulation`). An id/name test instead would
        // count the comparison value groups as "Lerngruppen" and rank the Landesschnitt against the
        // groups it is the reference for.
        //
        // The fixture's second comparison population is typed `district`, its id is
        // `bezirk` and its name is not the bare "Landesschnitt", so any id-, name- or
        // `type === 'state'`-shaped discriminator lets "Bezirksschnitt" through as a
        // Lerngruppe.
        const query = await buildDashboardHelper();
        const groupNames = [
            ...required(
                stateComparison.listGroupsByStateComparison(query, {
                    target: 'school',
                    levelAlias: 'ge_medium',
                    comparison: 'gt',
                }),
            ),
            ...required(
                stateComparison.listGroupsByStateComparison(query, {
                    target: 'school',
                    levelAlias: 'ge_medium',
                    comparison: 'lt',
                }),
            ),
        ];

        expect(new Set(groupNames)).toEqual(new Set(['8a', '8b', '8c']));
    });
});

describe('selectSubjectByStateShareDiff — the Fach furthest from the Landesschnitt', () => {
    it('ranks on distance, so the furthest Fach can be the one above', async () => {
        // The verb reports `absoluteDifference`, and the box that uses it asks
        // "which Fach deviates most", not "which is worst". Englisch is +0.30 and
        // Mathematik -0.0615; ranking on the signed difference would name Mathematik
        // the largest deviation only by being the most negative, which is a different
        // claim than the German sentence makes.
        const selection = stateComparison.selectSubjectByStateShareDiff(
            await buildDashboardHelper(),
            {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'max',
            },
        );

        expect(selection?.subjectName).toBe('Englisch');
        expect(selection?.difference).toBeGreaterThan(0);
        expect(selection?.absoluteDifference).toBeCloseTo(0.3, 10);
    });

    it('names the Fach level with the Landesschnitt as the smallest deviation', async () => {
        // Deutsch pools to exactly the Landesschnitt, so its deviation is 0 — the
        // smallest possible. A `min` that skipped zero (treating it as "no result")
        // would name Mathematik instead and tell the reader the school's closest match
        // to the Landesschnitt is the Fach it trails by 6 points.
        const selection = stateComparison.selectSubjectByStateShareDiff(
            await buildDashboardHelper(),
            {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'min',
            },
        );

        expect(selection?.subjectName).toBe('Deutsch');
        expect(selection?.absoluteDifference).toBe(0);
        expect(selection?.share).toBeCloseTo(Number(selection?.stateShare ?? NaN), 10);
    });

    it('compares pooled Fach shares, not the school value group the per-domain verbs read', async () => {
        // This verb aggregates with `aggregation: 'subject'`, which resolves the
        // school by summing its *Lerngruppen* value groups — while `getCompetenceLevelShare({target:
        // 'school'})` reads the value groups carrying the school's own id. The
        // fixture sizes the Deutsch cohorts unequally so the two differ: summed over its
        // Lerngruppen Deutsch is exactly 0.44, level with the Landesschnitt; the school's
        // own Lesen value group reads 0.50.
        const query = await buildDashboardHelper();

        expect(
            stateComparison.selectSubjectByStateShareDiff(query, {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'min',
            })?.share,
        ).toBeCloseTo(0.44, 10);
        expect(
            (await buildDashboardHelper()).getSubjectCompetenceShare({
                domainId: ALL_DOMAINS,
                target: 'school',
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
            }),
        ).toBeCloseTo(0.44, 10);
        expect(
            (await buildDashboardHelper()).getCompetenceLevelShare({
                target: 'school',
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.5, 10);
    });

    it('compares with the one Landesschnitt, never with another population', async () => {
        // The fixture's `bezirk` value group is a comparison population of its own, at 95 %
        // in Deutsch: Lesen. Pooled into the benchmark it would lift 64/120 towards it.
        expect(
            (await buildDashboardHelper()).getCompetenceLevelShare({
                target: (await buildDashboardHelper()).getSoleStateTarget(),
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(64 / 120, 10);
    });

    it('says nothing when the payload splits its Landesschnitt into several tracks', async () => {
        // A state export may send one state value group per Abschlusstrack the school
        // has sittings in. There is then no single "Landesschnitt" to be above or below,
        // and pooling the tracks yields a benchmark no chart shows — a list of "keinem
        // Fach" would state a comparison that was never made.
        const valueGroups = buildCompetenceValueGroups();
        valueGroups.push({
            ...required(valueGroups.find((valueGroup) => valueGroup.type === 'state')),
            id: 'nw-gy',
            name: 'Landesschnitt GY',
        });
        const queries = await helperFor({ competenceLevels: valueGroups });

        expect(queries.getSoleStateTarget()).toBeNull();
        expect(
            stateComparison.listSubjectsByStateComparison(queries, {
                target: 'school',
                levelAlias: 'ge_medium',
                comparison: 'gt',
                aggregation: 'anyDomain',
            }),
        ).toBeNull();
        expect(
            stateComparison.selectSubjectByStateShareDiff(queries, {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'max',
            }),
        ).toBeNull();
    });
});

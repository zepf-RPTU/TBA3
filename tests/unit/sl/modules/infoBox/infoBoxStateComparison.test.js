import { describe, it, expect, beforeEach } from 'vitest';
import { resetCompetenceLevelPalette } from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    AT_OR_ABOVE_REGULAR,
    buildDashboardHelper,
    selectionsFor,
    stateComparisonFor,
} from '../../../support/slInfoBoxFixture.js';

/** The Landesschnitt verbs over the shared dashboard fixture. */
function helper() {
    return stateComparisonFor(buildDashboardHelper());
}

/**
 * The three verbs that compare a school to its Landesschnitt.
 *
 * These decide the praise/alarm sentences in six of the eleven SL info boxes — which
 * Fächer are named a strength, which Klassen a concern. They compare **competence-level
 * shares**: the Lösungsquote version they replaced subtracted two pooled item aggregates
 * with no item-id matching, a school's booklet pool against the state's, which is the
 * single worst case of the pooling problem because it crosses schools rather than only
 * classes.
 *
 * Every case below turns on a distinction that a plausible-looking reimplementation
 * would collapse — pooled vs. per-domain comparison, strictly-greater vs. at-least,
 * absent vs. zero. None of them is arithmetic for its own sake.
 */

beforeEach(() => {
    // The scale registry and the once-per-scale unranked warning are module-level
    // state; a scale left over from another case would let a query resolve against
    // levels the fixture under test never shipped.
    resetCompetenceLevelPalette();
});

describe('listSubjectsByStateComparison — which Fächer beat the Landesschnitt', () => {
    it('names a Fach both a strength and a weakness when its domains disagree', () => {
        // WHY: `anyDomain` asks "is ANY Domäne of this Fach above the Landesschnitt".
        // Deutsch is below it in Lesen and above it in Zuhören, so it truthfully answers
        // yes to both questions. A reader sees Deutsch in the praise list *and* the alarm
        // list, and that is correct — the Fach is not uniformly anything.
        //
        // The tempting "simplification" is to make the lists mutually exclusive by
        // comparing one pooled number per Fach. That is a different question, and it
        // is the one `aggregation: 'subject'` already answers below.
        const query = helper();

        expect(
            query.listSubjectsByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'gt',
            }),
        ).toEqual(['Deutsch', 'Englisch']);
        expect(
            query.listSubjectsByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'lt',
            }),
        ).toEqual(['Deutsch', 'Mathematik']);
    });

    it('drops that same Fach from both lists once its domains are pooled', () => {
        // WHY: this is the same school, the same rows and the same threshold — only
        // the aggregation differs. Pooled over both Domänen, Deutsch is 0.44 against a
        // Landesschnitt of 0.44: neither above nor below, so it belongs in neither
        // list. `gt` is strictly greater, and an exact tie must not be rounded into a
        // strength.
        //
        // Deutsch appearing in both lists under one aggregation and in neither under
        // the other is the whole reason both exist. A change that makes these two
        // cases agree has silently answered one question with the other's method.
        const query = helper();

        expect(
            query.listSubjectsByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'gt',
                aggregation: 'subject',
            }),
        ).toEqual(['Englisch']);
        expect(
            query.listSubjectsByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'lt',
                aggregation: 'subject',
            }),
        ).toEqual(['Mathematik']);
    });

    it('sorts by name so the sentence reads the same on every reload', () => {
        // WHY: the result is interpolated straight into German prose. Row order in the
        // payload is not a promise the server makes, so an unsorted list would reorder
        // a sentence between two loads of the same data and make the box look unstable
        // to a Schulleitung reading it twice.
        const query = helper();
        const strengths = query.listSubjectsByStateComparison({
            target: 'school',
            levelNames: AT_OR_ABOVE_REGULAR,
            comparison: 'gt',
        });

        expect(strengths).toEqual([...strengths].sort((a, b) => a.localeCompare(b)));
    });

    it('returns nothing for the Landesschnitt itself', () => {
        // WHY: "is the Landesschnitt above the Landesschnitt" is not a question any box
        // asks, and answering it with an empty list rather than a self-comparison of 0
        // keeps a mis-targeted placeholder silent instead of printing a confident
        // "0 Fächer liegen über dem Landesschnitt".
        expect(
            helper().listSubjectsByStateComparison({
                target: 'state',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'gt',
            }),
        ).toEqual([]);
    });

    it('returns nothing when the loaded scales rank no level the alias asked for', () => {
        // WHY: an empty level list is what a placeholder hands over when its `levelAlias`
        // resolved to nothing — an export whose scale names no KMK standard, or a rank no
        // loaded ladder has. Comparing "no levels" against the Landesschnitt would make
        // every Fach 0 % on both sides, an exact tie, and the box would quietly report
        // that the school matches the state everywhere.
        expect(
            helper().listSubjectsByStateComparison({
                target: 'school',
                levelNames: [],
                comparison: 'lt',
            }),
        ).toEqual([]);
    });
});

describe('listClassesByStateComparison — which Klassen beat the Landesschnitt', () => {
    it('lists a Klasse as above when any of its Fächer is, not only when all are', () => {
        // WHY: same "any selection qualifies" rule as the Fach list, and the same
        // consequence — 8a and 8b are each above the Landesschnitt somewhere and below
        // it somewhere else, so both belong in both lists.
        //
        // 8c is the case that keeps the two lists from being each other's complement:
        // it sits only Mathematik, where it is above, so it appears in the "above" list
        // and is simply absent from the "below" one. Deriving one list by negating the
        // other would wrongly call 8c a concern.
        const query = helper();

        expect(
            query.listClassesByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'gt',
            }),
        ).toEqual(['8a', '8b', '8c']);
        expect(
            query.listClassesByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'lt',
            }),
        ).toEqual(['8a', '8b']);
    });

    it('omits a Klasse that never sat the Fach instead of scoring it zero', () => {
        // WHY: 8c has no Englisch rows at all. An unmatched join yields no rows, and
        // the only honest answer is to leave 8c out of both lists — a Klasse that did
        // not sit Englisch is not a Klasse performing badly at Englisch.
        //
        // The failure mode: a missing measurement is invisible, so a verb that turns "no rows" into 0 names
        // the wrong Klasse and nothing looks broken.
        const query = helper();
        const above = query.listClassesByStateComparison({
            target: 'school',
            levelNames: AT_OR_ABOVE_REGULAR,
            comparison: 'gt',
            subjectName: 'Englisch',
            domainId: 'ho',
        });
        const below = query.listClassesByStateComparison({
            target: 'school',
            levelNames: AT_OR_ABOVE_REGULAR,
            comparison: 'lt',
            subjectName: 'Englisch',
            domainId: 'ho',
        });

        expect(above).not.toContain('8c');
        expect(below).not.toContain('8c');
        // Both Klassen that did sit Englisch are above the Landesschnitt there, so the
        // "below" list is legitimately empty rather than a fallback.
        expect(above).toEqual(['8a', '8b']);
        expect(below).toEqual([]);
    });

    it('never offers the Landesschnitt as one of the Klassen', () => {
        // WHY: the candidate Klassen come from the competence-level index's classRows,
        // which discriminate on `type === 'state'`. When that discriminator was an
        // id/name test instead, a five-Klasse school reported 13 "Klassen" and the
        // Landesschnitt was ranked against the classes it is the reference for.
        //
        // The fixture's second Landesschnitt track is what makes this bite: it is
        // typed `state` but its id is `nw-gy` and its name is not the bare
        // "Landesschnitt", so any id- or name-shaped discriminator lets it through and
        // "nw-gy" shows up here as a Klasse.
        const query = helper();
        const classNames = [
            ...query.listClassesByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'gt',
            }),
            ...query.listClassesByStateComparison({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                comparison: 'lt',
            }),
        ];

        expect(classNames).not.toContain('Landesschnitt');
        expect(new Set(classNames)).toEqual(new Set(['8a', '8b', '8c']));

        // A share superlative reads the class rows directly, with nothing else to filter
        // it — that is where a leak actually surfaces, and the fixture's second track is
        // sized (95 %) to win it outright if it ever does.
        const bestInDeutsch = selectionsFor(
            buildDashboardHelper(),
        ).getSubjectCompetenceShareClassRange({
            levelNames: ['III', 'IV', 'V'],
            subjectName: 'Deutsch',
        });

        expect(bestInDeutsch?.maxSelection?.className).toBe('8a');
        expect(bestInDeutsch?.maxShare).toBeCloseTo(14 / 30, 10);
    });
});

describe('selectSubjectByStateShareDiff — the Fach furthest from the Landesschnitt', () => {
    it('ranks on distance, so the furthest Fach can be the one above', () => {
        // WHY: the verb reports `absoluteDifference`, and the box that uses it asks
        // "which Fach deviates most", not "which is worst". Englisch is +0.30 and
        // Mathematik -0.0615; ranking on the signed difference would name Mathematik
        // the largest deviation only by being the most negative, which is a different
        // claim than the German sentence makes.
        const selection = helper().selectSubjectByStateShareDiff({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(selection?.subjectName).toBe('Englisch');
        expect(selection?.difference).toBeGreaterThan(0);
        expect(selection?.absoluteDifference).toBeCloseTo(0.3, 10);
    });

    it('names the Fach level with the Landesschnitt as the smallest deviation', () => {
        // WHY: Deutsch pools to exactly the Landesschnitt, so its deviation is 0 — the
        // smallest possible. A `min` that skipped zero (treating it as "no result")
        // would name Mathematik instead and tell the reader the school's closest match
        // to the Landesschnitt is the Fach it trails by 6 points.
        const selection = helper().selectSubjectByStateShareDiff({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'min',
        });

        expect(selection?.subjectName).toBe('Deutsch');
        expect(selection?.absoluteDifference).toBe(0);
        expect(selection?.share).toBeCloseTo(selection?.stateShare ?? NaN, 10);
    });

    it('compares pooled Fach shares, not the school row the per-domain verbs read', () => {
        // WHY: this verb aggregates with `aggregation: 'subject'`, which resolves the
        // school by summing its *Klassen* rows — while `getCompetenceLevelShare({target:
        // 'school'})` reads the rows carrying the school's own id. The two are
        // different row sets by construction
        // (#getRowsForSubjectAggregateCompetenceTarget vs #getRowsForCompetenceTarget),
        // and the fixture sizes the Deutsch cohorts unequally so this test pins which
        // one is used rather than an accident of the data.
        //
        // Deutsch is the witness. Summed over its Klassen it is exactly 0.44, level with
        // the Landesschnitt; the school's own Lesen row reads 0.50. A rewrite reaching
        // for the school-id rows would report Deutsch as deviating.
        const query = helper();

        expect(
            query.selectSubjectByStateShareDiff({ levelNames: AT_OR_ABOVE_REGULAR, mode: 'min' })
                ?.share,
        ).toBeCloseTo(0.44, 10);
        expect(
            buildDashboardHelper().getSubjectCompetenceShare({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
            }),
        ).toBeCloseTo(0.44, 10);
        expect(
            buildDashboardHelper().getCompetenceLevelShare({
                target: 'school',
                levelNames: AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.5, 10);
    });

    it('pools every Landesschnitt track the payload carries into one benchmark', () => {
        // WHY: NRW sends a school one state row per Abschlusstrack it has sittings in, so
        // "the Landesschnitt" can be several rows. `#filterStateRows` returns all of them
        // and the share sums them, which is what the Lösungsquote version did too — this
        // pins that reading rather than endorsing it.
        //
        // Deutsch: Lesen is the witness. The Gesamt row alone is 45/100 = 0.45, which the
        // school's 0.50 beats; pooled with the `nw-gy` track (19/20) it is 64/120 ≈ 0.5333
        // and the school falls below it. Which one is printed as a strength therefore
        // depends entirely on this decision.
        expect(
            buildDashboardHelper().getCompetenceLevelShare({
                target: 'state',
                levelNames: AT_OR_ABOVE_REGULAR,
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(64 / 120, 10);
    });
});

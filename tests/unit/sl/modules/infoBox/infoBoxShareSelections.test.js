import { describe, it, expect, beforeEach } from 'vitest';
import { resetCompetenceLevelPalette } from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    AT_OR_ABOVE_REGULAR,
    ROMAN_AT_OR_ABOVE_REGULAR,
    buildDashboardHelper,
    competenceRow,
    helperFor,
    romanLevels,
    selectionsFor,
} from '../../../support/slInfoBoxFixture.js';

/** The superlative verbs over the shared dashboard fixture. */
function helper() {
    return selectionsFor(buildDashboardHelper());
}

/**
 * The verbs that pick one Klasse or one Fach out of the school and name it.
 *
 * All of them now rank on a competence-level share. The Lösungsquoten twins they replaced
 * ranked on an unweighted item aggregate over whichever booklet a row happened to sit, so
 * two Klassen were never on one scale. Each answers
 * a superlative question ("die stärkste Klasse", "der größte Unterschied"), so a wrong
 * answer here is a wrong *name* in German prose, not a wrong pixel, and nothing else in
 * the suite would catch it.
 *
 * The shared fixture documents the numbers; each case below states the rule the
 * numbers were chosen to expose.
 */

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe('selectClassBySubjectShare — naming the best and worst Klasse', () => {
    it('names the strongest Klasse in a Fach', () => {
        // WHY: this is the one verb in the migration that changes a user-visible
        // *identity* rather than a number — overviewSubjectSpecific praise/alarm names
        // this Klasse to the Schulleitung. 8c is at 0.70 in Mathematik against 0.50 and
        // 0.40, and Mathematik is the only Fach it sat.
        const selection = helper().selectClassBySubjectShare({
            levelNames: AT_OR_ABOVE_REGULAR,
            subjectName: 'Mathematik',
            mode: 'max',
        });

        expect(selection?.className).toBe('8c');
        expect(selection?.share).toBeCloseTo(0.7, 10);
    });

    it('breaks a tie by name rather than by payload order', () => {
        // WHY: 8a and 8b are both at exactly 0.40 in Deutsch: Zuhören — and on different
        // cohort sizes (20 against 10), so the tie is in the *share* rather than an
        // artefact of equal counts. Something has to be named, and the choice must not
        // depend on which row the server happened to send first: a Schulleitung reloading
        // the page would see the alarm box blame a different Klasse. Ascending
        // `localeCompare` makes 8a the stable answer.
        const selection = helper().selectClassBySubjectShare({
            levelNames: AT_OR_ABOVE_REGULAR,
            subjectName: 'Deutsch',
            domainId: 'zh',
            mode: 'min',
        });

        expect(selection?.className).toBe('8a');
        expect(selection?.share).toBeCloseTo(0.4, 10);
    });

    it('returns null for a Fach no Klasse sat, rather than naming one anyway', () => {
        // WHY: a superlative over an empty set has no answer. Returning a Klasse here
        // would print "die schwächste Klasse in Physik ist 8a" for a Fach that does not
        // exist at this school; returning null lets the block be skipped.
        expect(
            helper().selectClassBySubjectShare({
                levelNames: AT_OR_ABOVE_REGULAR,
                subjectName: 'Physik',
                mode: 'max',
            }),
        ).toBeNull();
    });
});

describe('selectSubjectByShareClassRange — the Fach whose Klassen differ most', () => {
    it('ranks Fächer by the spread between their Klassen and names both ends', () => {
        // WHY: the sentence claims a *Unterschied innerhalb* eines Fachs, so the verb has
        // to report which Klassen sit at each end — the box prints the range beside the
        // Fach. Englisch spans 0.40–0.80; Mathematik has three Klassen and spans only
        // 0.30 despite containing the school's joint-lowest result, so neither the number
        // of Klassen nor the depth of the worst one decides it.
        const selection = helper().selectSubjectByShareClassRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(selection?.subjectName).toBe('Englisch');
        expect(selection?.shareRange).toBeCloseTo(0.4, 10);
        expect(selection?.minSelection?.className).toBe('8b');
        expect(selection?.maxSelection?.className).toBe('8a');
    });

    it('names the most even Fach under min', () => {
        // WHY: `min` is what the "am gleichmäßigsten" sentence reads, and it must be the
        // same measure inverted — the smallest spread, not the lowest shares. Deutsch at
        // 0.0667 is the tightest Fach even though its 8b (0.40) ties the school's lowest
        // Klassen-Ergebnis.
        const selection = helper().selectSubjectByShareClassRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'min',
        });

        expect(selection?.subjectName).toBe('Deutsch');
        expect(selection?.shareRange).toBeCloseTo(1 / 15, 10);
    });

    it('cannot see a Fach whose ladder the level names do not cover', () => {
        // WHY: the `covered` gate reaching a superlative, and the single biggest risk in
        // the move away from Lösungsquoten — a rate can always be computed, a share
        // cannot. Asked with Roman levels only, Englisch (GER) is invisible rather than
        // zero-spread, and the school's widest Fach reads Mathematik at 0.30 instead of
        // Englisch at 0.40.
        //
        // So a box naming "der größte Unterschied" must resolve its levels by KMK rank
        // across every loaded ladder, not by band name. This test is what would fail if a
        // future change hard-coded one ladder.
        const query = helper();

        expect(
            query.selectSubjectByShareClassRange({
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                mode: 'max',
            })?.subjectName,
        ).toBe('Mathematik');
        expect(
            query.selectSubjectByShareClassRange({ levelNames: AT_OR_ABOVE_REGULAR, mode: 'max' })
                ?.subjectName,
        ).toBe('Englisch');
    });
});

describe('selectSubjectDomainByShareClassRange — the same question, per Domäne', () => {
    it('finds a flat Domäne the Fach-level verb reports as uneven', () => {
        // WHY: these two verbs exist separately for exactly this reason. Pooled over both
        // Domänen, Deutsch's Klassen differ by 0.0667 and the Fach-level verb calls it the
        // school's most even Fach. Split out, Deutsch: Zuhören is *perfectly* flat — both
        // Klassen at 0.40, a spread of exactly 0 — and the whole of Deutsch's unevenness
        // sits in Lesen.
        //
        // A "simplification" that answered the Domäne question by pooling would report the
        // school's most even measurement as 0.0667 and never name the Domäne that is
        // actually flat.
        const query = helper();
        const byDomain = query.selectSubjectDomainByShareClassRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'min',
        });
        const bySubject = query.selectSubjectByShareClassRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'min',
        });

        expect(byDomain?.subjectName).toBe('Deutsch');
        expect(byDomain?.domainId).toBe('zh');
        expect(byDomain?.shareRange).toBe(0);
        expect(bySubject?.shareRange ?? 0).toBeGreaterThan(byDomain?.shareRange ?? 0);
    });

    it('carries the Domäne display name, so the sentence can print it', () => {
        // WHY: the box prints "Englisch (Hörverstehen)", so the selection has to identify
        // the Domäne *and* be able to label it. Reading the aggregates is what makes that
        // possible: the Lösungsquoten twin this replaced enumerated item rows, which carry
        // the Domäne id in `domain.name` with no id at all, so its `domainName` was always
        // null and the caller had to resolve the label against the aggregates anyway.
        const selection = helper().selectSubjectDomainByShareClassRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(selection?.subjectName).toBe('Englisch');
        expect(selection?.domainId).toBe('ho');
        expect(selection?.domainName).toBe('Hörverstehen');
    });

    it('lets a Fach with no Domänen compete on equal terms', () => {
        // WHY: Mathematik carries a single `domain: null` row, and it must still be one of
        // the candidates rather than being skipped for having nothing to split. Asked with
        // Roman levels only — which drops the GER-scaled Englisch — it wins outright.
        const selection = helper().selectSubjectDomainByShareClassRange({
            levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(selection?.subjectName).toBe('Mathematik');
        expect(selection?.domainId).toBeNull();
        expect(selection?.shareRange).toBeCloseTo(0.3, 10);
    });
});

describe('getCompetenceLevelShareRange — the school best and worst', () => {
    it('silently skips the selections its level names cannot express', () => {
        // WHY: the consequence of the `covered` gate at range scope, and it is easy to
        // miss. Asking for Roman levels only, the school's best result is Deutsch/Lesen
        // at 0.50 — Englisch/Hörverstehen at 0.60 is not weighed and lost, it is simply
        // invisible to the question. Ask with both ladders and Englisch wins.
        //
        // So a box printing "das beste Ergebnis" must resolve its levels by KMK rank
        // across both ladders, not by band name. This test is what would fail if a
        // future change hard-coded one ladder.
        //
        // Mathematik ties Deutsch/Lesen at 0.50, so which Fach is *named* under the
        // Roman-only ask is settled by the ascending-name tie-break, not by the data —
        // the same rule the selectors above pin explicitly.
        const query = helper();

        const romanOnly = query.getCompetenceLevelShareRange({
            target: 'school',
            levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
        });
        expect(romanOnly?.maxShare).toBeCloseTo(0.5, 10);
        expect(romanOnly?.maxSelection?.subjectName).toBe('Deutsch');

        const bothLadders = query.getCompetenceLevelShareRange({
            target: 'school',
            levelNames: AT_OR_ABOVE_REGULAR,
        });
        expect(bothLadders?.maxShare).toBeCloseTo(0.6, 10);
        expect(bothLadders?.maxSelection?.subjectName).toBe('Englisch');

        // The weakest selection is on the Roman ladder either way, so only the top of
        // the range moves — the omission is one-sided and correspondingly easy to miss.
        expect(romanOnly?.minShare).toBeCloseTo(0.4, 10);
        expect(bothLadders?.minShare).toBeCloseTo(0.4, 10);
    });
});

describe('getSubjectCompetenceShareClassRange — the Klassen spread within one Fach', () => {
    it('spans only the Klassen that sat the Fach', () => {
        // WHY: Deutsch has two Klassen (0.40–0.4667) and Mathematik three (0.40–0.70).
        // 8c must widen Mathematik's range and must not appear in Deutsch's at all —
        // if an absent Klasse counted as 0, every Fach 8c skipped would report a
        // spread reaching down to zero and read as a school in crisis.
        const query = helper();

        const deutsch = query.getSubjectCompetenceShareClassRange({
            levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
            subjectName: 'Deutsch',
        });
        expect(deutsch?.minShare).toBeCloseTo(0.4, 10);
        expect(deutsch?.maxShare).toBeCloseTo(14 / 30, 10);
        expect(deutsch?.minSelection?.className).toBe('8b');
        expect(deutsch?.maxSelection?.className).toBe('8a');

        const mathematik = query.getSubjectCompetenceShareClassRange({
            levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
            subjectName: 'Mathematik',
        });
        expect(mathematik?.maxSelection?.className).toBe('8c');
        expect(mathematik?.maxShare).toBeCloseTo(0.7, 10);
    });
});

describe('selectClassBySubjectShareRange — the Klasse whose results vary most', () => {
    it('names the Klasse with the widest spread across its own Fächer', () => {
        // WHY: 8a runs 0.40 (Deutsch/Zuhören) to 0.80 (Englisch), a spread of 0.40. 8b
        // is flat at 0.40 everywhere. The claim is about *internal* variation, so the
        // Klasse with the highest single result and the Klasse that varies most need
        // not be the same — here they are both 8a only because the fixture makes 8a's
        // best the school's best; what the assertion pins is the spread.
        const selection = helper().selectClassBySubjectShareRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(selection?.className).toBe('8a');
        expect(selection?.shareRange).toBeCloseTo(0.4, 10);
        expect(selection?.minSelection?.subjectName).toBe('Deutsch');
        expect(selection?.maxSelection?.subjectName).toBe('Englisch');
    });

    it('breaks a tie at zero spread by name', () => {
        // WHY: 8b is flat at 0.40 across four selections and 8c has a single selection,
        // so both span exactly 0. Two Klassen are equally "even" for different reasons
        // and the tie-break must still be deterministic; 8b sorts first.
        const selection = helper().selectClassBySubjectShareRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'min',
        });

        expect(selection?.className).toBe('8b');
        expect(selection?.shareRange).toBe(0);
    });

    it('understates a Klasse spread when the level names cover only one ladder', () => {
        // WHY: the `covered` gate reaching a superlative. Asked with Roman levels only,
        // 8a's Englisch result is invisible and its spread reads 0.20 instead of 0.40 —
        // the verb still names 8a, but the number printed beside the name is half the
        // real one. The identity surviving while the magnitude changes is exactly the
        // kind of half-right answer that reads as fine.
        const query = helper();
        const romanOnly = query.selectClassBySubjectShareRange({
            levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });
        const bothLadders = query.selectClassBySubjectShareRange({
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(romanOnly?.className).toBe('8a');
        expect(romanOnly?.shareRange).toBeCloseTo(0.2, 10);
        expect(bothLadders?.shareRange).toBeCloseTo(0.4, 10);
    });

    it('returns null when no level name is given, rather than treating it as "any"', () => {
        // WHY: an empty level list is a caller bug — a placeholder whose levelAlias did
        // not resolve. Treating it as "all levels" would make every share 100 % and
        // every spread 0, and the box would confidently report a perfectly even school.
        //
        // Two guards enforce this, and the outer one is redundant: the verb's own
        // `normalizedLevelNames.length === 0` check returns early, but removing it
        // still yields null, because no level matches and `#getRatioForRows` reports an
        // unexpressible share as unknown. The behaviour is what callers depend on, so
        // it is pinned here regardless of which guard happens to deliver it.
        expect(helper().selectClassBySubjectShareRange({ levelNames: [], mode: 'max' })).toBeNull();
        expect(
            buildDashboardHelper().getCompetenceLevelShare({
                target: '8a',
                levelNames: [],
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeNull();
    });
});

describe('selectClassByMeanShare — the Klasse that is strongest overall', () => {
    it('averages the Fächer a Klasse sat, rather than weighting them by cohort', () => {
        // WHY: "insgesamt am stärksten" has two defensible readings and they disagree here.
        // 8a's four selections average 0.575, while the same numbers summed over students
        // — 25 of 46, because its Zuhören cohort is twice its others — read 0.543. The verb
        // is specified as the unweighted mean of the shares, so this pins which of the two
        // the box states; a switch to weighting would leave the *name* unchanged and only
        // move the number, which is exactly the kind of half-right answer that reads fine.
        expect(
            helper().selectClassByMeanShare({
                target: '8a',
                levelNames: AT_OR_ABOVE_REGULAR,
                mode: 'max',
            })?.meanShare,
        ).toBeCloseTo(0.575, 10);
    });

    it('lets a Klasse that sat one Fach win on that Fach alone', () => {
        // WHY: the consequence of averaging over what a Klasse actually sat. 8c sits only
        // Mathematik, at 0.70, and so is named the school's strongest Klasse over 8a's
        // 0.575 across four selections — even though 8a holds the school's best single
        // result (0.80 in Englisch). That is intended: absent is not zero, and a Klasse is
        // not penalised for the Fächer it did not sit. Anyone reading the sentence has to
        // know that, so it is pinned rather than left incidental.
        const selection = helper().selectClassByMeanShare({
            target: 'school',
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(selection?.className).toBe('8c');
        expect(selection?.meanShare).toBeCloseTo(0.7, 10);
    });

    it('names the flat Klasse under min', () => {
        // WHY: `min` reads the alarm sentence, and must be the same measure inverted. 8b is
        // at 0.40 in all four selections, so its mean is 0.40 whichever way it is computed
        // — the one Klasse whose answer cannot depend on the aggregation.
        const selection = helper().selectClassByMeanShare({
            target: 'school',
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'min',
        });

        expect(selection?.className).toBe('8b');
        expect(selection?.meanShare).toBeCloseTo(0.4, 10);
    });

    it('drops a selection its level names cannot express, rather than scoring it 0', () => {
        // WHY: the `covered` gate reaching the mean. Asked with Roman levels only, 8a's
        // Englisch (GER) is not part of the average at all — 0.50 over three selections —
        // instead of entering it as a zero, which would read 0.375 and make 8a look like a
        // Klasse in crisis.
        expect(
            helper().selectClassByMeanShare({
                target: '8a',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                mode: 'max',
            })?.meanShare,
        ).toBeCloseTo(0.5, 10);
    });
});

describe('selectSubjectDomainByShare — the best and worst measurement in a population', () => {
    it('names the school best and worst, and carries the Domäne label with it', () => {
        // WHY: this is the verb behind "das beste Ergebnis" / "der größte Handlungsbedarf",
        // and unlike the range verbs it reports one *measurement* rather than a spread. The
        // school's best is Englisch/Hörverstehen at 0.60 and its worst Deutsch/Zuhören at
        // 0.40; both must arrive with a printable Domäne name, because the sentence names
        // the Domäne rather than just the Fach.
        const query = helper();

        const best = query.selectSubjectDomainByShare({
            target: 'school',
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });
        expect(best?.subjectName).toBe('Englisch');
        expect(best?.domainName).toBe('Hörverstehen');
        expect(best?.share).toBeCloseTo(0.6, 10);

        const worst = query.selectSubjectDomainByShare({
            target: 'school',
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'min',
        });
        expect(worst?.subjectName).toBe('Deutsch');
        expect(worst?.domainId).toBe('zh');
        expect(worst?.share).toBeCloseTo(0.4, 10);
    });

    it('honours a target, unlike the class-range verbs beside it', () => {
        // WHY: the resolver's own documentation splits the scopes on exactly this —
        // `subjectDomainShare` narrows to the population the template names, while
        // `subjectClassRange` always answers school-wide. 8a's best is 0.80, a number no
        // school-level ask can produce, so a target silently ignored is visible here.
        const selection = helper().selectSubjectDomainByShare({
            target: '8a',
            levelNames: AT_OR_ABOVE_REGULAR,
            mode: 'max',
        });

        expect(selection?.subjectName).toBe('Englisch');
        expect(selection?.share).toBeCloseTo(0.8, 10);
    });

    it('reports a selection its level names cannot express as unknown, not as zero', () => {
        // WHY: the `covered` gate reaching this verb, and the direction that actually
        // hurts. Asked with the Roman bands only, the GER-scaled Englisch/Hörverstehen
        // cannot be expressed at all — and a share of 0 out of 10 is a finite number that
        // survives every downstream check, so the box would name Englisch as the school's
        // greatest weakness and state that nobody there reaches the Regelstandard, where
        // in fact 60 % do. The worst *expressible* selection is Deutsch/Zuhören at 0.40.
        //
        // The tie this leaves at the top (Deutsch/Lesen and Mathematik both at 0.50) is
        // settled by the ascending `Fach|Domäne` order the candidates are built in, which
        // is what keeps a reloaded page from naming a different Fach.
        const query = helper();

        const worst = query.selectSubjectDomainByShare({
            target: 'school',
            levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
            mode: 'min',
        });
        expect(worst?.subjectName).toBe('Deutsch');
        expect(worst?.domainId).toBe('zh');
        expect(worst?.share).toBeCloseTo(0.4, 10);

        expect(
            query.selectSubjectDomainByShare({
                target: 'school',
                levelNames: ROMAN_AT_OR_ABOVE_REGULAR,
                mode: 'max',
            })?.subjectName,
        ).toBe('Deutsch');
    });
});

describe('selectSubjectDomainByOrder — which Domäne "order=1" names', () => {
    it('follows the order the export sent, not the alphabet', () => {
        // WHY: a template writing `order=1` gets whichever Domäne the server listed first,
        // because the competence index inserts in payload order. In the shared fixture
        // Lesen precedes Zuhören under either rule, so that fixture cannot tell the two
        // apart — this case reverses the two Deutsch rows on purpose, and is the only place
        // the suite states which rule is in force.
        //
        // Worth knowing at the call site: reordering an export silently changes which
        // Domäne a box talks about.
        const query = selectionsFor(
            helperFor({
                competenceLevels: [
                    competenceRow({
                        id: 'schule',
                        type: 'school',
                        name: 'Testschule',
                        subject: 'Deutsch',
                        domainId: 'zh',
                        domainName: 'Zuhören',
                        levels: romanLevels([10, 10, 10, 10, 5, 5]),
                    }),
                    competenceRow({
                        id: 'schule',
                        type: 'school',
                        name: 'Testschule',
                        subject: 'Deutsch',
                        domainId: 'le',
                        domainName: 'Lesen',
                        levels: romanLevels([10, 10, 30, 30, 10, 10]),
                    }),
                ],
            }),
        );

        expect(
            query.selectSubjectDomainByOrder({ subjectName: 'Deutsch', order: 1 })?.domainName,
        ).toBe('Zuhören');
        expect(
            query.selectSubjectDomainByOrder({ subjectName: 'Deutsch', order: 2 })?.domainName,
        ).toBe('Lesen');
    });

    it('returns null past the last Domäne instead of wrapping or clamping', () => {
        // WHY: a box laid out for three Domänen against a Fach that has two must drop its
        // third sentence, not repeat the second one under a different heading.
        const query = helper();

        expect(
            query.selectSubjectDomainByOrder({ subjectName: 'Deutsch', order: 2 })?.domainId,
        ).toBe('zh');
        expect(query.selectSubjectDomainByOrder({ subjectName: 'Deutsch', order: 3 })).toBeNull();
    });

    it('withholds a single-Domäne Fach from a text that contrasts two', () => {
        // WHY: `multiDomainOnly` is what keeps "im Vergleich der beiden Domänen" off
        // Mathematik, which carries one `domain: null` row. Without the flag that row is
        // still a legitimate answer — the same Fach is addressable either way, and only the
        // template knows which sentence it is filling.
        const query = helper();

        expect(
            query.selectSubjectDomainByOrder({
                subjectName: 'Mathematik',
                order: 1,
                multiDomainOnly: true,
            }),
        ).toBeNull();
        expect(
            query.selectSubjectDomainByOrder({ subjectName: 'Mathematik', order: 1 })?.domainId,
        ).toBeNull();
        expect(
            query.selectSubjectDomainByOrder({
                subjectName: 'Deutsch',
                order: 1,
                multiDomainOnly: true,
            })?.domainId,
        ).toBe('le');
    });
});

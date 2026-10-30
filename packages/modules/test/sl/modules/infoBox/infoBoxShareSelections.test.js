import { describe, it, expect } from 'vitest';
import { ALL_DOMAINS } from '../../../../src/sl/utils/slQueryPrimitives.js';
import {
    buildCompetenceValueGroups,
    buildDashboardHelper,
    buildStateComparisonResults,
    sharesOf,
    slContextFor,
} from '../../../support/slInfoBoxFixture.js';
import * as shareSelections from '../../../../src/sl/modules/infoBox/infoBoxShareSelections.js';

/**
 * The dashboard fixture with Englisch's GER ladder tagging no standard band: `ge_medium`
 * then reaches the Roman levels only, and Englisch is a selection whose ladder cannot
 * express the question.
 */
async function untaggedGerHelper() {
    const competenceLevels = buildCompetenceValueGroups().map((valueGroup) =>
        valueGroup.subject?.name === 'Englisch'
            ? {
                  ...valueGroup,
                  properties: (valueGroup.properties ?? []).filter(
                      (property) => !property.key.startsWith('standardBand:'),
                  ),
              }
            : valueGroup,
    );
    return sharesOf(
        await slContextFor({ competenceLevels, aggregation: buildStateComparisonResults() }),
    );
}

/**
 * The verbs that pick one Lerngruppe or one Fach out of the school and name it.
 *
 * All of them rank on a competence-level share, never on an unweighted item aggregate over
 * whichever booklet a value group happens to sit, which would put no two Lerngruppen on one scale.
 * Each answers a superlative question ("die stärkste Lerngruppe", "der größte
 * Unterschied"), so a wrong answer here is a wrong *name* in German prose, not a wrong
 * pixel, and nothing else in the suite would catch it.
 *
 * The shared fixture documents the numbers; each case below states the rule the
 * numbers were chosen to expose.
 */

describe('selectGroupBySubjectShare — naming the best and worst Lerngruppe', () => {
    it('names the strongest Lerngruppe in a Fach', async () => {
        // The detailsSubjectSpecific praise/alarm names this Lerngruppe. 8c is at
        // 0.70 in Mathematik against 0.50 and 0.40, and Mathematik is the only Fach it sat.
        const selection = shareSelections.selectGroupBySubjectShare(await buildDashboardHelper(), {
            domainId: ALL_DOMAINS,
            target: 'school',
            levelAlias: 'ge_medium',
            subjectName: 'Mathematik',
            mode: 'max',
        });

        expect(selection?.groupName).toBe('8c');
        expect(selection?.share).toBeCloseTo(0.7, 10);
        // A pooled Fach records no Domäne: a later `target=selection:<id>` reads it whole.
        expect(selection && 'domainId' in selection).toBe(false);
    });

    it('breaks a tie by name rather than by payload order', async () => {
        // 8a and 8b are both at exactly 0.40 in Deutsch: Zuhören, on different cohort
        // sizes (20 against 10), so the tie is in the share, not in equal counts. The
        // choice must not depend on payload order, or a reload could blame a different
        // Lerngruppe. Ascending `localeCompare` makes 8a the stable answer.
        const selection = shareSelections.selectGroupBySubjectShare(await buildDashboardHelper(), {
            target: 'school',
            levelAlias: 'ge_medium',
            subjectName: 'Deutsch',
            domainId: 'zh',
            mode: 'min',
        });

        expect(selection?.groupName).toBe('8a');
        expect(selection?.share).toBeCloseTo(0.4, 10);
        expect(selection?.domainId).toBe('zh');
    });

    it('returns null for a Fach no Lerngruppe sat, rather than naming one anyway', async () => {
        // A superlative over an empty set has no answer. Returning a Lerngruppe here
        // would print "die schwächste Lerngruppe in Physik ist 8a" for a Fach that does not
        // exist at this school; returning null lets the block be skipped.
        expect(
            shareSelections.selectGroupBySubjectShare(await buildDashboardHelper(), {
                domainId: ALL_DOMAINS,
                target: 'school',
                levelAlias: 'ge_medium',
                subjectName: 'Physik',
                mode: 'max',
            }),
        ).toBeNull();
    });
});

describe('selectSubjectByShareGroupRange — the Fach whose Lerngruppen differ most', () => {
    it('ranks Fächer by the spread between their Lerngruppen', async () => {
        // The sentence claims a *Unterschied innerhalb* eines Fachs, so the verb
        // ranks on the spread, not on how high the Fach sits. Englisch spans 0.40–0.80;
        // Mathematik has three Lerngruppen and spans only 0.30 despite containing the
        // school's joint-lowest result, so neither the number of Lerngruppen nor the depth
        // of the worst one decides it.
        const selection = shareSelections.selectSubjectByShareGroupRange(
            await buildDashboardHelper(),
            {
                levelAlias: 'ge_medium',
                mode: 'max',
            },
        );

        expect(selection?.subjectName).toBe('Englisch');
        expect(selection?.shareRange).toBeCloseTo(0.4, 10);
    });

    it('names the most even Fach under min', async () => {
        // `min` is what the "am gleichmäßigsten" sentence reads, and it must be the
        // same measure inverted — the smallest spread, not the lowest shares. Deutsch at
        // 0.0667 is the tightest Fach even though its 8b (0.40) ties the school's lowest
        // Lerngruppen-Ergebnis.
        const selection = shareSelections.selectSubjectByShareGroupRange(
            await buildDashboardHelper(),
            {
                levelAlias: 'ge_medium',
                mode: 'min',
            },
        );

        expect(selection?.subjectName).toBe('Deutsch');
        expect(selection?.shareRange).toBeCloseTo(1 / 15, 10);
    });

    it('cannot see a Fach whose ladder the level names do not cover', async () => {
        // The `covered` gate reaching a superlative — a rate can always be computed,
        // a share cannot. With a GER ladder that names no standard, Englisch is invisible
        // rather than zero-spread, and the school's widest Fach reads Mathematik at 0.30
        // instead of Englisch at 0.40; once the ladder names its bands, Englisch wins.
        expect(
            shareSelections.selectSubjectByShareGroupRange(await untaggedGerHelper(), {
                levelAlias: 'ge_medium',
                mode: 'max',
            })?.subjectName,
        ).toBe('Mathematik');
        expect(
            shareSelections.selectSubjectByShareGroupRange(await buildDashboardHelper(), {
                levelAlias: 'ge_medium',
                mode: 'max',
            })?.subjectName,
        ).toBe('Englisch');
    });
});

describe('selectSubjectDomainByShareGroupRange — the same question, per Domäne', () => {
    it('finds a flat Domäne the Fach-level verb reports as uneven', async () => {
        // Pooled over both Domänen, Deutsch's Lerngruppen differ by 0.0667 and the
        // Fach-level verb calls it the school's most even Fach. Split out, Deutsch: Zuhören
        // is flat — both Lerngruppen at 0.40 — and all of Deutsch's unevenness sits in
        // Lesen. Answering the Domäne question by pooling would report 0.0667 and never
        // name the flat Domäne.
        const query = await buildDashboardHelper();
        const byDomain = shareSelections.selectSubjectDomainByShareGroupRange(query, {
            levelAlias: 'ge_medium',
            mode: 'min',
        });
        const bySubject = shareSelections.selectSubjectByShareGroupRange(query, {
            levelAlias: 'ge_medium',
            mode: 'min',
        });

        expect(byDomain?.subjectName).toBe('Deutsch');
        expect(byDomain?.domainId).toBe('zh');
        expect(byDomain?.shareRange).toBe(0);
        expect(bySubject?.shareRange ?? 0).toBeGreaterThan(Number(byDomain?.shareRange ?? 0));
    });

    it('carries the Domäne display name, so the sentence can print it', async () => {
        // The box prints "Englisch (Hören)", so the selection has to identify
        // the Domäne *and* be able to label it. Reading the aggregates is what makes that
        // possible: item value groups carry the Domäne id in `domain.name` with no id at all, so a
        // selection over them could not label the Domäne.
        const selection = shareSelections.selectSubjectDomainByShareGroupRange(
            await buildDashboardHelper(),
            {
                levelAlias: 'ge_medium',
                mode: 'max',
            },
        );

        expect(selection?.subjectName).toBe('Englisch');
        expect(selection?.domainId).toBe('ho');
        expect(selection?.domainName).toBe('Hören');
    });

    it('lets a Fach with no Domänen compete on equal terms', async () => {
        // Mathematik carries a single domain-less value group, and it must still be one of
        // the candidates rather than being skipped for having nothing to split. With the
        // GER ladder naming no standard — which drops Englisch — it wins outright.
        const selection = shareSelections.selectSubjectDomainByShareGroupRange(
            await untaggedGerHelper(),
            {
                levelAlias: 'ge_medium',
                mode: 'max',
            },
        );

        expect(selection?.subjectName).toBe('Mathematik');
        expect(selection?.domainId).toBeNull();
        expect(selection?.shareRange).toBeCloseTo(0.3, 10);
    });
});

describe('getCompetenceLevelShareRange — the school best and worst', () => {
    it('silently skips the selections its level names cannot express', async () => {
        // The `covered` gate at range scope. With a GER ladder that names no standard,
        // the school's best result is Deutsch/Lesen at 0.50 — Englisch/Hören at 0.60 is
        // invisible to the question. With both ladders tagged, Englisch wins.
        const romanOnly = shareSelections.getCompetenceLevelShareRange(await untaggedGerHelper(), {
            target: 'school',
            levelAlias: 'ge_medium',
        });
        expect(romanOnly?.max).toBeCloseTo(0.5, 10);

        const bothLadders = shareSelections.getCompetenceLevelShareRange(
            await buildDashboardHelper(),
            {
                target: 'school',
                levelAlias: 'ge_medium',
            },
        );
        expect(bothLadders?.max).toBeCloseTo(0.6, 10);

        // The weakest selection is on the Roman ladder either way, so only the top of
        // the range moves.
        expect(romanOnly?.min).toBeCloseTo(0.4, 10);
        expect(bothLadders?.min).toBeCloseTo(0.4, 10);
    });
});

describe('getSubjectCompetenceShareGroupRange — the Lerngruppen spread within one Fach', () => {
    it('spans only the Lerngruppen that sat the Fach', async () => {
        // Deutsch has two Lerngruppen (0.40–0.4667) and Mathematik three (0.40–0.70).
        // 8c must widen Mathematik's range and must not appear in Deutsch's at all —
        // if an absent Lerngruppe counted as 0, every Fach 8c skipped would report a
        // spread reaching down to zero and read as a school in crisis.
        const query = await buildDashboardHelper();

        const deutsch = shareSelections.getSubjectCompetenceShareGroupRange(query, {
            domainId: ALL_DOMAINS,
            target: 'school',
            levelAlias: 'ge_medium',
            subjectName: 'Deutsch',
        });
        expect(deutsch?.min).toBeCloseTo(0.4, 10);
        expect(deutsch?.max).toBeCloseTo(14 / 30, 10);

        const mathematik = shareSelections.getSubjectCompetenceShareGroupRange(query, {
            domainId: ALL_DOMAINS,
            target: 'school',
            levelAlias: 'ge_medium',
            subjectName: 'Mathematik',
        });
        expect(mathematik?.max).toBeCloseTo(0.7, 10);
    });
});

describe('selectGroupBySubjectShareRange — the Lerngruppe whose results vary most', () => {
    it('names the Lerngruppe with the widest spread across its own Fächer', async () => {
        // 8a runs 0.40 (Deutsch/Zuhören) to 0.80 (Englisch), a spread of 0.40. 8b
        // is flat at 0.40 everywhere. The claim is about *internal* variation, so the
        // Lerngruppe with the highest single result and the Lerngruppe that varies most need
        // not be the same — here they are both 8a only because the fixture makes 8a's
        // best the school's best; what the assertion pins is the spread.
        const selection = shareSelections.selectGroupBySubjectShareRange(
            await buildDashboardHelper(),
            {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'max',
            },
        );

        expect(selection?.groupName).toBe('8a');
        expect(selection?.shareRange).toBeCloseTo(0.4, 10);
    });

    it('breaks a tie at zero spread by name', async () => {
        // 8b is flat at 0.40 across four selections and 8c has a single selection,
        // so both span exactly 0. Two Lerngruppen are equally "even" for different reasons
        // and the tie-break must still be deterministic; 8b sorts first.
        const selection = shareSelections.selectGroupBySubjectShareRange(
            await buildDashboardHelper(),
            {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'min',
            },
        );

        expect(selection?.groupName).toBe('8b');
        expect(selection?.shareRange).toBe(0);
    });

    it('understates a Lerngruppe spread when the level names cover only one ladder', async () => {
        // The `covered` gate reaching a superlative. With a GER ladder that names no
        // standard, 8a's Englisch result is invisible and its spread reads 0.20 instead of
        // 0.40 — the verb still names 8a, but the number printed beside the name is half
        // the real one.
        const romanOnly = shareSelections.selectGroupBySubjectShareRange(
            await untaggedGerHelper(),
            {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'max',
            },
        );
        const bothLadders = shareSelections.selectGroupBySubjectShareRange(
            await buildDashboardHelper(),
            {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'max',
            },
        );

        expect(romanOnly?.groupName).toBe('8a');
        expect(romanOnly?.shareRange).toBeCloseTo(0.2, 10);
        expect(bothLadders?.shareRange).toBeCloseTo(0.4, 10);
    });

    it('returns null when no level name is given, rather than treating it as "any"', async () => {
        // An empty level list is a caller bug — a placeholder whose levelAlias did
        // not resolve. Treating it as "all levels" would make every share 100 % and
        // every spread 0, and the box would report a perfectly even school.
        //
        // Two guards deliver this: the share query's `levelNames.length === 0` check, and
        // `sumRatio` reporting an unexpressible share as unknown. Either alone yields
        // null, so the assertion pins the behaviour, not the guard.
        expect(
            shareSelections.selectGroupBySubjectShareRange(await buildDashboardHelper(), {
                target: 'school',
                levelAlias: '',
                mode: 'max',
            }),
        ).toBeNull();
        expect(
            (await buildDashboardHelper()).getCompetenceLevelShare({
                target: '8a',
                levelAlias: '',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeNull();
    });
});

describe('selectGroupByMeanShare — the Lerngruppe that is strongest overall', () => {
    it('averages the Fächer a Lerngruppe sat, rather than weighting them by cohort', async () => {
        // "insgesamt am stärksten" has two defensible readings and they disagree here.
        // 8a's four selections average 0.575, while the same numbers summed over students
        // — 25 of 46, because its Zuhören cohort is twice its others — read 0.543. The verb
        // is specified as the unweighted mean of the shares; a switch to weighting would
        // leave the name unchanged and only move the number.
        expect(
            shareSelections.selectGroupByMeanShare(await buildDashboardHelper(), {
                target: '8a',
                levelAlias: 'ge_medium',
                mode: 'max',
            })?.meanShare,
        ).toBeCloseTo(0.575, 10);
    });

    it('lets a Lerngruppe that sat one Fach win on that Fach alone', async () => {
        // The mean runs over what a Lerngruppe sat. 8c sits only Mathematik, at 0.70,
        // and so is named the school's strongest Lerngruppe over 8a's 0.575 across four
        // selections — even though 8a holds the school's best single result (0.80 in
        // Englisch). Intended: absent is not zero, and a Lerngruppe is not penalised for
        // the Fächer it did not sit.
        const selection = shareSelections.selectGroupByMeanShare(await buildDashboardHelper(), {
            target: 'school',
            levelAlias: 'ge_medium',
            mode: 'max',
        });

        expect(selection?.groupName).toBe('8c');
        expect(selection?.meanShare).toBeCloseTo(0.7, 10);
    });

    it('names the flat Lerngruppe under min', async () => {
        // `min` reads the alarm sentence, and must be the same measure inverted. 8b is
        // at 0.40 in all four selections, so its mean is 0.40 whichever way it is computed
        // — the one Lerngruppe whose answer cannot depend on the aggregation.
        const selection = shareSelections.selectGroupByMeanShare(await buildDashboardHelper(), {
            target: 'school',
            levelAlias: 'ge_medium',
            mode: 'min',
        });

        expect(selection?.groupName).toBe('8b');
        expect(selection?.meanShare).toBeCloseTo(0.4, 10);
    });

    it('drops a selection its level names cannot express, rather than scoring it 0', async () => {
        // The `covered` gate reaching the mean. With a GER ladder that names no standard,
        // 8a's Englisch is not part of the average at all — 0.50 over three selections —
        // instead of entering it as a zero, which would read 0.375 and make 8a look like a
        // Lerngruppe in crisis.
        expect(
            shareSelections.selectGroupByMeanShare(await untaggedGerHelper(), {
                target: '8a',
                levelAlias: 'ge_medium',
                mode: 'max',
            })?.meanShare,
        ).toBeCloseTo(0.5, 10);
    });
});

describe('selectSubjectDomainByShare — the best and worst measurement in a population', () => {
    it('names the school best and worst, and carries the Domäne label with it', async () => {
        // The verb behind "das beste Ergebnis" / "der größte Handlungsbedarf" reports
        // one measurement, not a spread. The school's best is Englisch/Hören at 0.60
        // and its worst Deutsch/Zuhören at 0.40; both must arrive with a printable Domäne
        // name, because the sentence names the Domäne.
        const query = await buildDashboardHelper();

        const best = shareSelections.selectSubjectDomainByShare(query, {
            target: 'school',
            levelAlias: 'ge_medium',
            mode: 'max',
        });
        expect(best?.subjectName).toBe('Englisch');
        expect(best?.domainName).toBe('Hören');
        expect(best?.share).toBeCloseTo(0.6, 10);

        const worst = shareSelections.selectSubjectDomainByShare(query, {
            target: 'school',
            levelAlias: 'ge_medium',
            mode: 'min',
        });
        expect(worst?.subjectName).toBe('Deutsch');
        expect(worst?.domainId).toBe('zh');
        expect(worst?.share).toBeCloseTo(0.4, 10);
    });

    it('honours a target, unlike the group-range verbs beside it', async () => {
        // `subjectDomainShare` narrows to the population the template names, while
        // `subjectGroupRange` always answers school-wide. 8a's best is 0.80, a number no
        // school-level ask can produce, so an ignored target is visible here.
        const selection = shareSelections.selectSubjectDomainByShare(await buildDashboardHelper(), {
            target: '8a',
            levelAlias: 'ge_medium',
            mode: 'max',
        });

        expect(selection?.subjectName).toBe('Englisch');
        expect(selection?.share).toBeCloseTo(0.8, 10);
    });

    it('reports a selection its level names cannot express as unknown, not as zero', async () => {
        // The `covered` gate reaching this verb. With a GER ladder that names no
        // standard, Englisch/Hören cannot be expressed — and a share of 0 out of 10
        // is a finite number that passes every downstream check, so the box would name
        // Englisch the school's greatest weakness where 60 % reach the Regelstandard. The
        // worst expressible selection is Deutsch/Zuhören at 0.40.
        //
        // The tie this leaves at the top (Deutsch/Lesen and Mathematik both at 0.50) is
        // settled by the ascending `Fach|Domäne` order the candidates are built in, so a
        // reloaded page names the same Fach.
        const query = await untaggedGerHelper();

        const worst = shareSelections.selectSubjectDomainByShare(query, {
            target: 'school',
            levelAlias: 'ge_medium',
            mode: 'min',
        });
        expect(worst?.subjectName).toBe('Deutsch');
        expect(worst?.domainId).toBe('zh');
        expect(worst?.share).toBeCloseTo(0.4, 10);

        expect(
            shareSelections.selectSubjectDomainByShare(query, {
                target: 'school',
                levelAlias: 'ge_medium',
                mode: 'max',
            })?.subjectName,
        ).toBe('Deutsch');
    });
});

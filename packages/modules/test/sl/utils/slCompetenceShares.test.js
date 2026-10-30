import { describe, it, expect, vi } from 'vitest';
import { ALL_DOMAINS } from '../../../src/sl/utils/slQueryPrimitives.js';
import {
    SCHOOL_ID,
    STATE_ID,
    competenceValueGroup,
    romanLevels,
} from '../../support/slValueGroupFactories.js';
import {
    buildCompetenceValueGroups,
    buildDashboardContext,
    buildDashboardHelper as helper,
    helperFor,
    sharesOf,
    slContextFor,
} from '../../support/slInfoBoxFixture.js';
import { BOOKLET_PROPERTY } from '../../support/competenceLevelGroups.js';
import { competenceLevelShare } from '../../../src/sl/utils/slCompetenceShares.js';

/**
 * The two share verbs every info box prints: one subject×domain of a target, and a
 * whole Fach pooled over its Domänen. Everything a box says is one of these numbers,
 * so a wrong weighting here is a wrong percentage in German prose.
 *
 * The shared fixture documents the numbers; each case below states the rule the
 * numbers were chosen to expose.
 */

describe('getCompetenceLevelShare — the share every box now prints', () => {
    it('reads the school value group for a Fach and Domäne', async () => {
        const query = await helper();

        expect(
            query.getCompetenceLevelShare({
                target: 'school',
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.5, 10);
        expect(
            query.getCompetenceLevelShare({
                target: '8a',
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.6, 10);
    });

    it('returns null when the scale cannot express the levels asked about', async () => {
        // Every selector inherits this gate. Englisch is measured on the GER ladder,
        // which has no band called "III". Counting matches against it yields 0 out of 10 —
        // a finite zero that passes every numeric check downstream, so the box would state
        // that nobody in 8a reaches Kompetenzstufe III in Englisch when 80 % reach the
        // equivalent band. A share the scale cannot express is unknown, not zero; the band
        // alias the queries take reaches each ladder's own band.
        const context = await buildDashboardContext();
        const englisch8a = buildCompetenceValueGroups().filter(
            (valueGroup) => valueGroup.name === '8a' && valueGroup.subject?.name === 'Englisch',
        );

        expect(englisch8a).toHaveLength(1);
        expect(competenceLevelShare(context.palette, englisch8a, ['III', 'IV', 'V'])).toBeNull();
        expect(
            sharesOf(context).getCompetenceLevelShare({
                target: '8a',
                levelAlias: 'ge_medium',
                subjectName: 'Englisch',
                domainId: 'ho',
            }),
        ).toBeCloseTo(0.8, 10);
    });

    it('leaves a scale without the asked-for band out of the share, quietly', async () => {
        // Englisch here tops out at B1.2 (Regelstandard), so `e_high` resolves to Deutsch's
        // `V` alone. Englisch's share is unknown, not 0 % — and no fault of its scale,
        // which tags the other bands, so nothing warns.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const deutsch = competenceValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        });
        const englisch = {
            ...competenceValueGroup({
                id: SCHOOL_ID,
                type: 'school',
                name: 'Testschule',
                subject: 'Englisch',
                domainId: 'ho',
                domainName: 'Hören',
                levels: { 'A1.1': 2, 'A1.2': 2, 'A2.1': 2, 'A2.2': 2, 'B1.1': 1, 'B1.2': 1 },
            }),
            properties: [
                BOOKLET_PROPERTY,
                { key: 'standardBand:1', value: 'low' },
                { key: 'standardBand:2', value: 'low' },
                { key: 'standardBand:5', value: 'medium' },
                { key: 'standardBand:6', value: 'medium' },
            ],
        };
        const context = await slContextFor({ competenceLevels: [deutsch, englisch] });
        const query = sharesOf(context);
        /**
         * @param {string} alias
         * @param {string} subjectName
         * @param {string} domainId
         * @returns {number|null} The school's share.
         */
        const share = (alias, subjectName, domainId) =>
            query.getCompetenceLevelShare({
                target: 'school',
                levelAlias: alias,
                subjectName,
                domainId,
            });

        expect(query.getAliasLevels('e_high')).toEqual(['V']);
        expect(share('e_high', 'Deutsch', 'le')).toBeCloseTo(0.1, 10);
        expect(share('e_high', 'Englisch', 'ho')).toBeNull();
        // The same scale answers a band it does tag.
        expect(share('ge_medium', 'Englisch', 'ho')).toBeCloseTo(0.2, 10);
        expect(warn).not.toHaveBeenCalled();

        warn.mockRestore();
    });

    it('warns once about a scale that tags no band at all', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const query = await helperFor({
            competenceLevels: [
                competenceValueGroup({
                    id: SCHOOL_ID,
                    type: 'school',
                    name: 'Testschule',
                    subject: 'Deutsch',
                    domainId: 'le',
                    domainName: 'Lesen',
                    levels: romanLevels([2, 2, 2, 2, 1, 1]),
                    namesStandards: false,
                }),
            ],
        });
        const args = {
            target: 'school',
            levelNames: ['Unbekannt'],
            subjectName: 'Deutsch',
            domainId: 'le',
        };

        expect(query.getCompetenceLevelShare(args)).toBeNull();
        expect(query.getCompetenceLevelShare(args)).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('tags no KMK standard'));

        warn.mockRestore();
    });

    it("divides by the value group's total, so a student without a level still counts", async () => {
        // The spec's `total` is every student of the value-group, and `mean` is
        // frequency / total. Summing the level frequencies instead would leave out a
        // student the payload assigns no level, so the box would print a higher share than
        // the competence chart and the Entwicklung view show for the same value group.
        const valueGroup = competenceValueGroup({
            id: 'schule',
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        });
        // 10 students with a level, 5 more without one: 4 of 15 reach III or above.
        for (const level of valueGroup.competenceLevels) level.descriptiveStatistics.total = 15;

        expect(
            (await helperFor({ competenceLevels: [valueGroup] })).getCompetenceLevelShare({
                target: 'school',
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(4 / 15, 10);
    });

    it('returns null for a Lerngruppe that never sat the Fach', async () => {
        // Absent is not zero. 8c sits only Mathematik.
        expect(
            (await helper()).getCompetenceLevelShare({
                target: '8c',
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeNull();
    });
});

describe('getSubjectCompetenceShare — one number for a whole Fach', () => {
    it('weights by students rather than averaging the Domänen', async () => {
        // The verb has to sum frequencies and totals, not average the Domänen's
        // ratios — the two diverge as soon as a Domäne has a different cohort size.
        // The fixture makes Deutsch's cohorts unequal so the two cannot agree by accident:
        //
        //   - 8a is 0.60 over 10 students in Lesen and 0.40 over 20 in Zuhören, so the
        //     weighted answer is 14/30 ≈ 0.4667 where the mean of the ratios is 0.50
        //   - the school sums its *Lerngruppen* value groups — 22/50 = 0.44 — which is neither the
        //     mean of the Domänen (0.45) nor the same sum over the school's own value groups
        //     (70/150 ≈ 0.4667), so this also pins which value groups "school" means here
        const query = await helper();

        expect(
            query.getSubjectCompetenceShare({
                domainId: ALL_DOMAINS,
                target: 'school',
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
            }),
        ).toBeCloseTo(0.44, 10);
        expect(
            query.getSubjectCompetenceShare({
                domainId: ALL_DOMAINS,
                target: '8a',
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
            }),
        ).toBeCloseTo(14 / 30, 10);
    });
});

describe('a Landesschnitt that delivers shares without headcounts', () => {
    /**
     * A competence value group stripped to level `mean`s, as a state source that stores shares
     * and no headcounts delivers it.
     * @param {string} domainId
     * @param {number[]} counts - Roman level frequencies the shares derive from.
     * @returns {any}
     */
    function shareOnlyStateValueGroup(domainId, counts) {
        const valueGroup = competenceValueGroup({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Deutsch',
            domainId,
            levels: romanLevels(counts),
        });
        for (const level of valueGroup.competenceLevels) {
            level.descriptiveStatistics = {
                mean: level.descriptiveStatistics.mean,
            };
        }
        return valueGroup;
    }

    const payload = () => ({
        competenceLevels: [
            competenceValueGroup({
                id: SCHOOL_ID,
                type: 'school',
                name: 'Schule',
                subject: 'Deutsch',
                domainId: 'le',
                levels: romanLevels([0, 0, 5, 5, 0, 0]),
            }),
            shareOnlyStateValueGroup('le', [0, 0, 6, 3, 1, 0]),
            shareOnlyStateValueGroup('zh', [0, 0, 5, 5, 0, 0]),
        ],
    });

    it('reads a Domäne share off the level means', async () => {
        // The share is the same quantity whether the payload counts it or states it;
        // a missing headcount must not make the Landesschnitt vanish from a view.
        expect(
            (await helperFor(payload())).getCompetenceLevelShare({
                target: { type: 'comparison', id: STATE_ID },
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeCloseTo(0.4, 10);
    });

    it('reads a level the Landesschnitt lists for nobody as a genuine zero', async () => {
        // A source that stores shares omits a level nobody reached, as a counted value
        // group does. Its ladder still has the level, so the share is 0 %, not unknown.
        const withoutTopLevel = shareOnlyStateValueGroup('le', [0, 0, 6, 3, 1, 0]);
        withoutTopLevel.competenceLevels = withoutTopLevel.competenceLevels.slice(0, -1);
        const { competenceLevels } = payload();

        expect(
            (
                await helperFor({ competenceLevels: [competenceLevels[0], withoutTopLevel] })
            ).getCompetenceLevelShare({
                target: { type: 'comparison', id: STATE_ID },
                levelAlias: 'e_high',
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBe(0);
    });

    it('does not pool a Fach out of uncounted Domäne shares', async () => {
        // Without headcounts nothing weighs the Domänen against each other, and an
        // unweighted mean is not the student-weighted share the school's Fach is.
        expect(
            (await helperFor(payload())).getSubjectCompetenceShare({
                domainId: ALL_DOMAINS,
                target: { type: 'comparison', id: STATE_ID },
                levelAlias: 'ge_medium',
                subjectName: 'Deutsch',
            }),
        ).toBeNull();
    });
});

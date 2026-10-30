import { describe, it, expect } from 'vitest';
import { ALL_DOMAINS } from '../../../src/sl/utils/slQueryPrimitives.js';
import { BOOKLET_PROPERTY } from '../../support/competenceLevelGroups.js';
import { solutionRatesFor } from '../../support/slInfoBoxFixture.js';
import {
    SCHOOL_ID,
    STATE_ID,
    domainBookletSubject,
    resultValueGroup as schoolResultValueGroup,
    twoBookletSubject,
    withBooklet,
} from '../../support/slValueGroupFactories.js';

/**
 * How a Lösungsquote finds its result value groups.
 *
 * `aggregations.json` and `competence-levels.json` describe the same school in two
 * vocabularies, and the Lösungsquote is the one metric that has to join them: the
 * caller names a subject/domain out of the *aggregates* and the rate is summed over
 * the matching *result* value groups. A failure in either half of that join is invisible —
 * an unmatched join yields no value groups, `getSolutionRate` returns null, and the card is
 * absent rather than wrong.
 */

/** Aggregate value group — only there so `detectSchoolId` can name the school. */
const COMPETENCE_LEVELS = [
    {
        id: SCHOOL_ID,
        type: 'school',
        name: 'Testschule',
        subject: { name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        properties: [BOOKLET_PROPERTY],
        competenceLevels: [],
    },
];

/**
 * The school's result value group, with the Domäne as the payload spells it: id and name
 * differ; a value group without one describes the whole Fach.
 * @param {{subject: string, domain?: {id: string, name: string}, solved: number, total: number, notAttempted?: number}} spec
 */
function resultValueGroup({ domain, ...spec }) {
    return {
        ...schoolResultValueGroup({ id: SCHOOL_ID, type: 'school', name: 'Testschule', ...spec }),
        ...(domain && { domain }),
    };
}

/**
 * @param {import('../../../src/common/data/schemas/aggregations.js').AggregationsValueGroup[]} valueGroups - `aggregations.json`.
 * @returns {Promise<import('../../../src/sl/utils/slSolutionRates.js').SolutionRateQueries>}
 */
async function helperFor(valueGroups) {
    return solutionRatesFor({ competenceLevels: COMPETENCE_LEVELS, aggregation: valueGroups });
}

/**
 * @param {import('../../../src/sl/utils/slSolutionRates.js').SolutionRateQueries} helper
 * @param {string} subjectName
 * @param {string|null} domainId
 * @returns {number|null} The school's Lösungsquote there.
 */
function schoolRate(helper, subjectName, domainId) {
    return helper.getSolutionRate({ target: 'school', subjectName, domainId });
}

describe("getSolutionRate — which field identifies a result value group's domain", () => {
    it('matches on domain.id, the key the aggregates are asked for', async () => {
        // The exports put the id in `id` and the human label in `name`
        // (`{ id: 'le', name: 'Lesen' }`), while the caller passes the aggregate's
        // `domain.id` — 'le'. Preferring `name` would resolve every export's value group to
        // "Lesen"/"Rechtschreibung", which matches no aggregate, leaving the Lösungsquote
        // empty on every state export.
        const helper = await helperFor([
            resultValueGroup({
                subject: 'Deutsch',
                domain: { id: 'le', name: 'Lesen' },
                solved: 40,
                total: 100,
            }),
            resultValueGroup({
                subject: 'Deutsch',
                domain: { id: 'rs', name: 'Rechtschreibung' },
                solved: 10,
                total: 100,
            }),
        ]);

        expect(schoolRate(helper, 'Deutsch', 'le')).toBeCloseTo(0.4, 10);
        expect(schoolRate(helper, 'Deutsch', 'rs')).toBeCloseTo(0.1, 10);
        // The label is not an identifier: nothing may reach a value group by it.
        expect(schoolRate(helper, 'Deutsch', 'Lesen')).toBeNull();
    });
});

describe('getSolutionRate — a domain-less subject', () => {
    it('sums every domain when the aggregates describe the subject as a whole', async () => {
        // The exports carry one domain-less Mathematik aggregate value group against
        // five item domains (dz/fz/me/rf/za). Read literally, `domainId: null` asks
        // for a domain named null, no result value group has one, and Mathematik silently has
        // no Lösungsquote anywhere. `null` means the whole subject — the tri-state on
        // `#getValueGroupsForTarget`.
        const helper = await helperFor([
            resultValueGroup({
                subject: 'Mathematik',
                domain: { id: 'dz', name: 'Daten und Zufall' },
                solved: 30,
                total: 100,
            }),
            resultValueGroup({
                subject: 'Mathematik',
                domain: { id: 'fz', name: 'Funktionaler Zusammenhang' },
                solved: 20,
                total: 100,
            }),
        ]);

        expect(schoolRate(helper, 'Mathematik', null)).toBeCloseTo(0.25, 10);
    });

    it('keeps the exact match when the payload really does ship a domain-less value group', async () => {
        // Summing unconditionally would fold sibling domains into a value group the
        // payload deliberately kept separate. The fallback is for the case where the
        // literal reading matches *nothing*, not a blanket re-interpretation of null.
        const helper = await helperFor([
            resultValueGroup({
                subject: 'Mathematik',
                solved: 10,
                total: 100,
            }),
            resultValueGroup({
                subject: 'Mathematik',
                domain: { id: 'dz', name: 'Daten und Zufall' },
                solved: 90,
                total: 100,
            }),
        ]);

        expect(schoolRate(helper, 'Mathematik', null)).toBeCloseTo(0.1, 10);
    });
});

describe('Lösungsquote — school counts and Landesschnitt shares', () => {
    /** @type {import('../../../src/sl/utils/slQueryPrimitives.js').QueryTarget} */
    const state = { type: 'comparison', id: STATE_ID };

    /**
     * A Landesschnitt value group: the API states the `Richtig` share only, no counts.
     * @param {string} subject
     * @param {string|null} domain - The Domäne id; `null` for the whole Fach.
     * @param {number} percent - The `Richtig` share, in percent.
     * @returns {import('../../../src/common/data/schemas/aggregations.js').AggregationsValueGroup}
     */
    function stateValueGroup(subject, domain, percent) {
        return schoolResultValueGroup({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject,
            domain,
            solved: percent,
            total: 100,
        });
    }

    it('reads a school value group as Richtig over all its responses, Unbearbeitet included', async () => {
        // Every response carries exactly one Ergebnis, so the three frequencies sum
        // to all of them; a rate over Richtig + Falsch only would drop the unanswered
        // items and overstate the school.
        const helper = await helperFor([
            resultValueGroup({
                subject: 'Deutsch',
                domain: { id: 'le', name: 'Lesen' },
                solved: 30,
                total: 100,
                notAttempted: 20,
            }),
        ]);

        expect(schoolRate(helper, 'Deutsch', 'le')).toBeCloseTo(0.3, 10);
    });

    it('takes a Landesschnitt share as it is, but never pools a Fach out of domain shares', async () => {
        // A Landesschnitt has no counts, only a share per domain. Per domain that
        // share is the answer. Across domains nothing says how they weigh, and the
        // unweighted mean of their shares is not the response-weighted rate the school's
        // pooled Fach is — comparing the two would set different averages side by side.
        const helper = await helperFor([
            stateValueGroup('Deutsch', 'le', 50),
            stateValueGroup('Deutsch', 'rs', 40),
        ]);

        expect(
            helper.getSolutionRate({ target: state, subjectName: 'Deutsch', domainId: 'le' }),
        ).toBeCloseTo(0.5, 10);
        expect(
            helper.getSolutionRate({ target: state, subjectName: 'Deutsch', domainId: null }),
        ).toBeNull();
    });

    it("reads a Fach-level subject's Landesschnitt from its domain-less value group", async () => {
        // Mathematik's competence levels are Fach-level, so the Materialien page asks for
        // the whole Fach. The API ships its Landesschnitt beside the Leitidee shares as
        // one domain-less value group, the item mean over all of the Fach's items. Beside
        // the school's response-weighted rate it is the same kind of average the per-domain
        // comparison already sets side by side, unlike a mean the client would build.
        const helper = await helperFor([
            stateValueGroup('Mathematik', 'dz', 60),
            stateValueGroup('Mathematik', 'rf', 20),
            stateValueGroup('Mathematik', null, 55),
        ]);

        expect(
            helper.getSolutionRate({ target: state, subjectName: 'Mathematik', domainId: null }),
        ).toBeCloseTo(0.55, 10);
        expect(
            helper.getSolutionRate({ target: state, subjectName: 'Mathematik', domainId: 'rf' }),
        ).toBeCloseTo(0.2, 10);
    });
});

describe('getSolutionRate — a Fach tested with several booklets', () => {
    // A raw Lösungsquote counts Richtig over the items a booklet held, so rates of
    // different booklets cannot be compared, and a pool over them means nothing.
    /** `aggregations.json` for the school, both groups and the Landesschnitt, in Deutsch. */
    const AGGREGATIONS = [
        schoolResultValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Schule',
            subject: 'Deutsch',
            solved: 50,
            total: 100,
        }),
        schoolResultValueGroup({
            id: '8a',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            solved: 30,
            total: 50,
        }),
        schoolResultValueGroup({
            id: '8b',
            type: 'group',
            name: '8b',
            subject: 'Deutsch',
            solved: 20,
            total: 50,
        }),
        schoolResultValueGroup({
            id: STATE_ID,
            type: 'state',
            name: 'Land',
            subject: 'Deutsch',
            solved: 40,
            total: 100,
        }),
    ];
    /** @type {import('../../../src/sl/utils/slQueryPrimitives.js').QueryTarget[]} */
    const TARGETS = ['school', '8a', { type: 'comparison', id: STATE_ID }];

    it('reads no rate for the school, a group or the Landesschnitt', async () => {
        const helper = await solutionRatesFor({
            competenceLevels: twoBookletSubject(),
            aggregation: AGGREGATIONS,
        });

        expect(helper.hasMixedBooklets('Deutsch', null)).toBe(true);
        for (const target of TARGETS) {
            expect(
                helper.getSolutionRate({ domainId: ALL_DOMAINS, target, subjectName: 'Deutsch' }),
            ).toBeNull();
        }
    });

    it('reads every rate when all value groups sat one booklet', async () => {
        const helper = await solutionRatesFor({
            competenceLevels: twoBookletSubject().map((valueGroup) =>
                withBooklet({ ...valueGroup, properties: [] }, '26-V8-DE-TH-1'),
            ),
            aggregation: AGGREGATIONS,
        });

        expect(helper.hasMixedBooklets('Deutsch', null)).toBe(false);
        for (const target of TARGETS) {
            expect(
                helper.getSolutionRate({ domainId: ALL_DOMAINS, target, subjectName: 'Deutsch' }),
            ).not.toBeNull();
        }
    });
});

describe('getSolutionRate — booklets that cover some Domänen of a Fach', () => {
    // A Deutsch booklet holds two of the Fach's Domänen: Lesen was sat in two booklets,
    // Rechtschreibung and Sprachgebrauch in one each.
    /** @type {import('../../../src/sl/utils/slQueryPrimitives.js').QueryTarget[]} */
    const TARGETS = ['school', '8a', '8b', { type: 'comparison', id: STATE_ID }];

    it('reads the rates of a Domäne sat in one booklet', async () => {
        const helper = await solutionRatesFor(domainBookletSubject());

        expect(
            helper.getSolutionRate({ target: 'school', subjectName: 'Deutsch', domainId: 'rs' }),
        ).toBe(0.5);
        expect(
            helper.getSolutionRate({ target: '8a', subjectName: 'Deutsch', domainId: 'rs' }),
        ).toBe(0.6);
        expect(
            helper.getSolutionRate({ target: '8b', subjectName: 'Deutsch', domainId: 'sp' }),
        ).toBe(0.6);
    });

    it('reads none in a Domäne sat in two, nor over the whole Fach', async () => {
        const helper = await solutionRatesFor(domainBookletSubject());

        for (const target of TARGETS) {
            for (const domainId of ['le', null]) {
                expect(
                    helper.getSolutionRate({ target, subjectName: 'Deutsch', domainId }),
                ).toBeNull();
            }
        }
    });
});

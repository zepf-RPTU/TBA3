import { describe, it, expect, vi } from 'vitest';
import { ALL_DOMAINS } from '../../../src/sl/utils/slQueryPrimitives.js';
import {
    filterComparisons,
    filterBySubject,
    subjectNamesOf,
    narrowToSubjectDomain,
    normalizeTarget,
    sumRatio,
} from '../../../src/sl/utils/slQueryPrimitives.js';

/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/**
 * A payload value group carrying the fields a case sets; the identity the filters do not read is
 * filled in.
 * @param {Partial<CompetenceLevelsValueGroup>} fields
 * @returns {CompetenceLevelsValueGroup}
 */
const payloadValueGroup = (fields) => ({
    id: 'row',
    type: 'group',
    name: 'row',
    competenceLevels: [],
    ...fields,
});

/**
 * The primitives every SL query composes. Each has one rule a plausible rewrite would
 * collapse: which target shapes are equivalent, when a domain filter applies, and when a
 * fold answers "unknown" rather than zero.
 */

describe('normalizeTarget — one descriptor for every shape a target arrives in', () => {
    it('reads nothing, "school" and a school object as the school', () => {
        const school = { type: 'school', groupNames: [] };

        // A placeholder whose `group:current` cannot be resolved queries with `null`.
        expect(normalizeTarget()).toEqual(school);
        expect(normalizeTarget(null)).toEqual(school);
        expect(normalizeTarget('school')).toEqual(school);
        expect(normalizeTarget({ type: 'school', groupNames: [] })).toEqual(school);
    });

    it('reads a comparison object as that one population, across a second pass', () => {
        // The selection verbs hand normalised targets on to the share queries, so a
        // normalised target must survive a second pass unchanged.
        const once = normalizeTarget({ type: 'comparison', id: ' nw-gy ' });

        expect(once).toEqual({ type: 'comparison', groupNames: [], id: 'nw-gy' });
        expect(normalizeTarget(once)).toEqual(once);
    });

    it('has no target for every comparison at once', () => {
        // Two tracks, or a Landesschnitt beside a district average, are different
        // populations; pooling them yields a number no chart shows.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(normalizeTarget({ type: 'comparison' })).toBeNull();
        expect(normalizeTarget({ type: 'comparison', id: '  ' })).toBeNull();
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('reads a group name and a group-list descriptor as groups', () => {
        expect(normalizeTarget(' 8a ')).toEqual({ type: 'groups', groupNames: ['8a'] });
        expect(normalizeTarget({ type: 'groups', groupNames: ['8b', ' 8a ', '8b', ''] })).toEqual({
            type: 'groups',
            groupNames: ['8b', '8a'],
        });
    });

    it('answers null, and warns once naming the caller, for an unsupported shape', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(normalizeTarget('   ')).toBeNull();
        expect(normalizeTarget({ type: 'groups', groupNames: [] })).toBeNull();
        expect(normalizeTarget({ type: 'district' }, 'box-1')).toBeNull();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('normalizeTarget[box-1]');
    });
});

describe('filterComparisons — the value groups of one comparison population', () => {
    const valueGroups = [
        payloadValueGroup({ id: 'schule', type: 'school' }),
        payloadValueGroup({ id: 'gy', type: 'state', name: 'Landesschnitt GY' }),
        payloadValueGroup({ id: 'hs', type: 'state', name: 'Landesschnitt HS' }),
        payloadValueGroup({ id: 'bezirk', type: 'district', name: 'Bezirk' }),
        payloadValueGroup({ id: 'gy', type: 'group' }),
    ];

    it('keeps the comparison value groups of that id, whatever their type', () => {
        // The spec's `type` is open; a population the client has no name for is a
        // comparison all the same. A group that happens to share the id is not one.
        expect(filterComparisons(valueGroups, 'hs').map((valueGroup) => valueGroup.id)).toEqual([
            'hs',
        ]);
        expect(
            filterComparisons(valueGroups, 'bezirk').map((valueGroup) => valueGroup.type),
        ).toEqual(['district']);
        expect(filterComparisons(valueGroups, 'gy').map((valueGroup) => valueGroup.type)).toEqual([
            'state',
        ]);
        expect(filterComparisons(undefined, 'gy')).toEqual([]);
    });
});

describe('filterBySubject — a Fach, optionally one Domäne of it', () => {
    const valueGroups = [
        payloadValueGroup({ subject: { name: 'Deutsch' }, domain: { id: 'le', name: 'Lesen' } }),
        payloadValueGroup({ subject: { name: 'Deutsch' }, domain: { id: 'zh', name: 'Zh' } }),
        payloadValueGroup({ subject: { name: 'Deutsch' }, domain: undefined }),
        payloadValueGroup({ subject: { name: 'Mathematik' }, domain: { id: 'le', name: 'Lesen' } }),
    ];

    it('keeps the whole Fach when no domain is given', () => {
        expect(
            filterBySubject({ domainId: ALL_DOMAINS, valueGroups, subjectName: 'Deutsch' }),
        ).toHaveLength(3);
        expect(
            filterBySubject({ domainId: ALL_DOMAINS, valueGroups, subjectName: 'Physik' }),
        ).toEqual([]);
    });

    it('matches a literal null domain only against domain-less value groups', () => {
        expect(filterBySubject({ valueGroups, subjectName: 'Deutsch', domainId: null })).toEqual([
            valueGroups[2],
        ]);
        expect(filterBySubject({ valueGroups, subjectName: 'Deutsch', domainId: 'zh' })).toEqual([
            valueGroups[1],
        ]);
    });
});

describe('narrowToSubjectDomain — a Fach narrowed to one Domäne', () => {
    const split = [
        payloadValueGroup({
            subject: { name: 'Mathematik' },
            domain: { id: 'zo', name: 'Zahlen und Operationen' },
        }),
        payloadValueGroup({ subject: { name: 'Mathematik' }, domain: { id: 'gm', name: 'Gm' } }),
    ];

    it('infers the Domäne of a Fach without one and refuses to guess for a split Fach', () => {
        const whole = [payloadValueGroup({ subject: { name: 'Englisch' }, domain: undefined })];
        expect(
            narrowToSubjectDomain({
                domainId: ALL_DOMAINS,
                valueGroups: whole,
                subjectName: 'Englisch',
                caller: 'test',
            }),
        ).toEqual(whole);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(
            narrowToSubjectDomain({
                domainId: ALL_DOMAINS,
                valueGroups: split,
                subjectName: 'Mathematik',
                caller: 'test',
            }),
        ).toEqual([]);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it('reads null on an all-split Fach as the whole Fach only when asked to', () => {
        // Aggregations.json splits Mathematik into item domains while
        // competence-levels.json carries one domain-less value group; the Lösungsquote of the
        // whole Fach sums the split value groups, a competence share stays exact.
        /**
         * @param {boolean} [wholeSubjectWhenSplit] - Read `null` as the whole Fach.
         * @returns {CompetenceLevelsValueGroup[]} The value groups kept.
         */
        const narrow = (wholeSubjectWhenSplit) =>
            narrowToSubjectDomain({
                valueGroups: split,
                subjectName: 'Mathematik',
                domainId: null,
                wholeSubjectWhenSplit,
                caller: 'test',
            });
        expect(narrow(true)).toEqual(split);
        expect(narrow(false)).toEqual([]);
    });
});

describe('sumRatio — one ratio out of per-value-group counts', () => {
    it('sums numerators and denominators across value groups', () => {
        const valueGroups = [
            { matchedCount: 1, totalCount: 10 },
            { matchedCount: 5, totalCount: 10 },
        ];

        expect(sumRatio(valueGroups, (valueGroup) => valueGroup)).toBeCloseTo(0.3, 10);
    });

    it('answers null when no value group could express the question, and counts the value groups that could', () => {
        // A scale that cannot express the requested levels is unknown, not 0 %. One
        // covered value group is enough to answer, and the uncovered value groups still contribute their
        // denominators — they measured students, just not on those levels.
        const uncovered = [{ matchedCount: 0, totalCount: 10, covered: false }];
        const mixed = [...uncovered, { matchedCount: 5, totalCount: 10, covered: true }];

        expect(sumRatio(uncovered, (valueGroup) => valueGroup)).toBeNull();
        expect(sumRatio(mixed, (valueGroup) => valueGroup)).toBeCloseTo(0.25, 10);
    });

    it('answers a lone uncounted share, but never pools one', () => {
        // A Landesschnitt value group carries a share and no counts. On its own it is the
        // answer; pooled with other value groups nothing says how much it weighs, and an
        // unweighted mean of shares is not the counted rate it is compared with.
        expect(sumRatio([{ share: 0.56 }], (valueGroup) => valueGroup)).toBe(0.56);
        expect(sumRatio([{ share: 0.56 }, { share: 0.6 }], (valueGroup) => valueGroup)).toBeNull();
        expect(
            sumRatio(
                [{ share: 0.56 }, { matchedCount: 5, totalCount: 10 }],
                (valueGroup) => valueGroup,
            ),
        ).toBeNull();
        expect(
            sumRatio([{ share: 0.56 }, { share: 0.1, covered: false }], (valueGroup) => valueGroup),
        ).toBe(0.56);
    });

    it('answers null for nothing to sum, a zero denominator, or a missing counter', () => {
        expect(sumRatio([], (valueGroup) => valueGroup)).toBeNull();
        expect(
            sumRatio([{ matchedCount: 0, totalCount: 0 }], (valueGroup) => valueGroup),
        ).toBeNull();
        expect(sumRatio([{}], () => null)).toBeNull();
    });
});

describe('subjectNamesOf — the Fächer a set of value groups carries', () => {
    it('deduplicates, drops value groups without a Fach and keeps payload order', () => {
        const valueGroups = [
            payloadValueGroup({ subject: { name: 'Mathematik' } }),
            payloadValueGroup({ subject: { name: 'Deutsch' } }),
            payloadValueGroup({ subject: { name: 'Mathematik' } }),
            payloadValueGroup({ subject: undefined }),
        ];

        expect(subjectNamesOf(valueGroups)).toEqual(['Mathematik', 'Deutsch']);
        expect(subjectNamesOf(undefined)).toEqual([]);
    });
});

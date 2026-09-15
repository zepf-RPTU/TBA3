import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    filterStateRows,
    filterSubjectRows,
    getSubjectNamesFromRows,
    normalizeTarget,
    sumRatio,
} from '@tba3/modules/sl/utils/slQueryPrimitives.js';

/**
 * The primitives every SL query composes. Each has one rule a plausible rewrite would
 * collapse: which target shapes are equivalent, when a domain filter applies, and when a
 * fold answers "unknown" rather than zero.
 */

afterEach(() => {
    vi.restoreAllMocks();
});

describe('normalizeTarget — one descriptor for every shape a target arrives in', () => {
    it('reads nothing, "school" and a school object as the school', () => {
        const school = { type: 'school', classNames: [] };

        // A placeholder whose `class:current` cannot be resolved queries with `null`.
        expect(normalizeTarget()).toEqual(school);
        expect(normalizeTarget(null)).toEqual(school);
        expect(normalizeTarget('school')).toEqual(school);
        expect(normalizeTarget({ type: 'school', classNames: [] })).toEqual(school);
    });

    it('reads "state" as the Landesschnitt without ids', () => {
        expect(normalizeTarget('state')).toEqual({ type: 'state', classNames: [], ids: [] });
    });

    it('keeps a state object’s ids, trimmed and deduplicated, across a second pass', () => {
        // WHY: `ids` is what this function itself emits, so a normalised target must
        // survive a second pass — the selection verbs hand normalised targets on to the
        // share queries, and dropping the ids there widened them to every state row.
        const once = normalizeTarget({ type: 'state', ids: [' gy ', 'gy', 7, 'hs'] });

        expect(once).toEqual({ type: 'state', classNames: [], ids: ['gy', 'hs'] });
        expect(normalizeTarget(once)).toEqual(once);
    });

    it('reads a class name and a class-list descriptor as classes', () => {
        expect(normalizeTarget(' 8a ')).toEqual({ type: 'classes', classNames: ['8a'] });
        expect(
            normalizeTarget({ type: 'classes', classNames: ['8b', ' 8a ', '8b', '', 3] }),
        ).toEqual({ type: 'classes', classNames: ['8b', '8a'] });
    });

    it('answers null, and warns once naming the caller, for an unsupported shape', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(normalizeTarget('   ')).toBeNull();
        expect(normalizeTarget({ type: 'classes', classNames: [] })).toBeNull();
        expect(normalizeTarget({ type: 'district' }, 'box-1')).toBeNull();
        expect(normalizeTarget(42, 'box-1')).toBeNull();

        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[0][0]).toContain('InfoBoxModule[box-1]');
    });
});

describe('filterStateRows — the Landesschnitt rows a state target names', () => {
    const rows = [
        { id: 'schule', type: 'school' },
        { id: 'gy', type: 'state' },
        { id: 'hs', type: 'state' },
    ];

    it('keeps every state row when the target names no ids', () => {
        expect(filterStateRows(rows, { type: 'state' }).map((row) => row.id)).toEqual(['gy', 'hs']);
        expect(filterStateRows(rows, null).map((row) => row.id)).toEqual(['gy', 'hs']);
        expect(filterStateRows(undefined, null)).toEqual([]);
    });

    it('narrows to the named ids', () => {
        expect(filterStateRows(rows, { type: 'state', ids: ['hs'] }).map((row) => row.id)).toEqual([
            'hs',
        ]);
    });
});

describe('filterSubjectRows — a Fach, optionally one Domäne of it', () => {
    const rows = [
        { subject: { name: 'Deutsch' }, domain: { id: 'le' } },
        { subject: { name: 'Deutsch' }, domain: { id: 'zh' } },
        { subject: { name: 'Deutsch' }, domain: null },
        { subject: { name: 'Mathematik' }, domain: { id: 'le' } },
    ];

    it('keeps the whole Fach when no domain is given', () => {
        expect(filterSubjectRows({ rows, subjectName: 'Deutsch' })).toHaveLength(3);
        expect(filterSubjectRows({ rows, subjectName: 'Physik' })).toEqual([]);
        expect(filterSubjectRows({ rows: null, subjectName: 'Deutsch' })).toEqual([]);
    });

    it('matches a literal null domain only against domain-less rows', () => {
        expect(filterSubjectRows({ rows, subjectName: 'Deutsch', domainId: null })).toEqual([
            rows[2],
        ]);
        expect(filterSubjectRows({ rows, subjectName: 'Deutsch', domainId: 'zh' })).toEqual([
            rows[1],
        ]);
    });

    it('reads the domain through the given accessor', () => {
        const itemRows = [
            { subject: { name: 'Deutsch' }, domain: { id: null, name: 'le' } },
            { subject: { name: 'Deutsch' }, domain: { id: null, name: 'zh' } },
        ];

        expect(
            filterSubjectRows({
                rows: itemRows,
                subjectName: 'Deutsch',
                domainId: 'zh',
                getDomainId: (row) => row.domain.name,
            }),
        ).toEqual([itemRows[1]]);
    });
});

describe('sumRatio — one ratio out of per-row counts', () => {
    it('sums numerators and denominators across rows', () => {
        const rows = [
            { matchedCount: 1, totalCount: 10 },
            { matchedCount: 5, totalCount: 10 },
        ];

        expect(sumRatio(rows, (row) => row)).toBeCloseTo(0.3, 10);
    });

    it('answers null when no row could express the question, and counts the rows that could', () => {
        // WHY: a scale that cannot express the requested levels is unknown, not 0 %. One
        // covered row is enough to answer, and the uncovered rows still contribute their
        // denominators — they measured students, just not on those levels.
        const uncovered = [{ matchedCount: 0, totalCount: 10, covered: false }];
        const mixed = [...uncovered, { matchedCount: 5, totalCount: 10, covered: true }];

        expect(sumRatio(uncovered, (row) => row)).toBeNull();
        expect(sumRatio(mixed, (row) => row)).toBeCloseTo(0.25, 10);
    });

    it('answers null for nothing to sum, a zero denominator, or a missing counter', () => {
        expect(sumRatio([], (row) => row)).toBeNull();
        expect(sumRatio([{ matchedCount: 0, totalCount: 0 }], (row) => row)).toBeNull();
        expect(sumRatio([{}], () => null)).toBeNull();
        expect(sumRatio(null, (row) => row)).toBeNull();
        expect(
            sumRatio([{ matchedCount: 1, totalCount: 1 }], /** @type {any} */ (null)),
        ).toBeNull();
    });
});

describe('getSubjectNamesFromRows — the Fächer a row set carries', () => {
    it('deduplicates, drops blanks and sorts', () => {
        const rows = [
            { subject: { name: 'Mathematik' } },
            { subject: { name: 'Deutsch' } },
            { subject: { name: 'Mathematik' } },
            { subject: { name: ' ' } },
            { subject: null },
        ];

        expect(getSubjectNamesFromRows(rows)).toEqual(['Deutsch', 'Mathematik']);
        expect(getSubjectNamesFromRows(undefined)).toEqual([]);
    });
});

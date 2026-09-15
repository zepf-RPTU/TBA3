import { describe, it, expect } from 'vitest';
import {
    resolveActiveId,
    resolveDefaultStudentGroup,
    sortStudentsByName,
    STUDENT_GROUP,
} from '@tba3/modules/en/modules/enItemDetail/enItemDetailSelection.js';

/**
 * resolveActiveId decides which tab is active after the item detail panel's
 * selection set changes. The rules encode the UX contract:
 *   - selecting a new row must jump the panel to that row,
 *   - deselecting a non-active row must NOT move the panel,
 *   - deselecting the active row must fall back to something still selected.
 * A test that only checked "returns an id" wouldn't catch a regression that
 * broke any of those intents, so each case pins a specific intent.
 */
const item = (id) => ({ iqbId: id });

describe('resolveActiveId', () => {
    it('activates a newly-added item so selecting a new row switches to it', () => {
        // WHY: "when selecting a new row, switch to the newly selected item".
        const prev = [item('a')];
        const next = [item('a'), item('b')];
        expect(resolveActiveId(prev, next, 'a')).toBe('b');
    });

    it('activates the last of several newly-added items', () => {
        // WHY: if more than one item appears at once, the most recent wins —
        // consistent with single-add behaviour.
        const next = [item('a'), item('b'), item('c')];
        expect(resolveActiveId([], next, null)).toBe('c');
    });

    it('keeps the active item when an unrelated row is deselected', () => {
        // WHY: deselecting a different row must not yank the panel away from the
        // item the user is currently reading.
        const prev = [item('a'), item('b'), item('c')];
        const next = [item('a'), item('c')]; // 'b' removed, 'a' still active
        expect(resolveActiveId(prev, next, 'a')).toBe('a');
    });

    it('falls back to the last remaining item when the active one is deselected', () => {
        // WHY: the active tab vanished, so the panel must show a still-selected
        // item rather than an empty/stale detail.
        const prev = [item('a'), item('b')];
        const next = [item('a')]; // active 'b' removed
        expect(resolveActiveId(prev, next, 'b')).toBe('a');
    });

    it('returns null when the selection becomes empty', () => {
        // WHY: an empty set (e.g. filter reset) must clear the active item so the
        // panel shows its empty message.
        expect(resolveActiveId([item('a')], [], 'a')).toBeNull();
    });
});

/**
 * resolveDefaultStudentGroup decides which group the detail panel shows without
 * being asked: the teaching-relevant minority. On an easy item that is the few
 * who failed it; on a hard item the few who managed it. Encoded as "show the
 * smaller list", which is the 50% cut-off — so the boundary cases are what
 * actually matter here.
 */
describe('resolveDefaultStudentGroup', () => {
    it('shows the solvers when few students solved the item', () => {
        // WHY: hard item — the interesting information is who managed it.
        expect(resolveDefaultStudentGroup(3, 25)).toBe(STUDENT_GROUP.SOLVED);
    });

    it('shows the non-solvers when most students solved the item', () => {
        // WHY: easy item — the interesting information is who still needs help.
        expect(resolveDefaultStudentGroup(25, 3)).toBe(STUDENT_GROUP.UNSOLVED);
    });

    it('shows the solvers on an exact 50/50 split', () => {
        // WHY: pins the cut-off direction ("solved by at most half" → solvers), so
        // a later refactor cannot silently flip the tie.
        expect(resolveDefaultStudentGroup(14, 14)).toBe(STUDENT_GROUP.SOLVED);
    });

    it('still picks a group when both lists are empty', () => {
        // WHY: an item nobody was tested on must not leave the panel without a
        // group (the render path always needs one).
        expect(resolveDefaultStudentGroup(0, 0)).toBe(STUDENT_GROUP.SOLVED);
    });
});

/**
 * sortStudentsByName drives a name list teachers scan visually, so German
 * collation and a stable tiebreak are the point — not "it returns an array".
 */
describe('sortStudentsByName', () => {
    const student = (lastName, firstName) => ({ lastName, firstName });

    it('sorts umlauts as their base letter, not after Z', () => {
        // WHY: default (non-locale) comparison puts 'Ä' after 'Z', which reads as
        // a bug in a German name list.
        const sorted = sortStudentsByName([student('Bauer', 'Ann'), student('Ärger', 'Ben')]);
        expect(sorted.map((s) => s.lastName)).toEqual(['Ärger', 'Bauer']);
    });

    it('falls back to the first name for identical last names', () => {
        // WHY: siblings/namesakes must keep a deterministic order across renders.
        const sorted = sortStudentsByName([student('Müller', 'Zoe'), student('Müller', 'Ada')]);
        expect(sorted.map((s) => s.firstName)).toEqual(['Ada', 'Zoe']);
    });

    it('tolerates missing name parts instead of throwing', () => {
        // WHY: the panel falls back to the student id when names are absent; a
        // throw here would blank the whole detail panel.
        const sorted = sortStudentsByName([{ studentId: 'x' }, student('Abel', 'Ida')]);
        expect(sorted.map((s) => s.lastName ?? '')).toEqual(['', 'Abel']);
    });

    it('does not mutate the input array', () => {
        // WHY: the group arrays are shared across item records (built once per
        // aggregation payload), so sorting must not reorder them for others.
        const input = [student('Bauer', 'Ann'), student('Abel', 'Ida')];
        sortStudentsByName(input);
        expect(input.map((s) => s.lastName)).toEqual(['Bauer', 'Abel']);
    });
});

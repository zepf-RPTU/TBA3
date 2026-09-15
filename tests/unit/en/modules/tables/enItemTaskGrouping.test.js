import { beforeEach, describe, expect, it } from 'vitest';

import { groupItemsByTask } from '@tba3/modules/en/modules/tables/enItemTaskGrouping.js';
import { resetCompetenceLevelPalette } from '@tba3/modules/common/services/competenceLevelPalette.js';
import { registerStandardItemScales } from '../../../support/competenceScaleFixture.js';

// The Aufgabenniveau vocabulary is registered from `items.json`, not recognised by a regex,
// so the range below can only order its levels once the scale is loaded. A suite that
// skipped this would see every level as unorderable and the range collapse to `N/A`.
beforeEach(() => {
    resetCompetenceLevelPalette();
    registerStandardItemScales();
});

// WHY this file exists: 250 pure lines backing the item table's task mode had
// zero tests. The aggregates feed the lollipop chart and the dataTree parent
// rows, and the synthetic task identity is what D3 joins and the itemStore key
// on — none of which any e2e assertion pins.

const STYLE_CATEGORIES = [{ value: 'global' }, { value: 'detail' }];

function item(overrides = {}) {
    return {
        iqbId: 'i1',
        name: 'BM 01.1',
        exercise: { name: 'Exercise A' },
        domain: 'domain0',
        domainLabel: 'Hörverstehen',
        competenceLevel: 'A1.1',
        percentageCorrect: 60,
        percentageIncorrect: 30,
        percentageNotAttempted: 10,
        correctCount: 6,
        incorrectCount: 3,
        notAttemptedCount: 1,
        combinedStyles: [],
        ...overrides,
    };
}

describe('groupItemsByTask', () => {
    it('groups by exercise name in encounter order, one parent row per task', () => {
        const rows = groupItemsByTask(
            [
                item({ iqbId: 'a', exercise: { name: 'Zeta' } }),
                item({ iqbId: 'b', exercise: { name: 'Alpha' } }),
                item({ iqbId: 'c', exercise: { name: 'Zeta' } }),
            ],
            STYLE_CATEGORIES,
        );

        // WHY: encounter order is the booklet order — sorting alphabetically
        // here would reorder the table against the printed material.
        expect(rows.map((r) => r.exercise.name)).toEqual(['Zeta', 'Alpha']);
        expect(rows[0]._children.map((c) => c.iqbId)).toEqual(['a', 'c']);
        expect(rows[0].itemCount).toBe(2);
        expect(rows[0].isTaskRow).toBe(true);
    });

    it('gives the parent row a stable synthetic id reused as iqbId', () => {
        // WHY: the lollipop chart D3-joins on iqbId and the itemStore keys on
        // it; an id that changed across re-renders would break both silently.
        const build = () => groupItemsByTask([item()], STYLE_CATEGORIES)[0];

        expect(build().taskId).toBe('task::Exercise A::domain0');
        expect(build().iqbId).toBe(build().taskId);
    });

    it('averages percentages (parsing "%"-strings) and sums counts', () => {
        const [row] = groupItemsByTask(
            [
                item({ percentageCorrect: 80, correctCount: 8 }),
                item({ iqbId: 'i2', percentageCorrect: '40%', correctCount: 4 }),
            ],
            STYLE_CATEGORIES,
        );

        // WHY: averaging (not re-deriving from summed counts) is the chosen
        // aggregation — each item weighs equally regardless of attempt counts —
        // and legacy rows still carry percentage strings.
        expect(row.percentageCorrect).toBe(60);
        expect(row.correctCount).toBe(12);
    });

    it('renders the competence level as a range on the item scale, or a single level when all agree', () => {
        // WHY: the payload sends item levels as `nameShort` strings (`A2.1`, never `3`), and
        // the range has to order them by the item scale — `A1.1 < A2.1 < B2.1` — not by
        // string or number. Values that are not item levels stay out of the range.
        const [range] = groupItemsByTask(
            [
                item({ competenceLevel: 'A2.1' }),
                item({ iqbId: 'i2', competenceLevel: 'B2.1' }),
                item({ iqbId: 'i3', competenceLevel: 'A1.1' }),
                item({ iqbId: 'i4', competenceLevel: 'kaputt' }),
            ],
            STYLE_CATEGORIES,
        );
        const [single] = groupItemsByTask([item({ competenceLevel: 'A2.1' })], STYLE_CATEGORIES);
        const [none] = groupItemsByTask([item({ competenceLevel: 'kaputt' })], STYLE_CATEGORIES);

        expect(range.competenceLevel).toBe('A1.1–B2.1');
        expect(range.competenceLevelsRaw).toEqual(['A1.1', 'A2.1', 'B2.1']);
        expect(single.competenceLevel).toBe('A2.1');
        expect(none.competenceLevel).toBe('N/A');
    });

    it('unions the child styles, priority-sorted, unknown styles last', () => {
        // Un-enriched rows (no combinedStyles key) fall back to their raw
        // `style` array; an enriched-but-empty combinedStyles does NOT fall
        // back — enrichment already decided the row has no styles.
        const [row] = groupItemsByTask(
            [
                item({ combinedStyles: ['detail'] }),
                item({ iqbId: 'i2', combinedStyles: undefined, style: ['unknown', 'global'] }),
            ],
            STYLE_CATEGORIES,
        );

        expect(row.combinedStyles).toEqual(['global', 'detail', 'unknown']);
        expect(row.primaryStyle).toBe('global');
    });

    it('extracts the shared task prefix as the parent name, with a common-prefix fallback', () => {
        const [numbered] = groupItemsByTask(
            [item({ name: 'BM 01.1' }), item({ iqbId: 'i2', name: 'BM 01.9' })],
            STYLE_CATEGORIES,
        );
        const [fallback] = groupItemsByTask(
            [item({ name: 'Task A.1' }), item({ iqbId: 'i2', name: 'Task A.2' })],
            STYLE_CATEGORIES,
        );

        expect(numbered.name).toBe('BM 01');
        expect(fallback.name).toBe('Task A');
    });

    it('averages only the items that have a share, and carries the mean the lollipop draws', () => {
        // WHY: an item without responses has no share. Counted as 0 % it dragged the
        // task's bar down. The lollipop's stem reads `meanPercentage`, so a task row
        // without one would draw no stem at all.
        const [row] = groupItemsByTask(
            [
                item({ percentageCorrect: 80, meanPercentage: 70 }),
                item({ iqbId: 'i2', percentageCorrect: null, meanPercentage: 50 }),
            ],
            STYLE_CATEGORIES,
        );

        expect(row.percentageCorrect).toBe(80);
        expect(row.meanPercentage).toBe(60);
    });

    it('returns an empty array for missing input', () => {
        expect(groupItemsByTask([], STYLE_CATEGORIES)).toEqual([]);
        expect(groupItemsByTask(null, STYLE_CATEGORIES)).toEqual([]);
    });
});

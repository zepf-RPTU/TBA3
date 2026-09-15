/**
 * MA task-ring grid derivation.
 *
 * The ring grid must show one ring per Leitidee the booklet declares — including a
 * Leitidee that carries no tasks, which renders as an empty placeholder ring rather
 * than disappearing. These tests lock that the grid stays complete, that an empty
 * Leitidee is never the default selection (it would open the focus chart and item
 * table on zero tasks), and that the layout adapts to any number of Leitideen.
 */

import { describe, it, expect } from 'vitest';
import {
    getTaskRingChartDefinitions,
    resolveDefaultDomain,
    calculateFlexLayout,
    RING_SIZE_MIN,
    RING_SIZE_MAX,
} from '@tba3/modules/ma/modules/charts/taskRing/taskRingGridLayout.js';
import { buildLastRowCenteringRules } from '@tba3/modules/ma/modules/charts/taskRing/taskRingGridStyleSheet.js';
import {
    getTaskRingFontSizeForRing,
    getTaskRingVerticalOverhead,
} from '@tba3/modules/ma/modules/charts/taskRing/taskRingTitleMetrics.js';

// 3 items across 2 populated domains (zo: 2, gm: 1); 'rf' is declared but empty.
const itemArray = [
    { iqbId: 'i1', domain: 'zo', competenceLevel: 'II', percentageCorrect: 50 },
    { iqbId: 'i2', domain: 'zo', competenceLevel: 'III', percentageCorrect: 100 },
    { iqbId: 'i3', domain: 'gm', competenceLevel: 'II', percentageCorrect: 0 },
];

const domains = [
    { domain: 'zo', domainLabel: 'Zahlen und Operationen' },
    { domain: 'gm', domainLabel: 'Größen und Messen' },
    { domain: 'rf', domainLabel: 'Raum und Form' }, // declared, no items
];

/** n domains named d0..d(n-1). */
function makeDomains(count) {
    return Array.from({ length: count }, (_, i) => ({
        domain: `d${i}`,
        domainLabel: `Leitidee ${i}`,
    }));
}

describe('getTaskRingChartDefinitions', () => {
    const chartDefs = getTaskRingChartDefinitions(domains, itemArray);

    it('puts the whole-booklet "Gesamt" ring first', () => {
        expect(chartDefs[0]).toMatchObject({
            id: 'overall',
            domain: null,
            title: 'Gesamt',
            isEmpty: false,
        });
    });

    it('keeps a ring for a Leitidee without tasks, flagged empty', () => {
        // The ring is drawn as an empty placeholder: a Leitidee the booklet declares
        // but does not test is information, not an omission — dropping it would leave
        // a hole in the grid and hide that the Leitidee was considered at all.
        expect(chartDefs.map((def) => def.id)).toEqual(['overall', 'zo', 'gm', 'rf']);
        expect(chartDefs.find((def) => def.id === 'rf')).toMatchObject({
            domain: 'rf',
            title: 'Raum und Form',
            isEmpty: true,
        });
    });

    it('marks Leitideen that carry tasks as populated', () => {
        expect(chartDefs.find((def) => def.id === 'zo')).toMatchObject({
            title: 'Zahlen und Operationen',
            isEmpty: false,
        });
        expect(chartDefs.find((def) => def.id === 'gm')).toMatchObject({ isEmpty: false });
    });

    it('titles a Leitidee the payload leaves unnamed by its id', () => {
        // WHY: `domain.name` is optional in the spec. Without it the ring showed the
        // placeholder "Aufgabenverteilung & Erfolgsrate", a title no Leitidee has; the id
        // at least tells the rings apart.
        const [, unnamed] = getTaskRingChartDefinitions(
            [{ domain: 'zo', domainLabel: '' }],
            itemArray,
        );

        expect(unnamed).toMatchObject({ id: 'zo', title: 'zo' });
    });

    it.each([3, 5, 7])('emits Gesamt + every Leitidee for a booklet with %i of them', (count) => {
        // The Leitidee count is not fixed at 5 — the grid must not assume it.
        expect(getTaskRingChartDefinitions(makeDomains(count), itemArray)).toHaveLength(count + 1);
    });
});

describe('resolveDefaultDomain', () => {
    const chartDefs = getTaskRingChartDefinitions(domains, itemArray);

    it('selects the first Leitidee that carries tasks', () => {
        expect(resolveDefaultDomain(chartDefs, null)).toBe('zo');
    });

    it('never selects an empty Leitidee, even when it was the previous selection', () => {
        // Selecting it would drive the focus chart and the item table to zero tasks.
        expect(resolveDefaultDomain(chartDefs, 'rf')).toBe('zo');
    });

    it('keeps a still-populated current selection', () => {
        expect(resolveDefaultDomain(chartDefs, 'gm')).toBe('gm');
    });

    it('selects nothing when no Leitidee carries tasks', () => {
        expect(resolveDefaultDomain(getTaskRingChartDefinitions(domains, []), null)).toBeNull();
    });
});

describe('calculateFlexLayout', () => {
    // The app's --layout-gap is 8px and .chart-container pads each ring by 12px.
    const GAP = 8;
    const MARGIN = 5;
    const PAD = 12;
    const layoutFor = (width, height, chartCount) =>
        calculateFlexLayout(width, height, GAP, GAP, chartCount);

    /** Largest ring circle a given column count could hold, ignoring the size bounds. */
    const unboundedDiameter = (width, height, count, cols, fontSize = 16) => {
        const rows = Math.ceil(count / cols);
        const overheadX = 2 * PAD;
        const overheadY = overheadX + getTaskRingVerticalOverhead(fontSize, 2);
        return Math.floor(
            Math.min(
                (width - 2 * MARGIN - (cols - 1) * GAP) / cols - overheadX,
                (height - 2 * MARGIN - (rows - 1) * GAP) / rows - overheadY,
            ),
        );
    };

    /** Cells in the last row that carry no ring. */
    const lastRowDeficit = ({ estimatedCols, estimatedRows }, count) =>
        estimatedCols - (count - estimatedCols * (estimatedRows - 1));

    it('sizes the cell from the ring it carries, not the other way round', () => {
        // The whole point: a cell holds ring + title, so it is taller than it is wide. Forcing
        // it square would steal the title's height from the ring and waste the spare width.
        const { ringWidth, ringHeight, ringDiameter } = layoutFor(900, 600, 6);

        expect(ringHeight).toBeGreaterThan(ringWidth);
        expect(ringWidth).toBeGreaterThanOrEqual(ringDiameter); // ring + horizontal padding
        expect(ringWidth - ringDiameter).toBeLessThanOrEqual(2 * PAD);
    });

    it('keeps the established 3x2 / 2x3 arrangement for Gesamt + 5 Leitideen', () => {
        // Regression guard: this is the layout the grid shipped with when 6 rings were hard-coded.
        expect(layoutFor(900, 600, 6)).toMatchObject({ estimatedCols: 3, estimatedRows: 2 });
        expect(layoutFor(600, 900, 6)).toMatchObject({ estimatedCols: 2, estimatedRows: 3 });
    });

    it('adapts to fewer and more rings than the former fixed six', () => {
        expect(layoutFor(900, 600, 4)).toMatchObject({ estimatedCols: 2, estimatedRows: 2 });
        expect(layoutFor(900, 600, 1)).toMatchObject({ estimatedCols: 1, estimatedRows: 1 });
    });

    it.each([2, 4, 6, 7, 9])(
        'fits all %i rings, with a ring as large as any alternative allows',
        (count) => {
            const layout = layoutFor(900, 600, count);
            expect(layout.estimatedCols * layout.estimatedRows).toBeGreaterThanOrEqual(count);

            // No other column count would yield a larger ring. The cap binding is a deliberate
            // ceiling, not a worse fit.
            for (let cols = 1; cols <= count; cols++) {
                const alternative = unboundedDiameter(900, 600, count, cols, layout.fontSize);
                expect(layout.ringDiameter).toBeGreaterThanOrEqual(
                    Math.min(alternative, RING_SIZE_MAX),
                );
            }
        },
    );

    it('caps the ring when few Leitideen sit in a large container', () => {
        // A 2-ring booklet must not render half-metre rings just because it can.
        const layout = layoutFor(2000, 1400, 2);
        expect(unboundedDiameter(2000, 1400, 2, 2)).toBeGreaterThan(RING_SIZE_MAX);
        expect(layout.ringDiameter).toBe(RING_SIZE_MAX);
        expect(layout).toMatchObject({ estimatedCols: 2, estimatedRows: 1, wrapMode: false });
    });

    it('wraps and scrolls instead of shrinking rings below the legibility floor', () => {
        // Rings that fit but cannot be read are worse than rings the user has to scroll to:
        // the grid pins them at the floor and grows downwards out of the container.
        const layout = layoutFor(400, 300, 9);
        expect(unboundedDiameter(400, 300, 9, 3)).toBeLessThan(RING_SIZE_MIN);
        expect(layout.wrapMode).toBe(true);
        expect(layout.ringDiameter).toBe(RING_SIZE_MIN);
        expect(layout.estimatedCols * layout.estimatedRows).toBeGreaterThanOrEqual(9);
    });

    it('drives wrap-mode columns from the width alone, so losing height only adds rows', () => {
        // This is what makes the overflow a scroll rather than a reflow thrash: shrinking the
        // container vertically must not re-column the grid.
        const roomy = layoutFor(400, 300, 9);
        const squashed = layoutFor(400, 150, 9);

        expect(squashed.wrapMode).toBe(true);
        expect(squashed.estimatedCols).toBe(roomy.estimatedCols);
        expect(squashed.estimatedRows).toBe(roomy.estimatedRows);
    });

    it('never overflows sideways, even when one minimum ring is wider than the container', () => {
        const layout = layoutFor(100, 300, 6);
        expect(layout).toMatchObject({ wrapMode: true, estimatedCols: 1 });
        expect(layout.ringWidth).toBeLessThanOrEqual(100 - 2 * MARGIN);
    });

    it.each([
        [900, 600, 6],
        [900, 600, 5],
        [900, 600, 7],
        [600, 900, 6],
        [2000, 1400, 2],
        [400, 300, 9],
        [0, 0, 6],
    ])('keeps the cell pitch even at %ix%i with %i rings', (width, height, count) => {
        // The half-pitch offset that centres a partial last row must land on a whole pixel;
        // a .5px translate blurs that row's rings and text, and only that row.
        const { ringWidth, columnGap } = layoutFor(width, height, count);
        expect((ringWidth + columnGap) % 2).toBe(0);
    });

    it.each([
        [5, 1],
        [7, 1],
        [6, 0],
        [9, 1],
    ])('%i rings leave %i empty cell(s) in the last row', (count, expected) => {
        // A partial last row gets centred; a full one must emit no centring rules at all.
        // Roomy container on purpose: this is about the deficit, not about the floor.
        expect(lastRowDeficit(layoutFor(1600, 1000, count), count)).toBe(expected);
    });

    it('gives the freed line of height back to the rings when titles fit on one line', () => {
        // Reserving two title lines for a booklet whose Leitidee names are short would shrink
        // every ring for nothing.
        const twoLines = calculateFlexLayout(900, 600, GAP, GAP, 6, { titleLineCount: 2 });
        const oneLine = calculateFlexLayout(900, 600, GAP, GAP, 6, { titleLineCount: 1 });

        expect(oneLine.ringDiameter).toBeGreaterThan(twoLines.ringDiameter);
        expect(oneLine.ringHeight).toBeLessThan(
            oneLine.ringDiameter + 2 * PAD + twoLines.fontSize * 2,
        );
    });

    it('collapses to nothing rather than a cell of pure padding', () => {
        expect(layoutFor(0, 0, 6)).toMatchObject({ ringWidth: 0, ringHeight: 0, ringDiameter: 0 });
    });
});

describe('buildLastRowCenteringRules', () => {
    // A partial last row would otherwise sit left-aligned in its tracks with a hole on the
    // right. Current data always yields 6 rings, whose column count is always a divisor of 6,
    // so this path only runs once the Leitidee count changes — these are its only guard.
    const layout = { estimatedCols: 3, estimatedRows: 2, ringWidth: 290, columnGap: 8 };

    it('shifts an odd shortfall by half a cell, which grid tracks cannot express', () => {
        // 5 rings in 3 columns: the last row holds 2, so it must start in column 1 and move
        // half a cell right to sit centred under the row above.
        const css = buildLastRowCenteringRules('lc', layout, 5);

        expect(css).toContain('nth-child(4)'); // first item of the last row
        expect(css).toContain('grid-column-start: 1');
        expect(css).toContain('translateX(149px)'); // (290 + 8) / 2, a whole pixel
    });

    it('uses whole tracks alone when the shortfall is even', () => {
        // 4 rings in 3 columns: the single last-row ring centres exactly on column 2.
        const css = buildLastRowCenteringRules('lc', layout, 4);

        expect(css).toContain('grid-column-start: 2');
        expect(css).not.toContain('translateX');
    });

    it('emits nothing when the last row is full', () => {
        // No dead selectors, and no chance of an off-by-one nudging a complete grid.
        expect(buildLastRowCenteringRules('lc', layout, 6).trim()).toBe('');
    });

    it('anchors the shift to the real last row for a taller grid', () => {
        const tall = { estimatedCols: 4, estimatedRows: 3, ringWidth: 200, columnGap: 8 };
        // 10 rings over 4 columns: rows of 4, 4, 2 — the last row starts at item 9.
        const css = buildLastRowCenteringRules('lc', tall, 10);

        expect(css).toContain('nth-child(9)');
        expect(css).toContain('grid-column-start: 2');
    });
});

describe('getTaskRingFontSizeForRing', () => {
    it('leaves the token size untouched at the ring sizes the app renders today', () => {
        // Text scaling must not restyle the existing dashboards: the overview (~290px) and the
        // chart-only view (~390px) both stay at the 16px token.
        expect(getTaskRingFontSizeForRing(290)).toBe(16);
        expect(getTaskRingFontSizeForRing(390)).toBe(16);
    });

    it('scales the text down with the ring below the knee', () => {
        // Otherwise a shrinking ring keeps 16px labels and they collide in the inner band.
        expect(getTaskRingFontSizeForRing(RING_SIZE_MIN)).toBeCloseTo(15, 5);
        expect(getTaskRingFontSizeForRing(160)).toBeCloseTo(12, 5);
    });

    it('floors the text so it never becomes unrenderable', () => {
        expect(getTaskRingFontSizeForRing(100)).toBe(11);
        expect(getTaskRingFontSizeForRing(0)).toBe(16);
    });
});

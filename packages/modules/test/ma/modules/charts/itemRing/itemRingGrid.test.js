// The ring grid's layout and its partial last row.

import { describe, it, expect } from 'vitest';
import { lastRowPlacement } from '../../../../../src/ma/modules/charts/itemRing/itemRingGridLayout.js';
import { calculateFlexLayout } from '../../../../../src/ma/modules/charts/itemRing/itemRingFlexLayout.js';
import { getItemRingVerticalOverhead } from '../../../../../src/ma/modules/charts/itemRing/itemRingTitleMetrics.js';
import { RING_REACH } from '../../../../../src/ma/modules/charts/itemRing/itemRingGeometry.js';

describe('calculateFlexLayout', () => {
    // The app's --layout-gap is 8px and .chart-container pads each ring by 12px.
    const GAP_PX = 8;
    const MARGIN_PX = 5;
    const PAD_PX = 12;
    // The ring-size bounds, restated so a change to them fails here: below 180px the
    // level labels no longer fit the inner band, and 380px caps a sparse booklet's rings.
    const RING_SIZE_MIN = 180;
    const RING_SIZE_MAX = 380;
    /**
     * @param {number} width
     * @param {number} height
     * @param {number} chartCount
     * @returns {ReturnType<typeof calculateFlexLayout>}
     */
    const layoutFor = (width, height, chartCount) =>
        calculateFlexLayout(width, height, GAP_PX, GAP_PX, chartCount, {
            cellPadding: PAD_PX,
            titleLineCount: 2,
        });

    /**
     * Largest ring circle a given column count could hold, its icons' reach included, ignoring the size bounds.
     * @param {number} width
     * @param {number} height
     * @param {number} count
     * @param {number} cols
     * @param {number} [fontSize] - The title font size.
     * @returns {number}
     */
    const unboundedDiameter = (width, height, count, cols, fontSize = 16) => {
        const rows = Math.ceil(count / cols);
        const overheadX = 2 * PAD_PX;
        const overheadY = overheadX + getItemRingVerticalOverhead(fontSize, 2);
        return Math.floor(
            Math.min(
                (width - 2 * MARGIN_PX - (cols - 1) * GAP_PX) / cols - overheadX,
                (height - 2 * MARGIN_PX - (rows - 1) * GAP_PX) / rows - overheadY,
            ) / RING_REACH,
        );
    };

    /**
     * Cells in the last row that carry no ring.
     * @param {{estimatedCols: number, estimatedRows: number}} layout
     * @param {number} count
     * @returns {number}
     */
    const lastRowDeficit = ({ estimatedCols, estimatedRows }, count) =>
        estimatedCols - (count - estimatedCols * (estimatedRows - 1));

    it('sizes the cell from the ring it carries, not the other way round', () => {
        // A cell holds ring + title, so it is taller than it is wide. Forcing it square
        // would take the title's height from the ring and waste the spare width.
        const { cellWidthPx, cellHeightPx, ringDiameter } = layoutFor(900, 600, 6);

        expect(cellHeightPx).toBeGreaterThan(cellWidthPx);
        // Ring plus the reach of its tick icons, plus horizontal padding.
        expect(cellWidthPx).toBeGreaterThanOrEqual(ringDiameter * RING_REACH);
        expect(cellWidthPx - ringDiameter * RING_REACH).toBeLessThanOrEqual(2 * PAD_PX + 1);
    });

    it('keeps the established 3x2 / 2x3 arrangement for Gesamt + 5 Leitideen', () => {
        expect(layoutFor(900, 600, 6)).toMatchObject({ estimatedCols: 3, estimatedRows: 2 });
        expect(layoutFor(600, 900, 6)).toMatchObject({ estimatedCols: 2, estimatedRows: 3 });
    });

    it('adapts to fewer and more rings than the former fixed six', () => {
        // Roomy enough that four rings stay above the legibility floor.
        expect(layoutFor(1000, 700, 4)).toMatchObject({
            estimatedCols: 2,
            estimatedRows: 2,
            wrapMode: false,
        });
        expect(layoutFor(900, 600, 1)).toMatchObject({ estimatedCols: 1, estimatedRows: 1 });
    });

    it.each([2, 4, 6, 7, 9])(
        'fits all %i rings, with a ring as large as any alternative allows',
        (count) => {
            const layout = layoutFor(900, 600, count);
            expect(layout.estimatedCols * layout.estimatedRows).toBeGreaterThanOrEqual(count);

            // No other column count yields a larger ring; a binding cap is a ceiling, not
            // a worse fit.
            for (let cols = 1; cols <= count; cols++) {
                const alternative = unboundedDiameter(900, 600, count, cols, layout.fontSize);
                expect(layout.ringDiameter).toBeGreaterThanOrEqual(
                    Math.min(alternative, RING_SIZE_MAX),
                );
            }
        },
    );

    it('caps the ring when few Leitideen sit in a large container', () => {
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
        // Shrinking the container vertically must not re-column the grid, or the overflow
        // would reflow instead of scroll.
        const roomy = layoutFor(400, 300, 9);
        const squashed = layoutFor(400, 150, 9);

        expect(squashed.wrapMode).toBe(true);
        expect(squashed.estimatedCols).toBe(roomy.estimatedCols);
        expect(squashed.estimatedRows).toBe(roomy.estimatedRows);
    });

    it('never overflows sideways, even when one minimum ring is wider than the container', () => {
        const layout = layoutFor(100, 300, 6);
        expect(layout).toMatchObject({ wrapMode: true, estimatedCols: 1 });
        expect(layout.cellWidthPx).toBeLessThanOrEqual(100 - 2 * MARGIN_PX);
    });

    // Wide enough for four minimum rings, too low for any ring above the floor: wrap mode.
    const FOUR_MIN_RINGS_WIDE = Math.ceil(
        2 * MARGIN_PX + 4 * (RING_SIZE_MIN * RING_REACH + 2 * PAD_PX) + 3 * GAP_PX,
    );

    it.each([
        [900, 600, 6],
        [600, 900, 6],
        [900, 600, 7],
        [400, 300, 9],
        [FOUR_MIN_RINGS_WIDE, 550, 6],
        [FOUR_MIN_RINGS_WIDE, 550, 10],
    ])('fills its rows evenly at %ix%i with %i rings', (width, height, count) => {
        // Room for four columns must not stand six rings 4 + 2 when 3 + 3 takes as many rows.
        const { estimatedCols, estimatedRows } = layoutFor(width, height, count);
        expect(estimatedCols).toBe(Math.ceil(count / estimatedRows));
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
        const { cellWidthPx, columnGap } = layoutFor(width, height, count);
        expect((cellWidthPx + columnGap) % 2).toBe(0);
    });

    it.each([
        [5, 1],
        [7, 1],
        [6, 0],
        [9, 1],
    ])('%i rings leave %i empty cell(s) in the last row', (count, expected) => {
        // A partial last row gets centred; a full one must emit no centring rules. The
        // container is roomy so the size floor does not interfere.
        expect(lastRowDeficit(layoutFor(1600, 1000, count), count)).toBe(expected);
    });

    it('gives the freed line of height back to the rings when titles fit on one line', () => {
        // Reserving two title lines for a booklet whose Leitidee names are short would shrink
        // every ring for nothing.
        const twoLines = calculateFlexLayout(900, 660, GAP_PX, GAP_PX, 6, {
            cellPadding: PAD_PX,
            titleLineCount: 2,
        });
        const oneLine = calculateFlexLayout(900, 660, GAP_PX, GAP_PX, 6, {
            cellPadding: PAD_PX,
            titleLineCount: 1,
        });

        expect(oneLine.ringDiameter).toBeGreaterThan(twoLines.ringDiameter);
        const overhead = (/** @type {typeof oneLine} */ layout) =>
            layout.cellHeightPx - layout.ringDiameter * RING_REACH;
        expect(overhead(oneLine)).toBeLessThan(overhead(twoLines));
    });

    it('collapses to nothing rather than a cell of pure padding', () => {
        expect(layoutFor(0, 0, 6)).toMatchObject({
            cellWidthPx: 0,
            cellHeightPx: 0,
            ringDiameter: 0,
        });
    });
});

describe('lastRowPlacement', () => {
    // A partial last row would otherwise sit left-aligned with a hole on the right. The
    // demo fixtures' Leitidee grouping yields 6 rings, which always fill their rows, so
    // these tests are what runs this path for it.

    it('shifts an odd shortfall by half a cell, which grid tracks cannot express', () => {
        // 5 rings in 3 columns: the last row holds 2, so it must start in column 1 and move
        // half a cell right to sit centred under the row above.
        expect(lastRowPlacement(5, 3)).toEqual({
            firstIndex: 3,
            columnStart: 1,
            halfCellShift: true,
        });
    });

    it('uses whole tracks alone when the shortfall is even', () => {
        // 4 rings in 3 columns: the single last-row ring centres exactly on column 2.
        expect(lastRowPlacement(4, 3)).toEqual({
            firstIndex: 3,
            columnStart: 2,
            halfCellShift: false,
        });
    });

    it('places nothing when the last row is full', () => {
        expect(lastRowPlacement(6, 3)).toBeNull();
        expect(lastRowPlacement(6, 6)).toBeNull();
    });

    it('anchors the placement to the real last row for a taller grid', () => {
        // 10 rings over 4 columns: rows of 4, 4, 2 — the last row starts at ring 9.
        expect(lastRowPlacement(10, 4)).toEqual({
            firstIndex: 8,
            columnStart: 2,
            halfCellShift: false,
        });
    });
});

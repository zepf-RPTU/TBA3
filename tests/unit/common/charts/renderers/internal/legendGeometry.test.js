/**
 * resolveLegendGeometry — the single legend geometry authority.
 *
 * measureLegendSize returns `.size` and createLegend draws at
 * `.anchor`/`.itemPositions`, so these tables pin both at once. The property
 * "rendered extent fits inside the measured size" is the contract that used to
 * break when measure and render each interpreted the 12-key layout config with
 * their own formulas (vertical height off by half a row, distribute-gate
 * mismatch, last plain-horizontal item wider than its spacing slot).
 *
 * Node environment: the resolver is pure; text measurement is a scripted
 * adapter (10px per character, 12px bold surcharge per character, height 12).
 */
import { describe, expect, it } from 'vitest';
import {
    LEGEND_DEFAULTS,
    estimateLegendItemWidth,
    resolveLegendGeometry,
} from '@tba3/modules/common/charts/renderers/internal/svgLegendLayout.js';

const FONT_SIZE = 12;

function scriptedMeasureText(text, options = {}) {
    const perChar = options.fontWeight === 'bold' ? 12 : 10;
    return { width: String(text).length * perChar, height: 12 };
}

function resolve(config, slot = null) {
    return resolveLegendGeometry(config, {
        measureText: scriptedMeasureText,
        fontSize: FONT_SIZE,
        slot,
    });
}

function items(...labels) {
    return labels.map((label) => ({ label }));
}

/** Rendered horizontal extent: the furthest right edge any item content reaches. */
function renderedWidth(config, geometry) {
    const symbolTextGap =
        config.layout?.symbolTextGap ??
        LEGEND_DEFAULTS.symbolTextGap[
            config.layout?.direction === 'vertical' ? 'vertical' : 'horizontal'
        ];
    return Math.max(
        ...config.items.map(
            (item, i) =>
                geometry.itemPositions[i].x +
                estimateLegendItemWidth(item, {
                    symbolTextGap,
                    textWidth: scriptedMeasureText(item.label).width,
                }),
        ),
    );
}

describe('resolveLegendGeometry', () => {
    it('lays out a plain horizontal legend at fixed spacing, sized to the last item content', () => {
        const config = { items: items('Aaaa', 'Bb', 'Cc') };
        const geometry = resolve(config);

        expect(geometry.itemPositions.map((p) => p.x)).toEqual([0, 120, 240]);
        expect(geometry.itemPositions.every((p) => p.y === 0)).toBe(true);
        // Extent ends after the last item's content (symbol anchor 6 + text gap 12 + 2 chars).
        expect(geometry.size).toEqual({ width: 240 + 6 + 12 + 20, height: 12 });
        expect(renderedWidth(config, geometry)).toBeLessThanOrEqual(geometry.size.width);
    });

    it('lays out a vertical legend with the render-side height (rows at row*spacing plus one line)', () => {
        const config = { items: items('Aaaa', 'Bb', 'Cc'), layout: { direction: 'vertical' } };
        const geometry = resolve(config);

        expect(geometry.itemPositions.map((p) => p.y)).toEqual([0, 25, 50]);
        expect(geometry.size.height).toBe(2 * 25 + FONT_SIZE);
        // Column width: symbol 12 + gap 15 + widest label (4 chars).
        expect(geometry.size.width).toBe(12 + 15 + 40);
        expect(renderedWidth(config, geometry)).toBeLessThanOrEqual(geometry.size.width);
    });

    it('splits a multi-column vertical legend into balanced columns', () => {
        const config = {
            items: items('Aa', 'Bb', 'Cc', 'Dd', 'Ee'),
            layout: { direction: 'vertical', columns: 2 },
        };
        const geometry = resolve(config);

        const colWidth = 12 + 15 + 20 + LEGEND_DEFAULTS.columnGap;
        expect(geometry.itemPositions.slice(0, 3).map((p) => p.x)).toEqual([0, 0, 0]);
        expect(geometry.itemPositions.slice(3).map((p) => p.x)).toEqual([colWidth, colWidth]);
        expect(geometry.itemPositions.map((p) => p.y)).toEqual([0, 25, 50, 0, 25]);
        // 3 rows → 2*spacing + one text line.
        expect(geometry.size.height).toBe(2 * 25 + FONT_SIZE);
        expect(geometry.size.width).toBe(2 * (12 + 15 + 20) + LEGEND_DEFAULTS.columnGap);
    });

    it('distributes items across equal slots when (and only when) the render gate is met', () => {
        const distributed = resolve({
            items: items('Aa', 'Bb', 'Cc'),
            layout: { direction: 'horizontal', distributeItems: true, distributeInWidth: 300 },
        });
        expect(distributed.size.width).toBe(300);
        // Each item centered in its 100px slot, plus the symbol anchor offset (6).
        const itemWidth = 6 + 12 + 20;
        const centering = (100 - itemWidth) / 2;
        expect(distributed.itemPositions.map((p) => p.x)).toEqual([
            centering + 6,
            100 + centering + 6,
            200 + centering + 6,
        ]);

        // Gate parity: distributeInWidth WITHOUT distributeItems renders at fixed
        // spacing — measurement must say the same, not reserve the distribute width.
        const notDistributed = resolve({
            items: items('Aa', 'Bb', 'Cc'),
            layout: { direction: 'horizontal', distributeInWidth: 300 },
        });
        expect(notDistributed.itemPositions.map((p) => p.x)).toEqual([0, 120, 240]);
        expect(notDistributed.size.width).not.toBe(300);
        expect(notDistributed.size.width).toBe(240 + itemWidth);
    });

    it('reserves the title line and never measures narrower than the bold title', () => {
        const config = {
            items: items('Aa'),
            title: 'Ein sehr langer Legendentitel',
            layout: { direction: 'vertical' },
        };
        const geometry = resolve(config);

        expect(geometry.titleOffset).toBe(FONT_SIZE * 2);
        expect(geometry.itemPositions[0].y).toBe(FONT_SIZE * 2);
        expect(geometry.size.height).toBe(FONT_SIZE * 2 + FONT_SIZE);
        expect(geometry.size.width).toBe(
            scriptedMeasureText(config.title, { fontWeight: 'bold' }).width,
        );
    });

    it('anchors into a layout slot, centering horizontally by the nominal width', () => {
        const config = { items: items('Aa', 'Bb', 'Cc'), layout: {} };
        const geometry = resolve(config, { x: 10, y: 20, width: 500, height: 40 });

        // Historical centering arithmetic: nominal n*spacing, not the measured extent.
        expect(geometry.anchor.x).toBe(10 + (500 - 3 * 120) / 2);
        expect(geometry.anchor.y).toBe(20);
    });

    it('centers a vertical legend in its slot using the measured height', () => {
        const config = {
            items: items('Aa', 'Bb'),
            layout: { direction: 'vertical', verticalCenter: true },
        };
        const geometry = resolve(config, { x: 0, y: 100, width: 80, height: 200 });

        expect(geometry.anchor.y).toBe(100 + (200 - geometry.size.height) / 2);
    });

    it('honours itemGap variable-width layout with cumulative positions', () => {
        const config = {
            items: items('Aaaa', 'Bb'),
            layout: { itemGap: 8 },
        };
        const geometry = resolve(config);

        // First symbol center at 6; next item after gap(12) + text(40) + itemGap(8).
        expect(geometry.itemPositions.map((p) => p.x)).toEqual([6, 6 + 12 + 40 + 8]);
        expect(geometry.size.width).toBe(6 + 12 + 40 + 8 + (6 + 12 + 20));
    });

    it('sources every default from LEGEND_DEFAULTS', () => {
        const horizontal = resolve({ items: items('Aa', 'Bb') });
        expect(horizontal.itemPositions[1].x).toBe(LEGEND_DEFAULTS.spacing.horizontal);

        const vertical = resolve({ items: items('Aa', 'Bb'), layout: { direction: 'vertical' } });
        expect(vertical.itemPositions[1].y).toBe(LEGEND_DEFAULTS.spacing.vertical);
        expect(vertical.size.width).toBe(
            LEGEND_DEFAULTS.symbolSize * 2 + LEGEND_DEFAULTS.symbolTextGap.vertical + 20,
        );
    });
});

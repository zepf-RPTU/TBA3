// @vitest-browser

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    loadReportLayout,
    mergeReportLayout,
    saveReportLayout,
} from '../../../../../src/common/views/report/reportLayout.js';

// WHY: the arrangement the user made must come back after a reload, must not
// resurrect cards whose image is gone, and new cards must land where a fresh
// report would put them (view order, then on-screen order) — otherwise every
// visit to the report reshuffles it.

const record = (itemId, view, docOrder = 0, capturedAt = 0) => ({
    itemId,
    view,
    docOrder,
    capturedAt,
});

describe('report layout persistence', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('round-trips order and span per app without touching the other app', () => {
        saveReportLayout('en', [
            { id: 'b', span: 6 },
            { id: 'a', span: 12 },
        ]);
        saveReportLayout('ma', [{ id: 'x', span: 4 }]);

        expect(loadReportLayout('en')).toEqual([
            { id: 'b', span: 6 },
            { id: 'a', span: 12 },
        ]);
        expect(loadReportLayout('ma')).toEqual([{ id: 'x', span: 4 }]);
        expect(loadReportLayout('sl')).toEqual([]);
    });

    it('normalizes an unknown span to full width and drops entries without an id', () => {
        localStorage.setItem(
            'tba3_report_layout_v1',
            JSON.stringify({
                version: 1,
                byApp: { en: { items: [{ id: 'a', span: 5 }, { span: 6 }, { id: '', span: 6 }] } },
            }),
        );

        expect(loadReportLayout('en')).toEqual([{ id: 'a', span: 12 }]);
    });

    it('ignores unreadable or foreign-version payloads instead of throwing', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem('tba3_report_layout_v1', '{not json');
        expect(loadReportLayout('en')).toEqual([]);

        localStorage.setItem(
            'tba3_report_layout_v1',
            JSON.stringify({ version: 99, byApp: { en: { items: [{ id: 'a', span: 6 }] } } }),
        );
        expect(loadReportLayout('en')).toEqual([]);
    });
});

describe('mergeReportLayout', () => {
    const viewOrder = ['welcome', 'overview', 'item'];

    it('keeps the stored order and spans for cards whose image still exists', () => {
        const stored = [
            { id: 'c', span: 6 },
            { id: 'a', span: 4 },
        ];
        const records = [record('a', 'overview'), record('c', 'item')];

        expect(mergeReportLayout(stored, records, viewOrder)).toEqual([
            { id: 'c', span: 6 },
            { id: 'a', span: 4 },
        ]);
    });

    it('drops stored entries whose image is gone', () => {
        const stored = [
            { id: 'gone', span: 6 },
            { id: 'a', span: 12 },
        ];

        expect(mergeReportLayout(stored, [record('a', 'overview')], viewOrder)).toEqual([
            { id: 'a', span: 12 },
        ]);
    });

    it('appends new cards at full width in view order, then on-screen order, then capture time', () => {
        const stored = [{ id: 'kept', span: 6 }];
        const records = [
            record('kept', 'item'),
            record('item-2', 'item', 1, 10),
            record('overview-late', 'overview', 0, 50),
            record('overview-early', 'overview', 0, 20),
            record('item-1', 'item', 0, 30),
            record('welcome', 'welcome', 3, 99),
        ];

        expect(mergeReportLayout(stored, records, viewOrder).map((entry) => entry.id)).toEqual([
            'kept',
            'welcome',
            'overview-early',
            'overview-late',
            'item-1',
            'item-2',
        ]);
        expect(
            mergeReportLayout(stored, records, viewOrder)
                .slice(1)
                .every((entry) => entry.span === 12),
        ).toBe(true);
    });

    it('puts cards from an unknown view last', () => {
        const records = [record('mystery', 'unknown', 0, 0), record('a', 'item', 0, 5)];

        expect(mergeReportLayout([], records, viewOrder).map((entry) => entry.id)).toEqual([
            'a',
            'mystery',
        ]);
    });
});

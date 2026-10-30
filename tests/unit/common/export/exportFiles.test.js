import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    buildExportFileName,
    formatFooterDate,
    sanitizeFileStem,
} from '../../../../src/common/export/exportFiles.js';

// The file name is the only metadata a user sees in the download folder; German
// titles (umlauts, dashes, spaces) must yield stable, readable stems.

describe('sanitizeFileStem', () => {
    it('transliterates German umlauts instead of dropping them', () => {
        expect(sanitizeFileStem('Lerngruppenübersicht Ärger Größe Straße')).toBe(
            'lerngruppenuebersicht-aerger-groesse-strasse',
        );
    });

    it('strips other accents and collapses punctuation/whitespace into single dashes', () => {
        expect(sanitizeFileStem('Café — Hören / Lesen (2025)')).toBe('cafe-hoeren-lesen-2025');
    });

    it('falls back to "export" for empty input', () => {
        expect(sanitizeFileStem('')).toBe('export');
        expect(sanitizeFileStem(null)).toBe('export');
    });
});

describe('formatFooterDate', () => {
    it('prints the German dd.MM.yyyy HH:mm form with zero padding', () => {
        expect(formatFooterDate(new Date(2026, 0, 5, 9, 7))).toBe('05.01.2026 09:07');
    });
});

describe('buildExportFileName', () => {
    beforeEach(() => vi.useFakeTimers());

    it('joins app, view, title and timestamp with the extension (view omitted when empty)', () => {
        vi.setSystemTime(new Date(2026, 7, 17, 14, 30));

        expect(
            buildExportFileName({
                appId: 'en',
                title: 'Übersicht',
                view: 'group',
                ext: 'pdf',
            }),
        ).toBe('tba3-en-group-uebersicht-20260817-1430.pdf');
        expect(buildExportFileName({ appId: 'en', title: 'Übersicht', ext: 'csv' })).toBe(
            'tba3-en-uebersicht-20260817-1430.csv',
        );
    });

    it('stamps a sortable yyyyMMdd-HHmm timestamp with zero padding', () => {
        vi.setSystemTime(new Date(2026, 0, 5, 9, 7));
        expect(buildExportFileName({ appId: 'en', title: 'Karte', ext: 'png' })).toBe(
            'tba3-en-karte-20260105-0907.png',
        );
    });
});

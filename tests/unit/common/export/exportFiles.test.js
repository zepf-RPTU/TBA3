import { describe, expect, it } from 'vitest';

import {
    buildExportFileName,
    formatFooterDate,
    formatTimestamp,
    sanitizeFileStem,
} from '../../../../src/common/export/exportFiles.js';

// WHY: file names are the only metadata a user sees in their download folder;
// German titles (umlauts, dashes, spaces) must yield stable, readable stems.

describe('sanitizeFileStem', () => {
    it('transliterates German umlauts instead of dropping them', () => {
        expect(sanitizeFileStem('Klassenübersicht Ärger Größe Straße')).toBe(
            'klassenuebersicht-aerger-groesse-strasse',
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

describe('formatTimestamp', () => {
    it('produces a sortable yyyyMMdd-HHmm stamp with zero padding', () => {
        expect(formatTimestamp(new Date(2026, 0, 5, 9, 7))).toBe('20260105-0907');
    });
});

describe('formatFooterDate', () => {
    it('prints the German dd.MM.yyyy HH:mm form with zero padding', () => {
        expect(formatFooterDate(new Date(2026, 0, 5, 9, 7))).toBe('05.01.2026 09:07');
    });
});

describe('buildExportFileName', () => {
    it('joins app, view, title and timestamp with the extension (view omitted when empty)', () => {
        const now = new Date(2026, 7, 17, 14, 30);

        // Outside a dashboard page the app id falls back to "tba3".
        expect(buildExportFileName({ title: 'Übersicht', view: 'class', ext: 'pdf', now })).toBe(
            'tba3-tba3-class-uebersicht-20260817-1430.pdf',
        );
        expect(buildExportFileName({ title: 'Übersicht', ext: 'csv', now })).toBe(
            'tba3-tba3-uebersicht-20260817-1430.csv',
        );
    });
});

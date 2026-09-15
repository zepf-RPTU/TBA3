import { describe, expect, it } from 'vitest';

import {
    deriveDomainResultFields,
    shouldShowColumnForMode,
    buildStyleFieldUpdate,
} from '@tba3/modules/en/modules/tables/enDomainModeRules.js';

// WHY this file exists: these rules were duplicated field-for-field in the EN
// class and student-info tables; the extraction gave them one home and this
// suite pins their contract so the two consumers cannot drift apart again.

describe('deriveDomainResultFields', () => {
    it('derives percentages over the payload total from counts named by their bucket', () => {
        // WHY: the progress-bar column reads fixed `${prefix}*` field names. Each count
        // arrives named by the bucket it counts, so no position decides its meaning.
        const fields = deriveDomainResultFields('d0', {
            total: 10,
            correct: 6,
            incorrect: 3,
            notAttempted: 1,
        });

        expect(fields).toEqual({
            d0PercentageCorrect: 60,
            d0PercentageIncorrect: 30,
            d0PercentageNotAttempted: 10,
            d0CorrectCount: 6,
            d0IncorrectCount: 3,
            d0NotAttemptedCount: 1,
        });
    });

    it('leaves a missing bucket null without shifting the others', () => {
        // WHY: read by position, a row without "Falsch" put the Unbearbeitet count into
        // the Falsch segment. A bucket the payload omits is unknown, not 0.
        const fields = deriveDomainResultFields('d1', { total: 10, correct: 7, notAttempted: 3 });

        expect(fields).toEqual({
            d1PercentageCorrect: 70,
            d1PercentageIncorrect: null,
            d1PercentageNotAttempted: 30,
            d1CorrectCount: 7,
            d1IncorrectCount: null,
            d1NotAttemptedCount: 3,
        });
    });

    it('yields no shares for a domain without results instead of NaN or 0 %', () => {
        // WHY: a student without a row in one domain must render an empty progress bar;
        // NaN widths break Tabulator's numeric sorters, and 0 % would claim a result.
        expect(deriveDomainResultFields('d1', undefined)).toEqual({
            d1PercentageCorrect: null,
            d1PercentageIncorrect: null,
            d1PercentageNotAttempted: null,
            d1CorrectCount: null,
            d1IncorrectCount: null,
            d1NotAttemptedCount: null,
        });
        // Without the payload's denominator the counts stay, the shares do not.
        expect(deriveDomainResultFields('d0', { total: null, correct: 4 })).toMatchObject({
            d0PercentageCorrect: null,
            d0CorrectCount: 4,
        });
    });
});

describe('shouldShowColumnForMode', () => {
    const domainIds = ['ho', 'le'];
    const styleFields = new Set(['styleGlobal', 'styleDetail']);

    it("hides the other domain's progress-bar and GER columns in single-domain mode", () => {
        // WHY: in Hören mode the Lesen columns would show data the header
        // controls say is filtered out — the mode IS the column set.
        expect(shouldShowColumnForMode('d1Percentages', 'ho', domainIds, styleFields)).toBe(false);
        expect(shouldShowColumnForMode('d1GerHtml', 'ho', domainIds, styleFields)).toBe(false);
        expect(shouldShowColumnForMode('d0Percentages', 'ho', domainIds, styleFields)).toBe(true);

        expect(shouldShowColumnForMode('d0Percentages', 'le', domainIds, styleFields)).toBe(false);
        expect(shouldShowColumnForMode('d0GerHtml', 'le', domainIds, styleFields)).toBe(false);
        expect(shouldShowColumnForMode('d1Percentages', 'le', domainIds, styleFields)).toBe(true);
    });

    it('shows style columns only in single-domain mode', () => {
        // WHY: a style percentage is a per-domain value; in 'all' mode there is
        // no single domain to read it from, so the columns must disappear.
        expect(shouldShowColumnForMode('styleGlobal', 'ho', domainIds, styleFields)).toBe(true);
        expect(shouldShowColumnForMode('styleGlobal', 'le', domainIds, styleFields)).toBe(true);
        expect(shouldShowColumnForMode('styleGlobal', 'all', domainIds, styleFields)).toBe(false);
    });

    it('leaves unrelated columns visible in every mode', () => {
        for (const mode of ['all', 'ho', 'le']) {
            expect(shouldShowColumnForMode('lastName', mode, domainIds, styleFields)).toBe(true);
        }
    });
});

describe('buildStyleFieldUpdate', () => {
    const categories = [{ fieldName: 'styleGlobal' }, { fieldName: 'styleDetail' }];

    it("maps each style category's field from the selected domain's nested values", () => {
        const update = buildStyleFieldUpdate(
            { styleGlobal: 42.5, styleDetail: 10, unrelated: 99 },
            categories,
        );

        expect(update).toEqual({ styleGlobal: 42.5, styleDetail: 10 });
    });

    it('reads null for a value, or a whole domain, the student has none for', () => {
        // WHY: a missing style value was zero-filled and printed "0.0%" as if the
        // student had scored it; `null` is what the percent cell prints as "N/A".
        expect(buildStyleFieldUpdate({ styleGlobal: 42.5 }, categories)).toEqual({
            styleGlobal: 42.5,
            styleDetail: null,
        });
        expect(buildStyleFieldUpdate(undefined, categories)).toEqual({
            styleGlobal: null,
            styleDetail: null,
        });
    });
});

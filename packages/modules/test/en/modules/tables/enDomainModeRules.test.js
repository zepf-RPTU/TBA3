import { describe, expect, it } from 'vitest';

import {
    applyModeVisibility,
    buildEnDomainFields,
    shouldShowColumnForMode,
} from '../../../../src/en/modules/tables/enDomainModeRules.js';
import { required } from '../../../support/required.js';

/**
 * A column definition or a column group, as the tables declare them.
 * @typedef {{title?: string, field?: string, visible?: boolean, columns?: Column[]}} Column
 */

// The EN group and student-info tables both read these rules.

describe('buildEnDomainFields — result counts to progress-bar fields', () => {
    /**
     * The fields of a student whose domains carry these result counts.
     * @param {{[domainId: string]: import('../../../../src/common/domain/resultAggregations.js').ResultCounts}} countsByDomain
     * @returns {{[field: string]: any}}
     */
    const resultFields = (countsByDomain) =>
        buildEnDomainFields(
            {
                domains: Object.fromEntries(
                    Object.entries(countsByDomain).map(([id, resultCounts]) => [
                        id,
                        { resultCounts },
                    ]),
                ),
            },
            { domainIds: ['ho', 'le'] },
        );

    it('derives percentages over the payload total from counts named by their bucket', () => {
        // The progress-bar column reads fixed `${prefix}*` field names. Each count
        // arrives named by the bucket it counts, so no position decides its meaning.
        const fields = resultFields({
            ho: { total: 10, correct: 6, incorrect: 3, notAttempted: 1 },
        });

        expect(fields).toMatchObject({
            d0PercentageCorrect: 60,
            d0PercentageIncorrect: 30,
            d0PercentageNotAttempted: 10,
            d0CorrectCount: 6,
            d0IncorrectCount: 3,
            d0NotAttemptedCount: 1,
        });
    });

    it('leaves a missing bucket null without shifting the others', () => {
        // Read by position, a value group without "Falsch" would put the Unbearbeitet count
        // into the Falsch segment. A bucket the payload omits is unknown, not 0.
        const fields = resultFields({ le: { total: 10, correct: 7, notAttempted: 3 } });

        expect(fields).toMatchObject({
            d1PercentageCorrect: 70,
            d1PercentageIncorrect: null,
            d1PercentageNotAttempted: 30,
            d1CorrectCount: 7,
            d1IncorrectCount: null,
            d1NotAttemptedCount: 3,
        });
    });

    it('yields no shares for a domain without results instead of NaN or 0 %', () => {
        // A student without a value group in one domain must render an empty progress bar;
        // NaN widths break Tabulator's numeric sorters, and 0 % would claim a result.
        expect(resultFields({})).toMatchObject({
            d1PercentageCorrect: null,
            d1PercentageIncorrect: null,
            d1PercentageNotAttempted: null,
            d1CorrectCount: null,
            d1IncorrectCount: null,
            d1NotAttemptedCount: null,
        });
        // Without the payload's denominator the counts stay, the shares do not.
        expect(resultFields({ ho: { total: null, correct: 4 } })).toMatchObject({
            d0PercentageCorrect: null,
            d0CorrectCount: 4,
        });
    });
});

describe('shouldShowColumnForMode', () => {
    const enConfig = {
        domainIds: ['ho', 'le'],
        styleCategories: [{ fieldName: 'styleGlobal' }, { fieldName: 'styleDetail' }],
    };

    it("hides the other domain's progress-bar and GER columns in single-domain mode", () => {
        // In Hören mode the Lesen columns would show data the header controls say
        // is filtered out.
        expect(shouldShowColumnForMode('d1Percentages', 'ho', enConfig)).toBe(false);
        expect(shouldShowColumnForMode('d1Ger', 'ho', enConfig)).toBe(false);
        expect(shouldShowColumnForMode('d0Percentages', 'ho', enConfig)).toBe(true);

        expect(shouldShowColumnForMode('d0Percentages', 'le', enConfig)).toBe(false);
        expect(shouldShowColumnForMode('d0Ger', 'le', enConfig)).toBe(false);
        expect(shouldShowColumnForMode('d1Percentages', 'le', enConfig)).toBe(true);
    });

    it('shows style columns only in single-domain mode', () => {
        // A style percentage is a per-domain value; in 'all' mode there is
        // no single domain to read it from, so the columns must disappear.
        expect(shouldShowColumnForMode('styleGlobal', 'ho', enConfig)).toBe(true);
        expect(shouldShowColumnForMode('styleGlobal', 'le', enConfig)).toBe(true);
        expect(shouldShowColumnForMode('styleGlobal', 'all', enConfig)).toBe(false);
    });

    it('leaves columns it does not govern to the user in every mode', () => {
        // A column the user hid (e.g. Geschlecht) must survive a Domäne switch.
        for (const mode of ['all', 'ho', 'le']) {
            expect(shouldShowColumnForMode('lastName', mode, enConfig)).toBeUndefined();
        }
    });
});

describe('applyModeVisibility', () => {
    const enConfig = { domainIds: ['ho', 'le'], styleCategories: [] };

    it('reaches the columns inside a domain group', () => {
        // Each domain's bar and GER column sit in a column group named after the
        // domain; a rule that stopped at the group would leave the other domain showing.
        const columns = applyModeVisibility(
            /** @type {Column[]} */ ([
                {
                    title: 'Hörverstehen',
                    columns: [{ field: 'd0Percentages' }, { field: 'd0Ger' }],
                },
                {
                    title: 'Leseverstehen',
                    columns: [{ field: 'd1Percentages' }, { field: 'd1Ger' }],
                },
                { field: 'lastName' },
            ]),
            'ho',
            enConfig,
        );

        expect(required(columns[0].columns).map((column) => column.visible)).toEqual([true, true]);
        expect(required(columns[1].columns).map((column) => column.visible)).toEqual([
            false,
            false,
        ]);
        expect(columns[2]).toEqual({ field: 'lastName' });
    });
});

describe('buildEnDomainFields', () => {
    const enConfig = { domainIds: ['ho', 'le'] };

    it('builds both domains under the d0/d1 prefixes, the style shares under the domain id', () => {
        const fields = buildEnDomainFields(
            {
                domains: {
                    ho: {
                        competenceLevelName: 'B1',
                        resultCounts: { total: 4, correct: 3, incorrect: 1, notAttempted: 0 },
                        styles: { global: 42.5 },
                    },
                },
            },
            enConfig,
        );

        expect(fields.d0Ger).toBe('B1');
        expect(fields.d0CorrectCount).toBe(3);
        expect(fields.ho).toEqual({ global: 42.5 });
    });

    it('leaves a domain the student has no value group in without a level and with empty shares', () => {
        // An absent style object must print the missing mark, not borrow the other domain's.
        const fields = buildEnDomainFields(
            { domains: { ho: { competenceLevelName: 'B1' } } },
            enConfig,
        );

        expect(fields.d1Ger).toBeNull();
        expect(fields.d1PercentageCorrect).toBeNull();
        expect(fields.le).toEqual({});
    });
});

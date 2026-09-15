import { describe, expect, it } from 'vitest';

import { getNumberFormat } from '@tba3/modules/common/utils/numberFormat.js';

describe('getNumberFormat', () => {
    it('returns the same instance for the same locale and options', () => {
        const options = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
        expect(getNumberFormat(options)).toBe(getNumberFormat({ ...options }));
        expect(getNumberFormat(options)).not.toBe(getNumberFormat(options, 'en-US'));
        expect(getNumberFormat(options)).not.toBe(getNumberFormat({ maximumFractionDigits: 1 }));
    });

    it('formats German numbers', () => {
        const oneDigit = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
        expect(getNumberFormat(oneDigit).format(62.1)).toBe('62,1');
        expect(getNumberFormat(oneDigit).format(1234.5)).toBe('1.234,5');
        expect(getNumberFormat({ ...oneDigit, signDisplay: 'exceptZero' }).format(3.7)).toBe(
            '+3,7',
        );
        expect(getNumberFormat({ style: 'percent', maximumFractionDigits: 0 }).format(0.42)).toBe(
            '42 %',
        );
    });
});

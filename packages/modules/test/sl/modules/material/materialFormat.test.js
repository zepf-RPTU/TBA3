import { describe, it, expect } from 'vitest';
import { formatPercentPointDelta } from '../../../../src/sl/modules/material/materialFormat.js';

describe('formatPercentPointDelta', () => {
    it('prints a share difference as signed percentage points in a toned span', () => {
        expect(formatPercentPointDelta(0.037)).toBe(
            '<span class="material-delta material-delta--positive">+3,7 PP</span>',
        );
        expect(formatPercentPointDelta(-0.037)).toBe(
            '<span class="material-delta material-delta--negative">-3,7 PP</span>',
        );
    });

    it('keeps a delta that rounds to zero unsigned and neutral', () => {
        expect(formatPercentPointDelta(0)).toBe('<span class="material-delta">0,0 PP</span>');
        expect(formatPercentPointDelta(-0.0004)).toBe('<span class="material-delta">0,0 PP</span>');
    });

    it('renders the dashboard dash without a figure', () => {
        expect(formatPercentPointDelta(null)).toBe('–');
    });
});

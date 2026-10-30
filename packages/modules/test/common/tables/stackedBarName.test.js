// @vitest-browser
/**
 * A DOM stacked bar is one image to assistive tech; its name must say everything the
 * picture does: which Domäne a bar of a two-bar cell shows, and the Pilotierung tick.
 */

import { describe, it, expect } from 'vitest';
import { createDOMStackedBar } from '../../../src/common/tables/stackedBarCell.js';

const SEGMENTS = [
    { field: 'a', label: 'Ia', value: 3, total: 10, percentage: 30, color: 'var(--text-muted)' },
    { field: 'b', label: 'Ib', value: 7, total: 10, percentage: 70, color: 'var(--text-muted)' },
];

describe('createDOMStackedBar name', () => {
    it('leads with what the bar shows and ends with its benchmark', () => {
        const bar = createDOMStackedBar(SEGMENTS, {
            labelPrefix: 'Lesen',
            marker: { at: 50, tooltip: { rows: [{ label: 'Pilotierung', value: '98 %' }] } },
        });

        const name = bar.getAttribute('aria-label') ?? '';
        expect(name.startsWith('Lesen: Ia ')).toBe(true);
        expect(name.endsWith('. Pilotierung: 98 %')).toBe(true);
    });

    it('is the shares alone without either', () => {
        const name = createDOMStackedBar(SEGMENTS).getAttribute('aria-label') ?? '';
        expect(name.startsWith('Ia ')).toBe(true);
        expect(name).not.toContain('.');
    });
});

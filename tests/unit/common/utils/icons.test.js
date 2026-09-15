// @vitest-browser

import { describe, it, expect } from 'vitest';
import { createIcon, iconSvg } from '@tba3/module-base/utils/icons.js';
import { MATERIAL_SYMBOL_PATHS } from '@tba3/module-base/utils/materialSymbols.js';

describe('icons', () => {
    // WHY: every icon in the app resolves through this one registry, so a name
    // must render a real glyph and a typo must fail loudly instead of leaving an
    // empty button behind.
    it('renders a registered icon as a decorative inline SVG', () => {
        const markup = iconSvg('close', { className: 'x', size: 20 });
        expect(markup).toMatch(/^<svg class="icon x" data-icon="close"/);
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('width="20" height="20"');
        expect(markup).toContain(`<path d="${MATERIAL_SYMBOL_PATHS.close}"/>`);
    });

    it('builds the same icon as an element', () => {
        const svg = createIcon('check_box_outline_blank');
        expect(svg.getAttribute('class')).toBe('icon');
        expect(svg.dataset.icon).toBe('check_box_outline_blank');
        expect(svg.querySelector('path')?.getAttribute('d')).toBe(
            MATERIAL_SYMBOL_PATHS.check_box_outline_blank,
        );
    });

    it('throws on an unknown icon name', () => {
        expect(() => iconSvg('not_an_icon')).toThrow(/Unknown icon "not_an_icon"/);
        expect(() => createIcon('')).toThrow();
    });
});

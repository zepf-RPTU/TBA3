import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HOVER_PRESETS } from '../../../../../src/common/charts/renderers/internal/chartInteractionUtils.js';
import { required } from '../../../../support/required.js';

/**
 * A hovered area mark dims to one opacity, set twice — the `area` hover preset for
 * the SVG charts, `--chart-hover-opacity` for the HTML stacked bars — and a table bar dimming
 * further than the chart bar beside it reads as a different kind of feedback.
 */
describe('area hover opacity', () => {
    it('matches --chart-hover-opacity in tokens.css, which tba3 imports unchanged', () => {
        const css = readFileSync(
            new URL('../../../../../styles/tokens.css', import.meta.url),
            'utf8',
        );

        expect(Number(css.match(/--chart-hover-opacity:\s*([\d.]+);/)?.[1])).toBe(
            required(HOVER_PRESETS.area.enter).opacity,
        );
    });
});

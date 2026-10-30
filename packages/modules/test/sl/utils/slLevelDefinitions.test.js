import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompetenceLevelPalette } from '../../../src/common/services/competenceLevelPalette.js';
import { buildLevelDefinitions } from '../../../src/sl/utils/slLevelDefinitions.js';
import {
    GER_LEVELS,
    ROMAN_LEVELS,
    ladderValueGroup,
} from '../../support/competenceScaleFixture.js';

/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/**
 * A Deutsch value group listing the levels its population reached.
 * @param {string[]} levelNames
 * @returns {CompetenceLevelsValueGroup}
 */
const deutsch = (levelNames) => /** @type {CompetenceLevelsValueGroup} */ ({
    type: 'group',
    id: '8a',
    name: '8a',
    subject: { name: 'Deutsch' },
    competenceLevels: levelNames.map((nameShort) => ({ nameShort })),
});

/** @type {CompetenceLevelPalette} */
let palette;

beforeEach(() => {
    palette = new CompetenceLevelPalette();
});

describe('buildLevelDefinitions', () => {
    it('takes the whole registered ladder, though every listing is truncated', () => {
        palette.registerCompetenceLevelScales([ladderValueGroup(ROMAN_LEVELS)]);

        const definitions = buildLevelDefinitions(palette, [
            deutsch(['II', 'III', 'IV']),
            deutsch(['III', 'IV', 'V']),
        ]);

        expect(definitions.get('Deutsch|null')).toEqual({
            scaleId: ROMAN_LEVELS.join('|'),
            levels: ROMAN_LEVELS,
        });
    });

    it('leaves out a Fach whose listings resolve to two scales, warning once', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(ROMAN_LEVELS),
            ladderValueGroup(GER_LEVELS),
        ]);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const definitions = buildLevelDefinitions(palette, [
            deutsch(['III', 'IV']),
            deutsch(['B1', 'B2']),
            deutsch(['II', 'III']),
        ]);

        expect(definitions.has('Deutsch|null')).toBe(false);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it('keeps the longest listing, unnamed, when no registered scale holds it', () => {
        const definitions = buildLevelDefinitions(palette, [
            deutsch(['x', 'y']),
            deutsch(['x', 'y', 'z']),
        ]);

        expect(definitions.get('Deutsch|null')).toEqual({
            scaleId: undefined,
            levels: ['x', 'y', 'z'],
        });
    });
});

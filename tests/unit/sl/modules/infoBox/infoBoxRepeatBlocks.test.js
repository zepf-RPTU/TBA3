import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    expandRepeatBlock,
    isRepeatBlockDefinition,
} from '@tba3/modules/sl/modules/infoBox/infoBoxRepeatBlocks.js';
import { getSubjectShortDisplayName } from '@tba3/modules/sl/utils/slSubjectConfig.js';
import { slDataFromStore } from '../../../../../src/sl/slDataPort.js';
import { SL_DATA_KEYS } from '../../../../../src/sl/slDataKeys.js';
import { buildCompetenceRows } from '../../../support/slInfoBoxFixture.js';
import { createSlDataStore } from '../../../support/slDataStoreFixture.js';

/**
 * A repeat block is rolled out once per Klasse or Fach of the school. Which rows count,
 * and what each copy says, decide whether a box lists every class or silently skips one.
 *
 * The shared fixture: Deutsch (Lesen, Zuhören) sat by 8a and 8b, Englisch (Hören) by 8a
 * and 8b, Mathematik (one Domäne) by 8a, 8b and 8c.
 */

afterEach(() => {
    vi.restoreAllMocks();
});

function slDataFor(competenceLevels = buildCompetenceRows()) {
    return slDataFromStore(
        createSlDataStore({ [SL_DATA_KEYS.COMPETENCE_LEVELS]: competenceLevels }),
    );
}

function expand(block, placeholderContext = null) {
    return expandRepeatBlock(block, { slData: slDataFor(), placeholderContext, moduleId: 'box' });
}

describe('isRepeatBlockDefinition', () => {
    it('accepts only a plain object with a string repeat and template', () => {
        expect(isRepeatBlockDefinition({ repeat: 'classes', template: 'x' })).toBe(true);
        expect(isRepeatBlockDefinition({ repeat: { type: 'subjects' }, template: '' })).toBe(false);
        expect(isRepeatBlockDefinition({ repeat: 'classes' })).toBe(false);
        expect(isRepeatBlockDefinition({ template: 'x' })).toBe(false);
        expect(isRepeatBlockDefinition('classes')).toBe(false);
        expect(isRepeatBlockDefinition(null)).toBe(false);
    });
});

describe('expandRepeatBlock — classes', () => {
    it('yields one copy per Klasse of the school, tokens substituted, context overridden', () => {
        const copies = expand({
            repeat: 'classes',
            template: 'Klasse [[quotedClassName]]',
        });

        expect(copies).toEqual([
            { block: 'Klasse „8a“', contextOverride: { className: '8a' } },
            { block: 'Klasse „8b“', contextOverride: { className: '8b' } },
            { block: 'Klasse „8c“', contextOverride: { className: '8c' } },
        ]);
    });

    it('narrows to the Klassen that sat a Fach, and reads "current" from the context', () => {
        // WHY: a box open on Deutsch must not list 8c, which sat only Mathematik.
        const byLiteral = expand({
            repeat: 'classes',
            filter: { subjectName: 'Deutsch' },
            template: '[[quotedClassName]]',
        });
        const byCurrent = expand(
            {
                repeat: 'classes',
                filter: { subjectName: 'current' },
                template: '[[quotedClassName]]',
            },
            { subjectName: 'Deutsch' },
        );

        expect(byLiteral.map((copy) => copy.block)).toEqual(['„8a“', '„8b“']);
        expect(byCurrent).toEqual(byLiteral);
    });

    it('yields nothing when the payload names no school', () => {
        const rows = buildCompetenceRows().filter((row) => row.type !== 'school');

        expect(
            expandRepeatBlock(
                { repeat: 'classes', template: '[[quotedClassName]]' },
                { slData: slDataFor(rows), moduleId: 'box' },
            ),
        ).toEqual([]);
    });
});

describe('expandRepeatBlock — subjects', () => {
    it('yields one copy per Fach with both subject tokens', () => {
        const copies = expand({
            repeat: 'subjects',
            template: '[[subjectShortDisplayName]]|[[quotedSubjectDisplayName]]',
        });
        const short = getSubjectShortDisplayName('Mathematik') || 'Mathematik';

        expect(copies.map((copy) => copy.contextOverride)).toEqual([
            { subjectName: 'Deutsch' },
            { subjectName: 'Englisch' },
            { subjectName: 'Mathematik' },
        ]);
        expect(copies[2].block).toBe(`${short}|„Mathematik“`);
    });

    it('narrows to the Fächer one Klasse sat, via "current"', () => {
        const copies = expand(
            {
                repeat: 'subjects',
                filter: { className: 'current' },
                template: '[[quotedSubjectDisplayName]]',
            },
            { className: '8c' },
        );

        expect(copies.map((copy) => copy.block)).toEqual(['„Mathematik“']);
    });
});

describe('expandRepeatBlock — template and refusal', () => {
    it('leaves an unknown token literal', () => {
        const [copy] = expand(
            {
                repeat: 'subjects',
                filter: { className: 'current' },
                template: '[[ quotedSubjectDisplayName ]] [[unknown]] [[className]]',
            },
            { className: '8c' },
        );

        expect(copy.block).toBe('„Mathematik“ [[unknown]] [[className]]');
    });

    it('yields nothing for an unknown repeat type, and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(expand({ repeat: 'domains', template: 'x' })).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('InfoBoxModule[box]');
    });
});

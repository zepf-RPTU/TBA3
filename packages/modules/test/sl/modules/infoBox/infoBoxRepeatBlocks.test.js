import { describe, it, expect } from 'vitest';
import { expandRepeatBlock } from '../../../../src/sl/modules/infoBox/infoBoxRepeatBlocks.js';
import { getSubjectShortDisplayName } from '../../../../src/sl/utils/slSubjectConfig.js';
import { buildCompetenceValueGroups } from '../../../support/slInfoBoxFixture.js';
import { buildCompetenceLevelIndex } from '../../../../src/sl/slCompetenceLevelIndex.js';

/**
 * A repeat block is rolled out once per Lerngruppe or Fach of the school. Which value groups count,
 * and what each copy says, decide whether a box lists every group or silently skips one.
 *
 * The shared fixture: Deutsch (Lesen, Zuhören) sat by 8a and 8b, Englisch (Hören) by 8a
 * and 8b, Mathematik (one Domäne) by 8a, 8b and 8c.
 */

/** The quotation `info-boxes.json` carries in `meta.quotedLabel`. */
const QUOTE = '„{{label}}“';

/**
 * @param {Parameters<typeof expandRepeatBlock>[0]} block
 * @param {Parameters<typeof expandRepeatBlock>[1]['placeholderContext']} [placeholderContext]
 * @param {import('../../../../src/common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup[]} [competenceLevels]
 * @returns {ReturnType<typeof expandRepeatBlock>}
 */
function expand(block, placeholderContext = {}, competenceLevels = buildCompetenceValueGroups()) {
    return expandRepeatBlock(block, {
        index: buildCompetenceLevelIndex(competenceLevels),
        placeholderContext,
        quoteTemplate: QUOTE,
    });
}

describe('expandRepeatBlock — groups', () => {
    it('yields one copy per Lerngruppe of the school, tokens substituted, context overridden', () => {
        const copies = expand({
            repeat: 'groups',
            template: 'Lerngruppe [[quotedGroupName]]',
        });

        expect(copies).toEqual([
            { block: 'Lerngruppe „8a“', contextOverride: { groupName: '8a' } },
            { block: 'Lerngruppe „8b“', contextOverride: { groupName: '8b' } },
            { block: 'Lerngruppe „8c“', contextOverride: { groupName: '8c' } },
        ]);
    });

    it('narrows to the Lerngruppen that sat the Fach the box is shown for', () => {
        // A box open on Deutsch must not list 8c, which sat only Mathematik.
        const copies = expand(
            { repeat: 'groups', template: '[[quotedGroupName]]' },
            { subjectName: 'Deutsch' },
        );

        expect(copies.map((copy) => copy.block)).toEqual(['„8a“', '„8b“']);
    });

    it('yields nothing when the payload names no school', () => {
        const valueGroups = buildCompetenceValueGroups().filter(
            (valueGroup) => valueGroup.type !== 'school',
        );

        expect(
            expand({ repeat: 'groups', template: '[[quotedGroupName]]' }, {}, valueGroups),
        ).toEqual([]);
    });
});

describe('expandRepeatBlock — subjects', () => {
    it('yields one copy per Fach with both subject tokens', () => {
        const copies = expand({
            repeat: 'subjects',
            template: '[[subjectShortDisplayName]]|[[quotedSubjectDisplayName]]',
        });
        const short = getSubjectShortDisplayName('Mathematik');

        expect(copies.map((copy) => copy.contextOverride)).toEqual([
            { subjectName: 'Deutsch' },
            { subjectName: 'Englisch' },
            { subjectName: 'Mathematik' },
        ]);
        expect(copies[2].block).toBe(`${short}|„Mathematik“`);
    });

    it('narrows to the Fächer the Lerngruppe the box is shown for sat', () => {
        const copies = expand(
            { repeat: 'subjects', template: '[[quotedSubjectDisplayName]]' },
            { groupName: '8c' },
        );

        expect(copies.map((copy) => copy.block)).toEqual(['„Mathematik“']);
    });
});

describe('expandRepeatBlock — template', () => {
    it('leaves an unknown token literal', () => {
        const [copy] = expand(
            {
                repeat: 'subjects',
                template: '[[ quotedSubjectDisplayName ]] [[unknown]] [[groupName]]',
            },
            { groupName: '8c' },
        );

        expect(copy.block).toBe('„Mathematik“ [[unknown]] [[groupName]]');
    });
});

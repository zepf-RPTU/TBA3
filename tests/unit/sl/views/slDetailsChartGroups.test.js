// @vitest-browser

import { describe, it, expect } from 'vitest';
import {
    buildGroupCards,
    buildSubjectCards,
} from '../../../../src/sl/views/slDetailsChartGroups.js';
import { slGlossary } from '../../../../src/sl/slGlossary.js';
import { createSubjectContext } from '../../../../packages/modules/test/support/subjectContext.js';
import { studentValueGroup } from '../../../../packages/modules/test/support/slValueGroupFactories.js';
import { BOOKLET_PROPERTY } from '../../../../packages/modules/test/support/competenceLevelGroups.js';

/**
 * A Fach card's description names the Fach's Domänen as the payload does, each linked to
 * the entry for that Domäne of that Fach: `Lesen` is a Domäne of Deutsch and Französisch.
 */

/**
 * The school's value group of one Fach/Domäne.
 * @param {string} subject
 * @param {string} id - The Domäne id.
 * @param {string} name - The Domäne name.
 * @returns {import('../../../../packages/modules/test/support/competenceLevelGroups.js').CurrentLevelsValueGroup}
 */
const school = (subject, id, name) => ({
    type: 'school',
    id: 'schule',
    name: 'Schule',
    subject: { name: subject },
    domain: { id, name },
    properties: [BOOKLET_PROPERTY],
    competenceLevels: [
        { nameShort: 'I', descriptiveStatistics: { total: 4, frequency: 1, mean: 0.25 } },
    ],
});

describe('the SL Übersicht Fach cards', () => {
    it('name the Domänen of each Fach, each linked to its own entry', async () => {
        const context = await createSubjectContext('sl', {
            documents: {
                // A Fach card stands for the groups that sat the Fach, beside the school.
                'competence-levels.json': [
                    ['Deutsch', 'le', 'Lesen'],
                    ['Deutsch', 'rs', 'Orthografie'],
                    ['Französisch', 'ho', 'Hören'],
                    ['Französisch', 'le', 'Lesen'],
                ].flatMap(([subject, id, name]) => [
                    school(subject, id, name),
                    { ...school(subject, id, name), type: 'group', id: '8a', name: '8a' },
                ]),
            },
        });

        const descriptions = buildSubjectCards(context.documents, slGlossary, context.glossary).map(
            (card) => {
                const host = document.createElement('div');
                host.innerHTML = String(card.detail.panels.at(-1)?.options.subtitle ?? '');
                return [
                    host.textContent,
                    [...host.querySelectorAll('[data-glossary-key]')].map((term) =>
                        term.getAttribute('data-glossary-key'),
                    ),
                ];
            },
        );
        expect(descriptions).toEqual([
            ['Ergebnisse in den Domänen Lesen und Orthografie', ['lesen', 'orthografie']],
            ['Ergebnisse in den Domänen Hören und Lesen', ['hörverstehen', 'leseverstehen']],
        ]);
    });
});

describe('a Details card names its detail', () => {
    it("a Fach card's Kasten and chart name the payload subject, not the card title", async () => {
        // The payload spells the subject its own way; the card title is glossary copy.
        const context = await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': [
                    school('Mathe', 'za', 'Zahlen'),
                    { ...school('Mathe', 'za', 'Zahlen'), type: 'group', id: '8a', name: '8a' },
                ],
            },
        });

        const [card] = buildSubjectCards(context.documents, slGlossary, context.glossary);
        expect(card.title).not.toBe('Mathe');
        expect(card.detail.kasten).toEqual({
            boxKey: 'detailsSubjectSpecific',
            placeholderContext: { subjectName: 'Mathe', groupName: null },
        });
        expect(card.detail.panels.map((panel) => panel.options.glossaryReplacements)).toEqual([
            { Fach: 'Mathe' },
        ]);
        // A Fach card's averages start on; the by-group cards start them off.
        expect(card.detail.panels.map((panel) => panel.options.averagesHidden)).toEqual([false]);
    });

    it('the school and each group get a Selbstwirksamkeit strip only with Selbstwirksamkeit rows', async () => {
        const context = await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': ['8a', '8b'].map((group) => ({
                    ...school('Deutsch', 'le', 'Lesen'),
                    type: 'group',
                    id: group,
                    name: group,
                })),
                // Only 8a answered the questionnaire, which also makes the school's row.
                'students-competence-levels.json': [
                    studentValueGroup({
                        id: 's1',
                        subject: 'Deutsch',
                        groupName: '8a',
                        properties: [{ key: 'sp_mean', value: '3.4' }],
                    }),
                    studentValueGroup({ id: 's2', subject: 'Deutsch', groupName: '8b' }),
                ],
            },
        });

        const details = buildGroupCards(context.documents, slGlossary).map(({ detail }) => ({
            key: detail.key,
            panels: detail.panels.map(({ suffix, options }) => [
                suffix,
                options.groupName,
                options.showOnlySchoolData,
                options.glossaryKey ?? null,
                options.averagesHidden ?? null,
            ]),
            kasten: detail.kasten,
        }));
        expect(details).toEqual([
            {
                key: 'school',
                panels: [
                    [
                        'sp',
                        null,
                        true,
                        'sl.details.subject-view.preview-cards.element_texts.preview-sw',
                        null,
                    ],
                    // The school's chart takes the card title.
                    ['chart', null, true, null, true],
                ],
                kasten: {
                    boxKey: 'detailsSchoolSpecific',
                    placeholderContext: { subjectName: null, groupName: null },
                },
            },
            {
                key: 'group-8a',
                panels: [
                    [
                        'sp',
                        '8a',
                        false,
                        'sl.details.subject-view.preview-cards.element_texts.preview-sw',
                        null,
                    ],
                    ['chart', '8a', false, 'sl.details.group-view.chart', true],
                ],
                kasten: {
                    boxKey: 'detailsGroupSpecific',
                    placeholderContext: { subjectName: null, groupName: '8a' },
                },
            },
            {
                key: 'group-8b',
                panels: [['chart', '8b', false, 'sl.details.group-view.chart', true]],
                kasten: {
                    boxKey: 'detailsGroupSpecific',
                    placeholderContext: { subjectName: null, groupName: '8b' },
                },
            },
        ]);
    });
});

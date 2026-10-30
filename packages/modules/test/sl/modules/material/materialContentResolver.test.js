// @vitest-browser
// (a page paints its bars through palette tokens on <html>)
import { describe, it, expect } from 'vitest';
import { MATERIAL_PAGES } from '../../../../src/sl/modules/material/materialContentResolver.js';
import { MATERIAL_SUBJECT_CONTEXT } from '../../../../src/sl/modules/material/materialSubjectContext.js';
import { MATERIAL_TYPE_OPTIONS } from '../../../../src/sl/utils/slSubjectConfig.js';
import { BOOKLET_PROPERTY } from '../../../support/competenceLevelGroups.js';
import { required } from '../../../support/required.js';
import {
    competenceValueGroup,
    domainBookletSubject,
    resultValueGroup,
    romanLevels,
    studentValueGroup,
    withBooklet,
} from '../../../support/slValueGroupFactories.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

/**
 * @param {keyof typeof MATERIAL_PAGES} type
 * @param {import('../../../support/documentsInHand.js').DocumentsInHand} [documents] - Documents by file name.
 * @param {string} [subjectName] - The Fach the page is for.
 * @returns {Promise<string>} The page's markup for that Fach.
 */
async function renderPage(type, documents = {}, subjectName = 'Mathematik') {
    const context = await createSubjectContext('sl', { documents: documents });
    return MATERIAL_PAGES[type](
        context.documents.getDataset(MATERIAL_SUBJECT_CONTEXT, subjectName),
        { palette: context.palette, glossary: context.glossary },
    );
}

describe('Material pages', () => {
    it('has a page for exactly the Seitentypen the header lets choose', () => {
        // The header and the info-box links read the types off the domain list,
        // which cannot import the pages; a type enabled there without a page here would
        // open on "Keine Daten".
        expect(Object.keys(MATERIAL_PAGES)).toEqual(
            MATERIAL_TYPE_OPTIONS.filter((option) => !option.disabled).map(
                (option) => option.value,
            ),
        );
    });

    it('labels a distribution bar with plain text, not an escaped entity', async () => {
        // A label built from the HTML formatter and then escaped makes a screen
        // reader read "&amp;nbsp;" out loud.
        const markup = await renderPage('Übersicht', {
            'competence-levels.json': [
                {
                    type: 'school',
                    id: 'schule',
                    name: 'Schule',
                    subject: { name: 'Mathematik' },
                    properties: [BOOKLET_PROPERTY],
                    competenceLevels: [
                        {
                            nameShort: 'I',
                            descriptiveStatistics: { total: 4, frequency: 1, mean: 0.25 },
                        },
                    ],
                },
            ],
        });

        // formatShare puts a non-breaking space before the percent sign.
        expect(markup).toContain('aria-label="Schule: I 25,0 %"');
        expect(markup).not.toContain('&amp;nbsp;');
    });

    it('renders a school without any results, leaving out every comparison it cannot make', async () => {
        // "liegt auf Höhe von dem Landesmittelwert (Δ –)" claims a comparison nobody
        // could make; without the figure the sentence goes.
        const markup = await renderPage('Übersicht');

        expect(markup).toContain('Übersicht: Mathematik');
        expect(markup).not.toContain('Landesmittelwert');
        expect(markup).not.toContain('Im Vergleich zu');
        await expect(renderPage('Ergebniszusammenfassung')).resolves.toBeTypeOf('string');
    });

    it('names the stage and the year of the results in the badge, each only when known', async () => {
        // A hard-coded year goes stale with the next test cycle; the data says which
        // cycle the page reports, and without it no year is better than a guessed one.
        /**
         * @param {string} year - The `testPeriod`.
         * @returns {import('../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup} The school value group of that year.
         */
        const schoolValueGroup = (year) => ({
            type: 'school',
            id: 'schule',
            name: 'Schule',
            subject: { name: 'Mathematik' },
            properties: [
                { key: 'testPeriod', value: year },
                { key: 'booklet', value: '26-V8-MA-TH-1' },
            ],
            competenceLevels: [
                { nameShort: 'I', descriptiveStatistics: { total: 4, frequency: 1, mean: 0.25 } },
            ],
        });
        /**
         * @param {string} markup
         * @returns {string} Its badge's markup.
         */
        const badge = (markup) =>
            required(markup.match(/<div class="material-page-badge">(.*?)<\/div>/))[1];

        expect(
            badge(
                await renderPage('Übersicht', {
                    'competence-levels.json': [schoolValueGroup('2026')],
                    'prior-years.json': [schoolValueGroup('2025')],
                }),
            ),
        ).toBe('<span>VERA-8</span><span>2026</span>');
        expect(badge(await renderPage('Übersicht'))).toBe('<span>VERA</span>');
    });

    it('names the earlier year it compares with, the last one with results', async () => {
        // Mathematik was not tested in 2024: the comparison is with 2023, and "zum Vorjahr"
        // would claim a 2024 result the school never had.
        const yearValueGroup = (/** @type {string} */ year, /** @type {number[]} */ counts) => {
            const valueGroup = competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Schule',
                subject: 'Mathematik',
                levels: romanLevels(counts),
            });
            return {
                ...valueGroup,
                properties: [...(valueGroup.properties ?? []), { key: 'testPeriod', value: year }],
            };
        };
        const markup = await renderPage('Übersicht', {
            'competence-levels.json': [
                yearValueGroup('2025', [0, 0, 5, 5, 0, 0]),
                yearValueGroup('2023', [0, 0, 8, 2, 0, 0]),
            ],
        });

        expect(markup).toContain('Im Vergleich zu 2023 sind die Ergebnisse im Fach besser');
    });

    it('names no best rated group for a Fach none of whose groups was rated', async () => {
        // Unterrichtsqualität is in the dataset (Deutsch is rated), so the survey block
        // shows; Mathematik's groups have no rating, so there is no best one to name.
        const valueGroup = (/** @type {string} */ type, /** @type {string} */ subject) => ({
            type,
            id: type === 'school' ? 'schule' : '3a',
            name: type === 'school' ? 'Schule' : '3a',
            subject: { name: subject },
            properties: [BOOKLET_PROPERTY],
            competenceLevels: [
                { nameShort: 'I', descriptiveStatistics: { total: 1, frequency: 1, mean: 1 } },
            ],
        });
        const markup = await renderPage('Übersicht', {
            'competence-levels.json': ['Mathematik', 'Deutsch'].flatMap((subject) => [
                valueGroup('school', subject),
                valueGroup('group', subject),
            ]),
            'students-competence-levels.json': [
                studentValueGroup({ id: 's1', subject: 'Mathematik', groupName: '3a', level: 'I' }),
                studentValueGroup({
                    id: 's1',
                    subject: 'Deutsch',
                    groupName: '3a',
                    level: 'I',
                    properties: [{ key: 'tq_mean', value: '4' }],
                }),
            ],
        });

        expect(markup).toContain('<h3>Unterrichtsqualität:</h3>');
        expect(markup).not.toContain('Das beste Urteil');
    });
});

describe('a Fach tested with several booklets', () => {
    /**
     * @param {string} booklet - The group's booklet, its id and name too.
     * @returns {ReturnType<typeof competenceValueGroup>} A Mathematik group value group on it.
     */
    const group = (booklet) =>
        withBooklet(
            competenceValueGroup({
                id: booklet,
                type: 'group',
                name: booklet,
                subject: 'Mathematik',
                levels: { I: 1 },
            }),
            booklet,
        );
    const NOTE = 'unterschiedliche Testhefte bearbeitet';
    /**
     * The school: a Fach without one has no Lösungsquote to miss.
     * @param {string} booklets - The booklets it pools over, comma-joined.
     * @returns {ReturnType<typeof competenceValueGroup>}
     */
    const school = (booklets) =>
        withBooklet(
            competenceValueGroup({
                id: 'schule',
                type: 'school',
                name: 'Schule',
                subject: 'Mathematik',
                levels: { I: 1 },
            }),
            booklets,
        );

    it('says on both pages why the Lösungsquoten are missing', async () => {
        const documents = {
            'competence-levels.json': [
                school('26-V8-MA-TH-1,26-V8-MA-TH-2'),
                group('26-V8-MA-TH-1'),
                group('26-V8-MA-TH-2'),
            ],
        };

        expect(await renderPage('Übersicht', documents)).toContain(NOTE);
        expect(await renderPage('Ergebniszusammenfassung', documents)).toContain(NOTE);
    });

    it('says nothing for a Fach on one booklet', async () => {
        const markup = await renderPage('Übersicht', {
            'competence-levels.json': [school('26-V8-MA-TH-1'), group('26-V8-MA-TH-1')],
        });

        expect(markup).not.toContain(NOTE);
    });

    it('names the one Domäne sat in several booklets', async () => {
        // Each Deutsch booklet covers two Domänen: only Lesen was sat in both.
        const { competenceLevels, aggregation } = domainBookletSubject();
        const markup = await renderPage(
            'Ergebniszusammenfassung',
            { 'competence-levels.json': competenceLevels, 'aggregations.json': aggregation },
            'Deutsch',
        );

        const page = new DOMParser().parseFromString(markup, 'text/html');
        const notes = [...page.querySelectorAll('.material-inline-note')]
            .map((note) => note.textContent ?? '')
            .filter((text) => text.includes(NOTE));

        expect(notes).toEqual([expect.stringMatching(/^In der Domäne le wurden /)]);
    });
});

describe('Material pages split by Domäne', () => {
    /**
     * @param {string|null} domainId - The Domäne id, also its name; `null` for Fach-level levels.
     * @returns {import('../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup} The school value group there.
     */
    const school = (domainId) => ({
        type: 'school',
        id: 'schule',
        name: 'Schule',
        subject: { name: 'Mathematik' },
        ...(domainId ? { domain: { id: domainId, name: domainId } } : {}),
        properties: [BOOKLET_PROPERTY],
        competenceLevels: [
            { nameShort: 'I', descriptiveStatistics: { total: 4, frequency: 1, mean: 0.25 } },
        ],
    });
    /**
     * @param {string} markup
     * @param {string} tag
     * @returns {number} How often the element opens.
     */
    const count = (markup, tag) => markup.split(`<${tag}`).length - 1;

    it('gives each Domäne its own row and bullets, the Fach figures spanning the rows', async () => {
        const markup = await renderPage('Übersicht', {
            'competence-levels.json': [school('Lesen'), school('Hören')],
        });

        expect(markup).toContain('<th scope="row" class="material-result-row-label">Lesen</th>');
        expect(markup).toContain('<th scope="row" class="material-result-row-label">Hören</th>');
        expect(markup).toContain('<td rowspan="2">');
        expect(markup).toContain('<h4>Lesen</h4>');
        expect(markup).toContain('<h4>Hören</h4>');
    });

    it('reads a Fach with Fach-level competence levels as one', async () => {
        const markup = await renderPage('Übersicht', { 'competence-levels.json': [school(null)] });

        expect(markup).not.toContain('scope="row"');
        expect(markup).not.toContain('rowspan');
        expect(count(markup, 'h4>')).toBe(0);
    });

    /**
     * The school's levels plus groups 3a and 3b, with tested students, and their
     * Lösungsquoten: 3b's is the higher.
     * @param {Array<string|null>} domainIds - The Domänen; `[null]` for a Fach with no split.
     * @returns {import('../../../support/documentsInHand.js').DocumentsInHand}
     */
    const withGroupRates = (domainIds) => ({
        'competence-levels.json': domainIds.flatMap((domainId) => [
            school(domainId),
            ...['3a', '3b'].map((groupName) => ({
                ...school(domainId),
                type: 'group',
                id: groupName,
                name: groupName,
            })),
        ]),
        // A split Fach counts the students its Domänen list, so each sits in every one.
        'students-competence-levels.json': domainIds.flatMap((domainId) =>
            ['3a', '3b'].map((groupName) =>
                studentValueGroup({
                    id: `s-${groupName}`,
                    subject: 'Mathematik',
                    groupName,
                    level: 'I',
                    ...(domainId ? { domain: { id: domainId, name: domainId } } : {}),
                }),
            ),
        ),
        'aggregations.json': domainIds.flatMap((domain) =>
            ['3a', '3b'].map((groupName, i) =>
                resultValueGroup({
                    id: groupName,
                    type: 'group',
                    name: groupName,
                    subject: 'Mathematik',
                    domain,
                    solved: 40 + 20 * i,
                    total: 100,
                }),
            ),
        ),
    });

    it('names the best group of each Domäne', async () => {
        const markup = await renderPage('Übersicht', withGroupRates(['le', 'rs']));

        const sentence = 'Die besten Ergebnisse in dieser Domäne erreicht die Lerngruppe 3b';
        expect(markup.split(sentence)).toHaveLength(3);
    });

    it('names the best group of a Fach with no split', async () => {
        const markup = await renderPage('Übersicht', withGroupRates([null]));

        expect(markup).toContain(
            'Die insgesamt besten Ergebnisse im Fach erreicht die Lerngruppe 3b',
        );
    });

    it('heads the results tables with one column group per Domäne', async () => {
        const markup = await renderPage('Ergebniszusammenfassung', {
            'competence-levels.json': [school('Lesen'), school('Hören')],
        });

        expect(markup).toContain('<th colspan="2" scope="colgroup">Lesen</th>');
        expect(markup).toContain('<th colspan="2" scope="colgroup">Hören</th>');
        expect(markup).toContain('<th rowspan="2" scope="col">Getestete Schüler:innen</th>');
        // The corner over the row headers is named for assistive tech, not left empty.
        expect(markup).toContain('<span class="visually-hidden">Lerngruppe</span>');
    });

    it('links each Domäne to the entry for that Domäne of its Fach', async () => {
        // `Lesen` is a Domäne of Deutsch and of Englisch: only id and Fach tell them apart.
        /**
         * @param {string} subject
         * @param {Array<[string, string]>} domains - Id and name.
         * @returns {Promise<string>} The Ergebniszusammenfassung of that Fach.
         */
        const pageOf = (subject, domains) =>
            renderPage(
                'Ergebniszusammenfassung',
                {
                    'competence-levels.json': domains.map(([id, name]) => ({
                        ...school(null),
                        subject: { name: subject },
                        domain: { id, name },
                    })),
                },
                subject,
            );
        /**
         * @param {string} markup
         * @param {string} name
         * @returns {string} The column-group header the Domäne heads.
         */
        const headerOf = (markup, name) =>
            required(
                markup.match(
                    new RegExp(
                        `<th colspan="2" scope="colgroup">(<span [^>]*>${name}</span>)</th>`,
                    ),
                ),
            )[1];

        const deutsch = await pageOf('Deutsch', [
            ['le', 'Lesen'],
            ['rs', 'Orthografie'],
        ]);
        expect(headerOf(deutsch, 'Lesen')).toContain('data-glossary-key="lesen"');
        expect(headerOf(deutsch, 'Orthografie')).toContain('data-glossary-key="orthografie"');
        const englisch = await pageOf('Englisch', [
            ['ho', 'Hören'],
            ['le', 'Lesen'],
        ]);
        expect(headerOf(englisch, 'Lesen')).toContain('data-glossary-key="leseverstehen"');
        expect(headerOf(englisch, 'Hören')).toContain('data-glossary-key="hörverstehen"');
    });
});

// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlGroupTableModule } from '../../../../src/sl/modules/tables/slGroupTableModule.js';
import {
    FakeTabulator,
    resetFakeTabulator,
    stubCanvasTextMeasurement,
} from '../../../support/tableHarness.js';
import { required } from '../../../support/required.js';
import { BOOKLET_PROPERTY } from '../../../support/competenceLevelGroups.js';
import { studentValueGroup } from '../../../support/slValueGroupFactories.js';
import { MISSING_VALUE } from '../../../../src/common/utils/numberFormat.js';
import { columnFunction, createFakeCell } from '../../../support/tabulatorFakes.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

vi.mock('../../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

stubCanvasTextMeasurement();

/**
 * The "Anzahl" column of the SL group tables. A group's value group states its own headcount
 * (`competenceLevels[].descriptiveStatistics.total`); the student document need not
 * carry a value group for every student it counts. So a (Fach, Domäne) value group reads `total`, and
 * only a subject split into Domänen, which no single value group answers, counts its distinct
 * students.
 */

/**
 * A group's value group in one Fach (× Domäne), with its headcount per level.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.subject
 * @param {{id: string, name: string}} [params.domain]
 * @param {number[]} params.counts - Headcount per level, lowest first.
 * @returns {import('../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup}
 */
function groupValueGroup({ name, subject, domain, counts }) {
    const total = counts.reduce((sum, count) => sum + count, 0);
    return {
        id: `${name}-${subject}-${domain?.id ?? ''}`,
        type: 'group',
        name,
        subject: { name: subject },
        domain,
        properties: [BOOKLET_PROPERTY],
        competenceLevels: counts.map((frequency, index) => ({
            nameShort: `KS ${index + 1}`,
            descriptiveStatistics: { frequency, total, mean: frequency / total },
        })),
    };
}

/**
 * A student at KS 1.
 * @param {object} params
 * @param {string} params.id - The student id, also its name.
 * @param {string} params.groupName
 * @param {string} params.subject
 * @param {{id: string, name: string}} [params.domain]
 * @returns {import('../../../support/competenceLevelGroups.js').StudentLevelsValueGroup}
 */
function competenceLevel1Student({ id, groupName, subject, domain }) {
    return studentValueGroup({ id, groupName, subject, domain, gender: 'female', level: 'KS 1' });
}

const LISTENING = { id: 'hoe', name: 'Hören' };
const READING = { id: 'le', name: 'Lesen' };

/** @type {import('../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup[]} */
const COMPETENCE_LEVELS = [
    {
        id: 'school',
        type: 'school',
        name: 'Testschule',
        subject: { name: 'Deutsch' },
        properties: [BOOKLET_PROPERTY],
        competenceLevels: [],
    },
    // Deutsch has one Domäne: 8a states 25 students, 8b states 20.
    groupValueGroup({ name: '8a', subject: 'Deutsch', counts: [10, 15] }),
    groupValueGroup({ name: '8b', subject: 'Deutsch', counts: [8, 12] }),
    // Englisch is split into two Domänen.
    groupValueGroup({ name: '8a', subject: 'Englisch', domain: LISTENING, counts: [3, 3] }),
    groupValueGroup({ name: '8a', subject: 'Englisch', domain: READING, counts: [3, 3] }),
    groupValueGroup({ name: '8b', subject: 'Englisch', domain: LISTENING, counts: [2, 2] }),
    groupValueGroup({ name: '8b', subject: 'Englisch', domain: READING, counts: [2, 2] }),
];

const STUDENTS = [
    // Only two of 8a's 25 Deutsch students carry a student value group.
    competenceLevel1Student({ id: 's1', groupName: '8a', subject: 'Deutsch' }),
    competenceLevel1Student({ id: 's2', groupName: '8a', subject: 'Deutsch' }),
    competenceLevel1Student({ id: 's1', groupName: '8b', subject: 'Deutsch' }),
    // Englisch: s1 and s2 in 8a sat both Domänen; 8b's s1 reuses 8a's id.
    competenceLevel1Student({ id: 's1', groupName: '8a', subject: 'Englisch', domain: LISTENING }),
    competenceLevel1Student({ id: 's1', groupName: '8a', subject: 'Englisch', domain: READING }),
    competenceLevel1Student({ id: 's2', groupName: '8a', subject: 'Englisch', domain: READING }),
    competenceLevel1Student({ id: 's1', groupName: '8b', subject: 'Englisch', domain: LISTENING }),
];

/** @type {HTMLElement} */
let root;
/** @type {SlGroupTableModule|null} */
let module = null;

beforeEach(() => {
    resetFakeTabulator();
    root = document.createElement('div');
    document.body.appendChild(root);
});

afterEach(() => {
    module?.remove();
    module = null;
    root.remove();
});

/**
 * @param {import('../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup[]} [competenceLevels]
 */
async function renderTables(competenceLevels = COMPETENCE_LEVELS) {
    module = SlGroupTableModule.create('class-tables', {
        glossaryKey: 'sl.details.group-view.table',
        context: await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': competenceLevels,
                'students-competence-levels.json': STUDENTS,
            },
        }),
    });
    root.append(module);
    // The fake table never builds, so the card never settles: wait for the table.
    await vi.waitFor(() => expect(FakeTabulator.instances).toHaveLength(1));
    return required(FakeTabulator.instances[0]);
}

/**
 * The headcount per Fach of each section, in table order: the school first, then one
 * per group in payload order.
 * @returns {Promise<Array<{[subject: string]: unknown}>>} One map per section.
 */
async function headcounts() {
    const table = await renderTables();
    const rows = required(table.config.data).filter((row) => row.type !== 'self-efficacy-footer');
    const sections = [...new Set(rows.map((row) => row.section))];
    return sections.map((section) =>
        Object.fromEntries(
            rows
                .filter((row) => row.section === section)
                .map((row) => [row.subjectName, row.studentCount]),
        ),
    );
}

describe('SlGroupTableModule rows', () => {
    // One table holds every section, so the card's export and column menu cover
    // them all; Tabulator groups the rows under a header per section.
    it("groups the school's rows, then each group's, under one header each", async () => {
        const table = await renderTables();
        const rows = required(table.config.data);

        expect(table.config.groupBy).toBe('section');
        expect([...new Set(rows.map((row) => row.section))]).toEqual([
            'Schule',
            'Lerngruppe 8a',
            'Lerngruppe 8b',
        ]);
        // The export names whose a row is, as the header does on screen.
        expect([...new Set(rows.map((row) => row.groupName))]).toEqual(['Schule', '8a', '8b']);
        expect(rows.filter((row) => row.section === 'Schule').map((row) => row.type)).toEqual([
            'school',
            'school',
        ]);
    });
});

describe('SlGroupTableModule Domäne column', () => {
    it('names the one Domäne a group sat of a Fach the school sat in several', async () => {
        // 8b sat Englisch in Hören only. The Fach is split, so its row names the Domäne
        // its bar is of; only a Fach the school sat whole (Deutsch here) names none.
        const table = await renderTables(
            COMPETENCE_LEVELS.filter((entry) => !(entry.name === '8b' && entry.domain === READING)),
        );
        const format = columnFunction(
            required(table.config.columns).find((entry) => entry.field === 'domainNames'),
            'formatter',
        );
        /**
         * @param {string} groupName
         * @param {string} subject
         * @returns {string|null} The cell's text.
         */
        const cellText = (groupName, subject) => {
            const row = required(table.config.data).find(
                (entry) => entry.groupName === groupName && entry.subjectName === subject,
            );
            const content = format(createFakeCell(undefined, row), {}, () => {});
            return typeof content === 'string' ? content : content.textContent;
        };

        expect(cellText('8b', 'Englisch')).toBe('Hören');
        expect(cellText('8a', 'Englisch')).toBe('HörenLesen');
        expect(cellText('8b', 'Deutsch')).toBe(MISSING_VALUE);
    });
});

describe('SlGroupTableModule headcount', () => {
    it("reads a single-Domäne row's headcount from the group value group's total", async () => {
        const [school, group8a, group8b] = await headcounts();

        expect(group8a.Deutsch).toBe(25);
        expect(group8b.Deutsch).toBe(20);
        // The school section sums the groups, as the domain table's school row does.
        expect(school.Deutsch).toBe(45);
    });

    it('counts the distinct students of a subject split into Domänen', async () => {
        const [school, group8a, group8b] = await headcounts();

        expect(group8a.Englisch).toBe(2);
        expect(group8b.Englisch).toBe(1);
        // 8a's s1 and 8b's s1 are two children.
        expect(school.Englisch).toBe(3);
    });
});

describe('SlGroupTableModule competence-level share export', () => {
    // One joined cell per level ("40 / ") is a string in a number column and loses
    // which Domäne a share belongs to; each Domäne exports its own number columns.
    it('exports one number column per Domäne and Kompetenzstufe, blank where a row has none', async () => {
        const table = await renderTables();
        const columns = /** @type {Array<{title?: string, accessorDownload?: Function}>} */ (
            required(table.config.columns)
        );
        /**
         * @param {string} title - The export column.
         * @param {string} subject - The row's Fach.
         * @returns {unknown} What the row exports in that column.
         */
        const exported = (title, subject) => {
            const column = required(columns.find((entry) => entry.title === title));
            const row = required(table.config.data).find(
                (entry) => entry.groupName === '8a' && entry.subjectName === subject,
            );
            return required(column.accessorDownload)(undefined, row);
        };

        expect(
            columns.map((column) => column.title).filter((title) => title?.includes('(%)')),
        ).toEqual(
            expect.arrayContaining(['KS KS 1 (%)', 'Hören – KS KS 1 (%)', 'Lesen – KS KS 2 (%)']),
        );
        // 8a: Deutsch 10 of 25 at KS 1; Englisch Hören 3 of 6.
        expect(exported('KS KS 1 (%)', 'Deutsch')).toBe('40');
        expect(exported('Hören – KS KS 1 (%)', 'Deutsch')).toBe('');
        expect(exported('Hören – KS KS 1 (%)', 'Englisch')).toBe('50');
    });
});

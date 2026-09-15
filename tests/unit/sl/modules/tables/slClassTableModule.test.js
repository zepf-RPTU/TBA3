// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlClassTableModule } from '@tba3/modules/sl/modules/tables/slClassTableModule.js';
import {
    FakeTabulator,
    resetFakeTabulator,
    stubCanvasTextMeasurement,
} from '../../../support/tableHarness.js';
import { initGlossaryForTests } from '../../../support/glossaryFixture.js';
import { DataStore } from '../../../../../src/common/services/dataStore.js';
import { defineSlDatasets } from '../../../../../src/sl/slDataService.js';
import { SL_DATA_KEYS } from '../../../../../src/sl/slDataKeys.js';

vi.mock('@tba3/modules/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

stubCanvasTextMeasurement();

/**
 * The "Anzahl" column of the SL class tables. A class row states its own headcount
 * (`competenceLevels[].descriptiveStatistics.total`); the student document need not
 * carry a row for every student it counts. So a (Fach, Domäne) row reads `total`, and
 * only a subject split into Domänen, which no single row answers, counts its distinct
 * students.
 */

function classRow({ name, subject, domain = null, counts }) {
    const total = counts.reduce((sum, count) => sum + count, 0);
    return {
        id: `${name}-${subject}-${domain?.id ?? ''}`,
        type: 'group',
        name,
        subject: { name: subject },
        domain,
        competenceLevels: counts.map((frequency, index) => ({
            nameShort: `KS ${index + 1}`,
            descriptiveStatistics: { frequency, total },
        })),
    };
}

function studentRow({ id, className, subject, domain = null }) {
    return {
        id,
        type: 'student',
        subject: { name: subject },
        domain,
        covariates: [
            { type: 'group', value: className },
            { type: 'gender', value: 'female' },
        ],
        competenceLevels: [{ nameShort: 'KS 1' }],
    };
}

const LISTENING = { id: 'hoe', name: 'Hören' };
const READING = { id: 'le', name: 'Lesen' };

const COMPETENCE_LEVELS = [
    {
        id: 'school',
        type: 'school',
        name: 'Testschule',
        subject: { name: 'Deutsch' },
        domain: null,
        competenceLevels: [],
    },
    // Deutsch has one Domäne: 8a states 25 students, 8b states 20.
    classRow({ name: '8a', subject: 'Deutsch', counts: [10, 15] }),
    classRow({ name: '8b', subject: 'Deutsch', counts: [8, 12] }),
    // Englisch is split into two Domänen.
    classRow({ name: '8a', subject: 'Englisch', domain: LISTENING, counts: [3, 3] }),
    classRow({ name: '8a', subject: 'Englisch', domain: READING, counts: [3, 3] }),
    classRow({ name: '8b', subject: 'Englisch', domain: LISTENING, counts: [2, 2] }),
    classRow({ name: '8b', subject: 'Englisch', domain: READING, counts: [2, 2] }),
];

const STUDENTS = [
    // Only two of 8a's 25 Deutsch students carry a student row.
    studentRow({ id: 's1', className: '8a', subject: 'Deutsch' }),
    studentRow({ id: 's2', className: '8a', subject: 'Deutsch' }),
    studentRow({ id: 's1', className: '8b', subject: 'Deutsch' }),
    // Englisch: s1 and s2 in 8a sat both Domänen; 8b's s1 reuses 8a's id.
    studentRow({ id: 's1', className: '8a', subject: 'Englisch', domain: LISTENING }),
    studentRow({ id: 's1', className: '8a', subject: 'Englisch', domain: READING }),
    studentRow({ id: 's2', className: '8a', subject: 'Englisch', domain: READING }),
    studentRow({ id: 's1', className: '8b', subject: 'Englisch', domain: LISTENING }),
];

/** @type {HTMLElement} */
let root;
/** @type {SlClassTableModule|null} */
let module = null;

beforeEach(() => {
    initGlossaryForTests('sl');
    resetFakeTabulator();
    root = document.createElement('div');
    document.body.appendChild(root);
});

afterEach(() => {
    module?.destroy();
    module = null;
    root.remove();
});

async function renderTables() {
    const dataStore = new DataStore();
    defineSlDatasets(dataStore);
    dataStore.setRawData(SL_DATA_KEYS.COMPETENCE_LEVELS, COMPETENCE_LEVELS);
    dataStore.setRawData(SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS, STUDENTS);

    module = new SlClassTableModule('class-tables', root, {
        glossaryKey: 'sl.overview.class-view.table',
    });
    await module.init({
        classArray: dataStore.getDataset(SL_DATA_KEYS.CLASS_RESULTS),
        levelDefinitions: dataStore.getDataset(SL_DATA_KEYS.LEVEL_DEFINITIONS),
    });

    // One table per section: the school first, then one per class in payload order.
    return FakeTabulator.instances.map((table) =>
        Object.fromEntries(
            table.config.data
                .filter((row) => row.type !== 'self-efficacy-footer')
                .map((row) => [row.subjectName, row.anzahlSus]),
        ),
    );
}

describe('SlClassTableModule headcount', () => {
    it("reads a single-Domäne row's headcount from the class row's total", async () => {
        const [school, class8a, class8b] = await renderTables();

        expect(class8a.Deutsch).toBe(25);
        expect(class8b.Deutsch).toBe(20);
        // The school section sums the class rows, as the domain table's school row does.
        expect(school.Deutsch).toBe(45);
    });

    it('counts the distinct students of a subject split into Domänen', async () => {
        const [school, class8a, class8b] = await renderTables();

        expect(class8a.Englisch).toBe(2);
        expect(class8b.Englisch).toBe(1);
        // 8a's s1 and 8b's s1 are two children.
        expect(school.Englisch).toBe(3);
    });
});

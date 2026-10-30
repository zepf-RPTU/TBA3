// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlDomainTableModule } from '../../../../src/sl/modules/tables/slDomainTableModule.js';
import {
    FakeTabulator,
    resetFakeTabulator,
    stubCanvasTextMeasurement,
} from '../../../support/tableHarness.js';
import { required } from '../../../support/required.js';
import { competenceValueGroup, studentValueGroup } from '../../../support/slValueGroupFactories.js';
import { columnFunction, createFakeCell } from '../../../support/tabulatorFakes.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

vi.mock('../../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

stubCanvasTextMeasurement();

// The Merkmale cells: the school row shows a share, a group row a headcount. The rows
// hold the headcount and the cell formats it, so the CSV, which Tabulator writes from
// the rows, carries a number and not the screen's text.

/**
 * A Deutsch student of a group, with or without the trait `mig`.
 * @param {string} id
 * @param {string} groupName
 * @param {boolean} hasTrait
 * @returns {import('../../../support/competenceLevelGroups.js').StudentLevelsValueGroup}
 */
function student(id, groupName, hasTrait) {
    const valueGroup = studentValueGroup({ id, groupName, subject: 'Deutsch', level: 'II' });
    return {
        ...valueGroup,
        covariates: [
            ...valueGroup.covariates,
            ...(hasTrait ? [{ type: 'trait', value: 'mig' }] : []),
        ],
    };
}

const COMPETENCE_LEVELS = [
    competenceValueGroup({
        id: 'g8a',
        type: 'group',
        name: '8a',
        subject: 'Deutsch',
        levels: { II: 3, III: 1 },
    }),
    competenceValueGroup({
        id: 'g8b',
        type: 'group',
        name: '8b',
        subject: 'Deutsch',
        levels: { II: 2, III: 2 },
    }),
];

const STUDENTS = [
    student('s1', '8a', true),
    student('s2', '8a', false),
    student('s3', '8b', false),
];

/** @type {SlDomainTableModule|null} */
let module = null;

beforeEach(() => {
    resetFakeTabulator();
});

afterEach(() => {
    module?.remove();
    module = null;
});

/** @returns {Promise<FakeTabulator>} The table, once built. */
async function renderTable() {
    module = SlDomainTableModule.create('domain-table', {
        glossaryKey: 'sl.details.subject-view.table',
        context: await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': COMPETENCE_LEVELS,
                'students-competence-levels.json': STUDENTS,
            },
        }),
    });
    document.body.append(module);
    await vi.waitFor(() => expect(FakeTabulator.instances).toHaveLength(1));
    return required(FakeTabulator.instances[0]);
}

describe('SlDomainTableModule Merkmale', () => {
    it('stores headcounts and shows the school row as a share, a group row as a count', async () => {
        const table = await renderTable();
        const rows = required(table.config.data);
        const school = required(rows.find((row) => row.type === 'school'));
        const group8a = required(rows.find((row) => row.groupName === '8a'));
        const traitColumn = required(table.config.columns)
            .flatMap((column) => column.columns ?? [column])
            .find((column) => column.field === 'trait_mig');
        const format = columnFunction(traitColumn, 'formatter');
        /**
         * @param {{[field: string]: any}} row
         * @returns {string|null} The cell's text.
         */
        const cellText = (row) => {
            const content = format(createFakeCell(row.trait_mig, row), {}, () => {});
            return typeof content === 'string' ? content : content.textContent;
        };

        // The school row is the sum of its groups: 8 students, one of them with the trait.
        expect(school.studentCount).toBe(8);
        expect(school.trait_mig).toBe(1);
        expect(group8a.trait_mig).toBe(1);
        expect(cellText(school)).toBe('12,5\u00a0%');
        expect(cellText(group8a)).toBe('1');
    });

    it("exports each row's trait share beside its count", async () => {
        const table = await renderTable();
        const rows = required(table.config.data);
        const school = required(rows.find((row) => row.type === 'school'));
        const group8a = required(rows.find((row) => row.groupName === '8a'));
        const shareColumn = required(
            required(table.config.columns).find((column) => column.field === 'traitShare_mig'),
        );
        const accessor = columnFunction(shareColumn, 'accessorDownload');
        /**
         * @param {{[field: string]: any}} row
         * @returns {unknown} The cell the CSV writes.
         */
        const share = (row) => accessor(undefined, row, 'download', {});

        expect(shareColumn.title).toBe('MIG (%)');
        expect(share(school)).toBe('12,5');
        expect(share(group8a)).toBe('25');
        // A delivered comparison row has no headcounts: blank, not 0.
        expect(share({ trait_mig: undefined })).toBe('');
    });

    it('exports a trait share only while its trait column shows, as the CSV mirrors the table', async () => {
        const table = await renderTable();
        const shareColumn = required(
            required(table.config.columns).find((column) => column.field === 'traitShare_mig'),
        );
        const { download } = shareColumn;
        if (typeof download !== 'function') throw new Error('Expected a download function');
        // `createDownloadColumn`'s function reads only the table it is called on.
        const followsColumn = /** @type {(this: unknown) => unknown} */ (download);
        /**
         * @param {boolean} shown - Whether the trait's count column shows.
         * @returns {unknown} What Tabulator reads off the column's `download`.
         */
        const exported = (shown) =>
            followsColumn.call(
                /** @type {any} */ ({
                    getColumn: (/** @type {string} */ field) =>
                        field === 'trait_mig' ? { isVisible: () => shown } : null,
                }),
            );

        expect(exported(true)).toBe(true);
        expect(exported(false)).toBe(false);
    });
});

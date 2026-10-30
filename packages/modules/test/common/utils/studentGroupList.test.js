// @vitest-browser
import { describe, expect, it } from 'vitest';
import { render } from 'lit';
import { studentGroupListTemplate } from '../../../src/common/utils/studentGroupList.js';
import { createTestContext } from '../../support/glossaryFixture.js';

/**
 * The group toggle a reader sees as "<label> (<count>)".
 * @param {HTMLElement} host
 * @param {string} label
 * @returns {HTMLButtonElement|undefined}
 */
const groupButton = (host, label) =>
    [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.trim().startsWith(`${label} (`),
    );

/**
 * @param {string} id
 * @param {number} size - How many students it holds.
 * @returns {import('../../../src/common/utils/studentGroupList.js').StudentGroup}
 */
const group = (id, size) => ({
    id,
    label: id,
    heading: `${id} heading`,
    emptyText: `${id} empty`,
    members: Array.from({ length: size }, (_, index) => ({
        student: { studentId: `${id}-${index}`, firstName: String(index), lastName: id },
    })),
});

describe('the group shown unasked', () => {
    // The smaller group names the exceptions: few solvers are worth naming, so are the
    // few who still need help.
    it.each([
        [3, 25, 'a'],
        [25, 3, 'b'],
        [14, 14, 'a'],
        [0, 0, 'a'],
    ])('with %i and %i students is %s', (sizeA, sizeB, expected) => {
        const host = document.createElement('div');
        render(
            studentGroupListTemplate(createTestContext('en').glossary, {
                groups: [group('a', sizeA), group('b', sizeB)],
                noDataText: 'no data',
                activeId: null,
                onGroup: () => {},
                onStudent: () => {},
            }),
            host,
        );

        expect(groupButton(host, expected)?.getAttribute('aria-pressed')).toBe('true');
    });
});

describe('studentGroupListTemplate', () => {
    it('lists the active group, flags a name with *, and hands clicks back', () => {
        const host = document.createElement('div');
        /** @type {string[]} */
        const clicks = [];
        const flagged = group('a', 1);
        flagged.members[0].flagged = true;
        render(
            studentGroupListTemplate(createTestContext('en').glossary, {
                groups: [flagged, group('b', 2)],
                noDataText: 'no data',
                flag: 'nicht bearbeitet',
                activeId: null,
                onGroup: (id) => clicks.push(`group:${id}`),
                onStudent: (id) => clicks.push(`student:${id}`),
            }),
            host,
        );

        const name = /** @type {HTMLElement} */ (host.querySelector('.detail-student-name'));
        expect(host.querySelector('h4')?.textContent).toBe('a heading');
        // "Nachname, Vorname", as every student list names a student.
        expect(name.querySelector('span')?.textContent).toBe('a, 0');
        expect(name.getAttribute('aria-label')).toContain('(nicht bearbeitet)');
        expect(host.querySelector('.detail-student-legend')?.textContent).toBe(
            '* nicht bearbeitet',
        );

        name.click();
        groupButton(host, 'b')?.click();
        expect(clicks).toEqual(['student:a-0', 'group:b']);
    });

    it('says the empty text instead of an empty list', () => {
        const host = document.createElement('div');
        render(
            studentGroupListTemplate(createTestContext('en').glossary, {
                groups: [group('a', 0), group('b', 2)],
                noDataText: 'no data',
                activeId: 'a',
                onGroup: () => {},
                onStudent: () => {},
            }),
            host,
        );

        expect(host.querySelector('.empty-message')?.textContent).toBe('a empty');
    });

    it('says the no-data text in either group while both are empty', () => {
        const host = document.createElement('div');
        for (const activeId of ['a', 'b']) {
            render(
                studentGroupListTemplate(createTestContext('en').glossary, {
                    groups: [group('a', 0), group('b', 0)],
                    noDataText: 'no data',
                    activeId,
                    onGroup: () => {},
                    onStudent: () => {},
                }),
                host,
            );
            expect(host.querySelector('.empty-message')?.textContent).toBe('no data');
        }
    });
});
